#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>
#import <Metal/Metal.h>
#import <os/proc.h>
#import <mach/mach.h>

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

RCT_EXPORT_METHOD(getAvailableMemory:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    // Get available memory using os_proc_available_memory()
    uint64_t availableMemory = os_proc_available_memory();

    if (availableMemory == 0) {
      reject(@"error_getting_available_memory", @"Could not retrieve available memory", nil);
      return;
    }

    resolve(@(availableMemory));
  } @catch (NSException *exception) {
    reject(@"error_getting_available_memory", @"Could not retrieve available memory", nil);
  }
}

RCT_EXPORT_METHOD(writeMemorySnapshot:(NSString *)label
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    task_vm_info_data_t vmInfo;
    mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
    kern_return_t result = task_info(mach_task_self(), TASK_VM_INFO,
                                     (task_info_t)&vmInfo, &count);
    uint64_t physFootprint = (result == KERN_SUCCESS) ? vmInfo.phys_footprint : 0;
    uint64_t residentSize = (result == KERN_SUCCESS) ? vmInfo.resident_size : 0;
    uint64_t internalMem = (result == KERN_SUCCESS) ? vmInfo.internal : 0;
    uint64_t compressedMem = (result == KERN_SUCCESS) ? vmInfo.compressed : 0;
    uint64_t availableMemory = os_proc_available_memory();

    // Metal GPU memory — use cached device to read the app's actual allocations
    static id<MTLDevice> metalDevice = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{ metalDevice = MTLCreateSystemDefaultDevice(); });
    uint64_t metalAllocated = metalDevice ? (uint64_t)metalDevice.currentAllocatedSize : 0;

    NSDictionary *snapshot = @{
      @"label": label,
      @"timestamp": [[NSISO8601DateFormatter new] stringFromDate:[NSDate date]],
      @"native": @{
        @"phys_footprint": @(physFootprint),
        @"resident_size": @(residentSize),
        @"internal": @(internalMem),
        @"compressed": @(compressedMem),
        @"metal_allocated": @(metalAllocated),
        @"available_memory": @(availableMemory),
      },
    };

    NSString *docsDir = NSSearchPathForDirectoriesInDomains(
      NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
    NSString *filePath = [docsDir stringByAppendingPathComponent:@"memory-snapshots.json"];

    NSMutableArray *snapshots = [NSMutableArray array];
    if ([[NSFileManager defaultManager] fileExistsAtPath:filePath]) {
      NSData *data = [NSData dataWithContentsOfFile:filePath];
      NSArray *existing = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
      if (existing) [snapshots addObjectsFromArray:existing];
    }
    [snapshots addObject:snapshot];

    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:snapshots
                                                      options:NSJSONWritingPrettyPrinted
                                                        error:nil];
    [jsonData writeToFile:filePath atomically:YES];

    resolve(@{@"label": label, @"status": @"written"});
  } @catch (NSException *exception) {
    reject(@"error_writing_memory_snapshot", @"Could not write memory snapshot", nil);
  }
}

// Don't synthesize default module since we want to use the custom name
+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end

