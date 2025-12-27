//
//  LlamaContextWrapper.mm
//  PocketPal
//
//  Objective-C++ wrapper for rnllama::llama_rn_context to use in Swift
//

#import "LlamaContextWrapper.h"

// Import the C++ headers from the rnllama framework
#include <rnllama/rn-llama.h>
#include <rnllama/rn-completion.h>
#include <rnllama/chat.h>
#include <rnllama/common.h>

#include <string>
#include <vector>
#include <memory>

@interface LlamaContextWrapper () {
    std::unique_ptr<rnllama::llama_rn_context> _context;
}
@end

@implementation LlamaContextWrapper

- (nullable instancetype)initWithModelPath:(NSString *)modelPath
                                parameters:(NSDictionary *)params
                                onProgress:(void (^)(NSUInteger progress))progressCallback
                                     error:(NSError **)error {
    self = [super init];
    if (self) {
        // Create and configure common_params
        common_params contextParams;
        contextParams.model.path = [modelPath UTF8String];

        // Set context size
        if (params[@"n_ctx"]) {
            contextParams.n_ctx = [params[@"n_ctx"] intValue];
        }

        // Set number of threads
        if (params[@"n_threads"]) {
            contextParams.cpuparams.n_threads = [params[@"n_threads"] intValue];
        }

        // Set GPU layers
        if (params[@"n_gpu_layers"]) {
            contextParams.n_gpu_layers = [params[@"n_gpu_layers"] intValue];
        }

        // Set flash attention
        if (params[@"flash_attn"]) {
            contextParams.flash_attn_type = [params[@"flash_attn"] boolValue]
                ? LLAMA_FLASH_ATTN_TYPE_ENABLED
                : LLAMA_FLASH_ATTN_TYPE_DISABLED;
        }

        // Set up progress callback using the params struct
        __block void (^progressBlock)(NSUInteger) = progressCallback;
        if (progressBlock) {
            contextParams.progress_callback = [](float progress, void *user_data) -> bool {
                void (^callback)(NSUInteger) = (__bridge void (^)(NSUInteger))user_data;
                if (callback) {
                    callback((NSUInteger)(progress * 100));
                }
                return true; // Continue loading
            };
            contextParams.progress_callback_user_data = (__bridge void *)progressBlock;
        }

        // Create the context
        _context = std::make_unique<rnllama::llama_rn_context>();

        bool loaded = _context->loadModel(contextParams);

        if (!loaded || _context->model == nullptr) {
            if (error) {
                *error = [NSError errorWithDomain:@"LlamaContextWrapper"
                                             code:1001
                                         userInfo:@{NSLocalizedDescriptionKey: @"Failed to load model"}];
            }
            _context.reset();
            return nil;
        }
    }
    return self;
}

- (BOOL)isModelLoaded {
    return _context != nullptr && _context->model != nullptr;
}

