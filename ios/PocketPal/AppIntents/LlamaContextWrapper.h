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

/// Release the context
- (void)invalidate;

@end

NS_ASSUME_NONNULL_END

