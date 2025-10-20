//
//  DeepLinkModule.m
//  PocketPal
//
//  Objective-C bridge for DeepLinkModule
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(DeepLinkModule, RCTEventEmitter)

RCT_EXTERN_METHOD(getInitialURL:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

