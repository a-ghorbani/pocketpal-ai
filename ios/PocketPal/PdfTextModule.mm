#import <Foundation/Foundation.h>
#import <PDFKit/PDFKit.h>
#import <React/RCTBridgeModule.h>

@interface PdfTextModule : NSObject <RCTBridgeModule>
@end

@implementation PdfTextModule

RCT_EXPORT_MODULE(PdfTextModule)

RCT_EXPORT_METHOD(extractPages:(NSString *)path
                  from:(double)from
                  to:(double)to
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @autoreleasepool {
      NSURL *url = [path hasPrefix:@"file://"] ? [NSURL URLWithString:path]
                                               : [NSURL fileURLWithPath:path];
      PDFDocument *document = [[PDFDocument alloc] initWithURL:url];
      if (document == nil) {
        reject(@"E_PDF_UNREADABLE", @"The PDF could not be opened", nil);
        return;
      }
      if (document.isLocked) {
        reject(@"E_PDF_ENCRYPTED", @"The PDF is password protected", nil);
        return;
      }
      NSInteger pageCount = document.pageCount;
      NSInteger first = MAX(1, (NSInteger)from);
      NSInteger last = MIN(pageCount, (NSInteger)to);
      NSMutableArray<NSString *> *pages = [NSMutableArray array];
      for (NSInteger index = first; index <= last; index++) {
        @autoreleasepool {
          PDFPage *page = [document pageAtIndex:index - 1];
          [pages addObject:page.string ?: @""];
        }
      }
      resolve(@{@"pageCount" : @(pageCount), @"pages" : pages});
    }
  });
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
