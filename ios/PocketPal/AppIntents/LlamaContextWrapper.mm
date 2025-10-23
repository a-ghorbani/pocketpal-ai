//
//  LlamaContextWrapper.mm
//  PocketPal
//
//  Objective-C wrapper for RNLlamaContext to use in Swift
//

#import "LlamaContextWrapper.h"

// Import the C++ header only in the .mm file
#if __has_include(<llama-rn/RNLlamaContext.h>)
#import <llama-rn/RNLlamaContext.h>
#elif __has_include("RNLlamaContext.h")
#import "RNLlamaContext.h"
#endif

@interface LlamaContextWrapper ()
@property (nonatomic, strong) RNLlamaContext *context;
@end

@implementation LlamaContextWrapper

- (nullable instancetype)initWithModelPath:(NSString *)modelPath
                                parameters:(NSDictionary *)params
                                onProgress:(void (^)(NSUInteger progress))progressCallback
                                     error:(NSError **)error {
    self = [super init];
    if (self) {
        // Create parameters dictionary
        NSMutableDictionary *contextParams = [params mutableCopy] ?: [NSMutableDictionary dictionary];
        contextParams[@"model"] = modelPath;
        
        // Initialize context
        _context = [RNLlamaContext initWithParams:contextParams onProgress:^(unsigned int progress) {
            if (progressCallback) {
                progressCallback((NSUInteger)progress);
            }
        }];
        
        if (!_context || ![_context isModelLoaded]) {
            if (error) {
                *error = [NSError errorWithDomain:@"LlamaContextWrapper"
                                             code:1001
                                         userInfo:@{NSLocalizedDescriptionKey: @"Failed to load model"}];
            }
            return nil;
        }
    }
    return self;
}

- (BOOL)isModelLoaded {
    return _context && [_context isModelLoaded];
}

- (nullable NSDictionary *)completionWithParams:(NSDictionary *)params
                                        onToken:(void (^)(NSString *token))tokenCallback
                                          error:(NSError **)error {
    if (!_context) {
        if (error) {
            *error = [NSError errorWithDomain:@"LlamaContextWrapper"
                                         code:1002
                                     userInfo:@{NSLocalizedDescriptionKey: @"No context loaded"}];
        }
        return nil;
    }
    
    // Run completion
    NSDictionary *result = [_context completion:params onToken:^(NSMutableDictionary *tokenResult) {
        if (tokenCallback && tokenResult[@"token"]) {
            tokenCallback(tokenResult[@"token"]);
        }
    }];
    
    // Check for errors
    if (result[@"error"]) {
        if (error) {
            *error = [NSError errorWithDomain:@"LlamaContextWrapper"
                                         code:1003
                                     userInfo:@{NSLocalizedDescriptionKey: result[@"error"]}];
        }
        return nil;
    }
    
    return result;
}

- (NSString *)getFormattedChat:(NSString *)messages
              withChatTemplate:(nullable NSString *)chatTemplate {
    // Simply pass through to RNLlamaContext
    return [_context getFormattedChat:messages withChatTemplate:chatTemplate];
}

- (NSDictionary *)getFormattedChatWithJinja:(NSString *)messages
                           withChatTemplate:(nullable NSString *)chatTemplate
                          withEnableThinking:(BOOL)enableThinking {
    // Call RNLlamaContext's getFormattedChatWithJinja with full parameters
    // Note: In Swift, this method is auto-renamed to getFormattedChat(withJinja:...)
    return [_context getFormattedChatWithJinja:messages
                              withChatTemplate:chatTemplate
                                withJsonSchema:nil
                                     withTools:nil
                         withParallelToolCalls:NO
                                withToolChoice:nil
                            withEnableThinking:enableThinking
                       withAddGenerationPrompt:YES
                                       withNow:nil
                        withChatTemplateKwargs:nil];
}

- (int)saveSession:(NSString *)path size:(int)size {
    // Simply pass through to RNLlamaContext
    return [_context saveSession:path size:size];
}

- (NSDictionary *)loadSession:(NSString *)path {
    // Simply pass through to RNLlamaContext
    return [_context loadSession:path];
}

- (void)invalidate {
    if (_context) {
        [_context invalidate];
        _context = nil;
    }
}

- (void)dealloc {
    [self invalidate];
}

@end

