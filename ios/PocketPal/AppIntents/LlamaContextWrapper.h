//
//  LlamaContextWrapper.h
//  PocketPal
//
//  Objective-C wrapper for RNLlamaContext to use in Swift
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface LlamaContextWrapper : NSObject

/// Initialize with model path and parameters
/// @param modelPath Path to the model file
/// @param params Model parameters (n_ctx, n_threads, etc.)
/// @param progressCallback Called with loading progress (0-100)
/// @param error Error pointer for initialization failures
/// @return Initialized wrapper or nil on error
- (nullable instancetype)initWithModelPath:(NSString *)modelPath
                                parameters:(NSDictionary *)params
                                onProgress:(nullable void (^)(NSUInteger progress))progressCallback
                                     error:(NSError **)error;

/// Check if model is loaded
- (BOOL)isModelLoaded;

/// Run completion with parameters
/// @param params Completion parameters (prompt, temperature, etc.)
/// @param tokenCallback Called for each generated token
/// @param error Error pointer for inference failures
/// @return Result dictionary with "text" key, or nil on error
- (nullable NSDictionary *)completionWithParams:(NSDictionary *)params
                                        onToken:(nullable void (^)(NSString *token))tokenCallback
                                          error:(NSError **)error;

/// Format chat messages using model's chat template
/// @param messages JSON string of messages array
/// @param chatTemplate Optional custom chat template (pass nil or empty string to use model's default)
/// @return Formatted prompt string
- (NSString *)getFormattedChat:(NSString *)messages
              withChatTemplate:(nullable NSString *)chatTemplate;

/// Format chat messages using Jinja templating with full result
/// @param messages JSON string of messages array
/// @param chatTemplate Optional custom chat template (pass nil or empty string to use model's default)
/// @param enableThinking Whether to enable thinking mode
/// @return Dictionary with prompt, additional_stops, chat_format, grammar, etc.
- (NSDictionary *)getFormattedChatWithJinja:(NSString *)messages
                           withChatTemplate:(nullable NSString *)chatTemplate
                          withEnableThinking:(BOOL)enableThinking;

/// Save KV cache session to file
/// @param path File path to save session
/// @param size Number of tokens to save (pass -1 to save all)
/// @return Number of tokens saved
- (int)saveSession:(NSString *)path size:(int)size;

/// Load KV cache session from file
/// @param path File path to load session from
/// @return Dictionary with 'tokens_loaded' (number) and 'prompt' (string)
- (NSDictionary *)loadSession:(NSString *)path;

/// Release the context
- (void)invalidate;

@end

NS_ASSUME_NONNULL_END

