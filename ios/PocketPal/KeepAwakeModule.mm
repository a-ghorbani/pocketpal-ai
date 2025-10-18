#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <React/RCTBridgeModule.h>

@interface KeepAwakeModule : NSObject <RCTBridgeModule>
@end

@implementation KeepAwakeModule

RCT_EXPORT_MODULE(KeepAwakeModule)

RCT_EXPORT_METHOD(activate)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[UIApplication sharedApplication] setIdleTimerDisabled:YES];
  });
}

RCT_EXPORT_METHOD(deactivate)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[UIApplication sharedApplication] setIdleTimerDisabled:NO];
  });
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end

