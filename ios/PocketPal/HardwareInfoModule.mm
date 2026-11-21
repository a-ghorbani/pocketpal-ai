#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>
#import <Metal/Metal.h>
#import <os/proc.h>
#import <mach/mach.h>
#import <ifaddrs.h>
#import <arpa/inet.h>
#import <sys/sysctl.h>
#import <sys/time.h>
#import <fcntl.h>

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

// iOS has no userspace allocator-purge equivalent (the system manages
// page reclamation). Resolved as a no-op so callers don't need a
// platform check; matches the Android contract on devices where the
// bionic symbol is unavailable.
RCT_EXPORT_METHOD(purgeNativeAllocator:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@{
    @"purged": @NO,
    @"rss_kb_before": @0,
    @"rss_kb_after": @0,
  });
}

RCT_EXPORT_METHOD(getWifiIPv4:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  struct ifaddrs *interfaces = NULL;
  if (getifaddrs(&interfaces) != 0) {
    resolve([NSNull null]);
    return;
  }
  NSString *en0Address = nil;
  NSString *en1Address = nil;
  for (struct ifaddrs *entry = interfaces; entry != NULL; entry = entry->ifa_next) {
    if (entry->ifa_addr == NULL || entry->ifa_addr->sa_family != AF_INET) {
      continue;
    }
    const struct sockaddr_in *address = (const struct sockaddr_in *)entry->ifa_addr;
    if ((ntohl(address->sin_addr.s_addr) >> 16) == 0xA9FE) {
      continue;
    }
    NSString *name = [NSString stringWithUTF8String:entry->ifa_name];
    BOOL isEn0 = en0Address == nil && [name isEqualToString:@"en0"];
    BOOL isEn1 = en1Address == nil && [name isEqualToString:@"en1"];
    if (!isEn0 && !isEn1) {
      continue;
    }
    char text[INET_ADDRSTRLEN];
    if (inet_ntop(AF_INET, &address->sin_addr, text, INET_ADDRSTRLEN) == NULL) {
      continue;
    }
    if (isEn0) {
      en0Address = [NSString stringWithUTF8String:text];
    } else {
      en1Address = [NSString stringWithUTF8String:text];
    }
  }
  freeifaddrs(interfaces);
  resolve(en0Address ?: en1Address ?: (id)[NSNull null]);
}

// Spike: memory flight recorder. write(2) per line, so the last sample before a jetsam kill
// survives the process.
static int gRecFd = -1;
static NSString *gRecPath = nil;
static NSString *gRecLabel = @"start";
static dispatch_queue_t gRecQueue;
static dispatch_source_t gRecTimer;
static dispatch_source_t gRecPressure;
static volatile long gRecPressureLevel = 0;
static volatile long gRecWarnings = 0;

static void recSample(void)
{
  if (gRecFd < 0) return;
  task_vm_info_data_t vmInfo;
  mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
  kern_return_t kr = task_info(mach_task_self(), TASK_VM_INFO, (task_info_t)&vmInfo, &count);
  uint64_t footprint = kr == KERN_SUCCESS ? vmInfo.phys_footprint : 0;
  uint64_t resident = kr == KERN_SUCCESS ? vmInfo.resident_size : 0;
  uint64_t compressed = kr == KERN_SUCCESS ? vmInfo.compressed : 0;
  uint64_t limit = kr == KERN_SUCCESS && count >= TASK_VM_INFO_REV4_COUNT ? vmInfo.limit_bytes_remaining : 0;
  uint64_t available = os_proc_available_memory();

  vm_statistics64_data_t vmStat;
  mach_msg_type_number_t hcount = HOST_VM_INFO64_COUNT;
  uint64_t freeBytes = 0;
  if (host_statistics64(mach_host_self(), HOST_VM_INFO64, (host_info64_t)&vmStat, &hcount) == KERN_SUCCESS) {
    freeBytes = (uint64_t)vmStat.free_count * vm_page_size;
  }
  int level = -1;
  size_t len = sizeof(level);
  if (sysctlbyname("kern.memorystatus_level", &level, &len, NULL, 0) != 0) level = -1;

  struct timeval tv;
  gettimeofday(&tv, NULL);
  long long wallMs = (long long)tv.tv_sec * 1000 + tv.tv_usec / 1000;
  NSString *line = [NSString stringWithFormat:@"%lld\t%@\t%llu\t%llu\t%llu\t%llu\t%llu\t%llu\t%d\t%ld\t%ld\n",
                    wallMs, gRecLabel, footprint / 1024, resident / 1024, compressed / 1024,
                    available / 1024, limit / 1024, freeBytes / 1024, level,
                    gRecPressureLevel, gRecWarnings];
  NSData *data = [line dataUsingEncoding:NSUTF8StringEncoding];
  write(gRecFd, data.bytes, data.length);
}

RCT_EXPORT_METHOD(startMemoryRecorder:(double)intervalMs
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    gRecQueue = dispatch_queue_create("com.pocketpal.memrec", DISPATCH_QUEUE_SERIAL);
    NSString *docs = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
    long long now = (long long)([[NSDate date] timeIntervalSince1970] * 1000);
    gRecPath = [docs stringByAppendingPathComponent:[NSString stringWithFormat:@"memrec-%lld.tsv", now]];
    gRecFd = open(gRecPath.UTF8String, O_WRONLY | O_CREAT | O_APPEND, 0644);
    const char *header = "wall_ms\tlabel\tfootprint_kb\tresident_kb\tcompressed_kb\tproc_avail_kb\tlimit_remaining_kb\tsys_free_kb\tmemorystatus_level\tpressure\twarnings\n";
    if (gRecFd >= 0) write(gRecFd, header, strlen(header));

    gRecPressure = dispatch_source_create(DISPATCH_SOURCE_TYPE_MEMORYPRESSURE, 0,
                                          DISPATCH_MEMORYPRESSURE_NORMAL | DISPATCH_MEMORYPRESSURE_WARN | DISPATCH_MEMORYPRESSURE_CRITICAL,
                                          gRecQueue);
    dispatch_source_set_event_handler(gRecPressure, ^{
      gRecPressureLevel = (long)dispatch_source_get_data(gRecPressure);
      recSample();
    });
    dispatch_resume(gRecPressure);

    [[NSNotificationCenter defaultCenter] addObserverForName:UIApplicationDidReceiveMemoryWarningNotification
                                                      object:nil
                                                       queue:nil
                                                  usingBlock:^(NSNotification *note) {
      gRecWarnings++;
      dispatch_async(gRecQueue, ^{ recSample(); });
    }];

    gRecTimer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, gRecQueue);
    uint64_t interval = (uint64_t)(intervalMs * NSEC_PER_MSEC);
    dispatch_source_set_timer(gRecTimer, dispatch_time(DISPATCH_TIME_NOW, 0), interval, interval / 10);
    dispatch_source_set_event_handler(gRecTimer, ^{ recSample(); });
    dispatch_resume(gRecTimer);
  });
  resolve(gRecPath ?: @"");
}

RCT_EXPORT_METHOD(markMemoryRecorder:(NSString *)label)
{
  NSString *clean = [[label stringByReplacingOccurrencesOfString:@"\t" withString:@" "]
                     stringByReplacingOccurrencesOfString:@"\n" withString:@" "];
  if (gRecQueue == nil) return;
  dispatch_async(gRecQueue, ^{
    gRecLabel = clean;
    recSample();
  });
}

// Don't synthesize default module since we want to use the custom name
+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end

