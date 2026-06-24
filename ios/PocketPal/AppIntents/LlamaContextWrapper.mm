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

    // 1. REWIND - Reset all completion state (critical for sequential calls).
    // rewind() clears antiprompt, grammar, n_past, stopped_* flags, generated_text, etc.
    // Without this, the second completion (after session cache warm-up) inherits stale state.
    completion->rewind();

    // 2. SET ALL PARAMETERS (after rewind which clears antiprompt/grammar, before initSampling).
    // Note: the JSI path sets params BEFORE rewind(), which means antiprompt and grammar get
    // wiped by rewind(). We intentionally set params AFTER rewind() so stop words actually work.
    _context->params.prompt = [prompt UTF8String];

    if (params[@"n_predict"]) {
        _context->params.n_predict = [params[@"n_predict"] intValue];
    }

    // Sampling parameters - match JSIParams.cpp parseCompletionParams (lines 228-276)
    auto& sparams = _context->params.sampling;

    if (params[@"seed"]) {
        sparams.seed = [params[@"seed"] unsignedIntValue];
    }
    if (params[@"temperature"]) {
        sparams.temp = [params[@"temperature"] floatValue];
    }
    if (params[@"top_k"]) {
        sparams.top_k = [params[@"top_k"] intValue];
    }
    if (params[@"top_p"]) {
        sparams.top_p = [params[@"top_p"] floatValue];
    }
    if (params[@"min_p"]) {
        sparams.min_p = [params[@"min_p"] floatValue];
    }
    if (params[@"n_probs"]) {
        sparams.n_probs = [params[@"n_probs"] intValue];
    }
    if (params[@"penalty_last_n"]) {
        sparams.penalty_last_n = [params[@"penalty_last_n"] intValue];
    }
    if (params[@"penalty_repeat"]) {
        sparams.penalty_repeat = [params[@"penalty_repeat"] floatValue];
    }
    if (params[@"penalty_freq"]) {
        sparams.penalty_freq = [params[@"penalty_freq"] floatValue];
    }
    if (params[@"penalty_present"]) {
        sparams.penalty_present = [params[@"penalty_present"] floatValue];
    }
    if (params[@"mirostat"]) {
        sparams.mirostat = [params[@"mirostat"] intValue];
    }
    if (params[@"mirostat_tau"]) {
        sparams.mirostat_tau = [params[@"mirostat_tau"] floatValue];
    }
    if (params[@"mirostat_eta"]) {
        sparams.mirostat_eta = [params[@"mirostat_eta"] floatValue];
    }
    if (params[@"typical_p"]) {
        sparams.typ_p = [params[@"typical_p"] floatValue];
    }
    if (params[@"xtc_threshold"]) {
        sparams.xtc_threshold = [params[@"xtc_threshold"] floatValue];
    }
    if (params[@"xtc_probability"]) {
        sparams.xtc_probability = [params[@"xtc_probability"] floatValue];
    }
    if (params[@"ignore_eos"]) {
        sparams.ignore_eos = [params[@"ignore_eos"] boolValue];
    }

    // Set up stop words (after rewind which clears antiprompt)
    _context->params.antiprompt.clear();
    if (params[@"stop"]) {
        NSArray *stopWords = params[@"stop"];
        for (NSString *stopWord in stopWords) {
            _context->params.antiprompt.push_back([stopWord UTF8String]);
        }
    }

    // 3. INIT SAMPLING (creates sampler from the params we just set)
    if (!completion->initSampling()) {
        if (error) {
            *error = [NSError errorWithDomain:@"LlamaContextWrapper"
                                         code:1004
                                     userInfo:@{NSLocalizedDescriptionKey: @"Failed to initialize sampling"}];
        }
        return nil;
    }

    // 4. BEGIN COMPLETION (sets n_remain = n_predict, is_predicting = true)
    completion->beginCompletion();

    // 5. LOAD PROMPT (tokenizes prompt, feeds to sampler, sets has_next_token = true)
    std::vector<std::string> emptyMediaPaths;
    completion->loadPrompt(emptyMediaPaths);

    // 6. CHECK CONTEXT FULL (after loadPrompt, matching JSI at RNLlamaJSI.cpp:1021-1024)
    if (completion->context_full) {
        completion->endCompletion();
        if (error) {
            *error = [NSError errorWithDomain:@"LlamaContextWrapper"
                                         code:1005
                                     userInfo:@{NSLocalizedDescriptionKey: @"Context is full"}];
        }
        return nil;
    }

    // 7. TOKEN GENERATION LOOP (matching JSI at RNLlamaJSI.cpp:1028-1087)
    std::string resultText;
    size_t sent_count = 0;

    while (completion->has_next_token && !completion->is_interrupted) {
        const rnllama::completion_token_output tokenOutput = completion->doCompletion();

        // Skip invalid tokens and incomplete UTF-8 sequences (matching JSI behavior)
        if (tokenOutput.tok == -1 || completion->incomplete) {
            continue;
        }

        const std::string token_text = common_token_to_piece(_context->ctx, tokenOutput.tok);
        size_t pos = std::min(sent_count, completion->generated_text.size());
        const std::string str_test = completion->generated_text.substr(pos);

        // Check for stop words (critical: doCompletion does NOT check stop words internally,
        // this must be done by the caller, matching JSI behavior at RNLlamaJSI.cpp:1038-1048)
        bool is_stop_full = false;
        size_t stop_pos = completion->findStoppingStrings(str_test, token_text.size(), rnllama::STOP_FULL);
        if (stop_pos != std::string::npos) {
            is_stop_full = true;
            completion->generated_text.erase(
                completion->generated_text.begin() + pos + stop_pos,
                completion->generated_text.end());
            pos = std::min(sent_count, completion->generated_text.size());
        } else {
            stop_pos = completion->findStoppingStrings(str_test, token_text.size(), rnllama::STOP_PARTIAL);
        }

        if (stop_pos == std::string::npos ||
            (!completion->has_next_token && !is_stop_full && stop_pos > 0)) {
            const std::string to_send = completion->generated_text.substr(pos, std::string::npos);
            sent_count += to_send.size();
            resultText += to_send;

            if (tokenCallback && !to_send.empty()) {
                NSString *tokenStr = [NSString stringWithUTF8String:to_send.c_str()];
                tokenCallback(tokenStr);
            }
        }

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
        enableThinking ? "auto" : "none",  // reasoning_format
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