- (nullable NSDictionary *)completionWithParams:(NSDictionary *)params
                                        onToken:(void (^)(NSString *token))tokenCallback
                                          error:(NSError **)error {
    if (!_context || !_context->model) {
        if (error) {
            *error = [NSError errorWithDomain:@"LlamaContextWrapper"
                                         code:1002
                                     userInfo:@{NSLocalizedDescriptionKey: @"No context loaded"}];
        }
        return nil;
    }

    // Ensure completion context exists
    if (!_context->completion) {
        _context->completion = new rnllama::llama_rn_context_completion(_context.get());
    }

    auto completion = _context->completion;

    // Get the prompt
    NSString *prompt = params[@"prompt"];
    if (!prompt) {
        if (error) {
            *error = [NSError errorWithDomain:@"LlamaContextWrapper"
                                         code:1003
                                     userInfo:@{NSLocalizedDescriptionKey: @"No prompt provided"}];
        }
        return nil;
    }

    // Configure sampling parameters
    _context->params.prompt = [prompt UTF8String];

    if (params[@"n_predict"]) {
        _context->params.n_predict = [params[@"n_predict"] intValue];
    }

    if (params[@"temperature"]) {
        _context->params.sampling.temp = [params[@"temperature"] floatValue];
    }

    if (params[@"top_k"]) {
        _context->params.sampling.top_k = [params[@"top_k"] intValue];
    }

    if (params[@"top_p"]) {
        _context->params.sampling.top_p = [params[@"top_p"] floatValue];
    }

    if (params[@"min_p"]) {
        _context->params.sampling.min_p = [params[@"min_p"] floatValue];
    }

    if (params[@"seed"]) {
        _context->params.sampling.seed = [params[@"seed"] unsignedIntValue];
    }

    // Set up stop words
    _context->params.antiprompt.clear();
    if (params[@"stop"]) {
        NSArray *stopWords = params[@"stop"];
        for (NSString *stopWord in stopWords) {
            _context->params.antiprompt.push_back([stopWord UTF8String]);
        }
    }

    // Initialize sampling
    if (!completion->initSampling()) {
        if (error) {
            *error = [NSError errorWithDomain:@"LlamaContextWrapper"
                                         code:1004
                                     userInfo:@{NSLocalizedDescriptionKey: @"Failed to initialize sampling"}];
        }
        return nil;
    }

    // Tokenize and load prompt
    std::vector<std::string> emptyMediaPaths;
    completion->loadPrompt(emptyMediaPaths);

    // Begin completion
    completion->beginCompletion();

    // Generate tokens
    std::string resultText;

    while (completion->has_next_token) {
        auto tokenOutput = completion->doCompletion();

        if (!tokenOutput.text.empty()) {
            resultText += tokenOutput.text;

            if (tokenCallback) {
                NSString *tokenStr = [NSString stringWithUTF8String:tokenOutput.text.c_str()];
                tokenCallback(tokenStr);
            }
        }

        // Check for stop conditions
        if (completion->stopped_eos || completion->stopped_word || completion->stopped_limit) {
            break;
        }
    }

    completion->endCompletion();

    // Build result dictionary
    NSMutableDictionary *result = [NSMutableDictionary dictionary];
    result[@"text"] = [NSString stringWithUTF8String:resultText.c_str()];
    result[@"tokens_predicted"] = @(completion->num_tokens_predicted);
    result[@"tokens_evaluated"] = @(completion->num_prompt_tokens);
    result[@"stopped_eos"] = @(completion->stopped_eos);
    result[@"stopped_word"] = @(completion->stopped_word);
    result[@"stopped_limit"] = @(completion->stopped_limit);

    if (completion->stopped_word && !completion->stopping_word.empty()) {
        result[@"stopping_word"] = [NSString stringWithUTF8String:completion->stopping_word.c_str()];
    }

    return result;
}

- (NSString *)getFormattedChat:(NSString *)messages
              withChatTemplate:(nullable NSString *)chatTemplate {
    if (!_context || !_context->model) {
        return @"";
    }

    std::string messagesStr = [messages UTF8String];
    std::string templateStr = chatTemplate ? [chatTemplate UTF8String] : "";

    std::string result = _context->getFormattedChat(messagesStr, templateStr);

    return [NSString stringWithUTF8String:result.c_str()];
}

- (NSDictionary *)getFormattedChatWithJinja:(NSString *)messages
                           withChatTemplate:(nullable NSString *)chatTemplate
                          withEnableThinking:(BOOL)enableThinking {
    if (!_context || !_context->model) {
        return @{};
    }

    std::string messagesStr = [messages UTF8String];
    std::string templateStr = chatTemplate ? [chatTemplate UTF8String] : "";

    common_chat_params chatParams = _context->getFormattedChatWithJinja(
        messagesStr,
        templateStr,
        "",     // json_schema
        "",     // tools
        false,  // parallel_tool_calls
        "",     // tool_choice
        enableThinking,
        true,   // add_generation_prompt
        "",     // now_str
        {}      // chat_template_kwargs
    );

    NSMutableDictionary *result = [NSMutableDictionary dictionary];
    result[@"prompt"] = [NSString stringWithUTF8String:chatParams.prompt.c_str()];

    // Convert additional stops
    NSMutableArray *stops = [NSMutableArray array];
    for (const auto &stop : chatParams.additional_stops) {
        [stops addObject:[NSString stringWithUTF8String:stop.c_str()]];
    }
    result[@"additional_stops"] = stops;

    result[@"chat_format"] = @(static_cast<int>(chatParams.format));

    if (!chatParams.grammar.empty()) {
        result[@"grammar"] = [NSString stringWithUTF8String:chatParams.grammar.c_str()];
    }

    return result;
}

- (int)saveSession:(NSString *)path size:(int)size {
    if (!_context || !_context->completion) {
        return 0;
    }

    // Note: Session save/load functionality needs to be checked against the new API
    // For now, return 0 as this feature may need reimplementation
    return 0;
}

- (NSDictionary *)loadSession:(NSString *)path {
    if (!_context || !_context->completion) {
        return @{@"tokens_loaded": @0, @"prompt": @""};
    }

    // Note: Session save/load functionality needs to be checked against the new API
    // For now, return empty result as this feature may need reimplementation
    return @{@"tokens_loaded": @0, @"prompt": @""};
}

- (void)invalidate {
    if (_context) {
        if (_context->completion) {
            delete _context->completion;
            _context->completion = nullptr;
        }
        _context.reset();
    }
}

- (void)dealloc {
    [self invalidate];
}

@end
