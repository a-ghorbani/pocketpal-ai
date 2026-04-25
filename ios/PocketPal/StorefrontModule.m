//
//  StorefrontModule.m
//  PocketPal
//
//  Objective-C bridge for StorefrontModule
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(StorefrontModule, NSObject)

RCT_EXTERN_METHOD(getCountryCode:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
