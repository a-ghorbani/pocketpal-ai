#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>
#import <Metal/Metal.h>

@interface HardwareInfoModule : NSObject <RCTBridgeModule>
@end

@implementation HardwareInfoModule

RCT_EXPORT_MODULE(HardwareInfo)

RCT_EXPORT_METHOD(getCPUInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    NSUInteger numberOfCPUCores = [[NSProcessInfo processInfo] activeProcessorCount];

    NSDictionary *result = @{
      @"cores": @(numberOfCPUCores)
    };

    resolve(result);
  } @catch (NSException *exception) {
    reject(@"error_getting_cpu_info", @"Could not retrieve CPU info", nil);
  }
}

RCT_EXPORT_METHOD(getGPUInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    id<MTLDevice> device = MTLCreateSystemDefaultDevice();

    NSString *gpuName = device ? device.name : @"Unknown";
    NSString *gpuType = @"Apple GPU (Metal)";
    BOOL supportsMetal = device != nil;

    NSDictionary *result = @{
      @"renderer": gpuName,
      @"vendor": @"Apple",
      @"version": @"Metal",
      @"hasAdreno": @NO,
      @"hasMali": @NO,
      @"hasPowerVR": @NO,
      @"supportsOpenCL": @NO,  // iOS uses Metal, not OpenCL
      @"gpuType": gpuType
    };

    resolve(result);
  } @catch (NSException *exception) {
    reject(@"error_getting_gpu_info", @"Could not retrieve GPU info", nil);
  }
}

// Don't synthesize default module since we want to use the custom name
+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end

