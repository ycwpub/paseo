#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>

@interface PaseoIslandPanel : NSPanel
@end

@implementation PaseoIslandPanel
- (BOOL)canBecomeKeyWindow {
  return NO;
}
- (BOOL)canBecomeMainWindow {
  return NO;
}
@end

@interface PaseoIslandHost : NSObject <WKScriptMessageHandler, WKNavigationDelegate>
@property(nonatomic, strong) PaseoIslandPanel *panel;
@property(nonatomic, strong) WKWebView *webView;
@property(nonatomic, strong) id pendingState;
@property(nonatomic, assign) BOOL webReady;
@property(nonatomic, assign) BOOL readyEmitted;
@end

@implementation PaseoIslandHost

- (void)handleMessage:(NSDictionary *)message {
  NSString *type = message[@"type"];
  if (![type isKindOfClass:[NSString class]]) return;

  if ([type isEqualToString:@"init"]) {
    NSString *html = message[@"html"];
    if ([html isKindOfClass:[NSString class]]) {
      [self createPanelIfNeededWithHTML:html];
    }
    return;
  }
  if ([type isEqualToString:@"state"]) {
    NSNumber *width = message[@"width"];
    NSNumber *height = message[@"height"];
    id state = message[@"state"];
    if (![width isKindOfClass:[NSNumber class]] || ![height isKindOfClass:[NSNumber class]] ||
        state == nil) {
      return;
    }
    self.pendingState = state;
    NSNumber *displayId = [message[@"displayId"] isKindOfClass:[NSNumber class]]
                              ? message[@"displayId"]
                              : nil;
    [self positionOnDisplay:displayId
                      width:(CGFloat)width.doubleValue
                     height:(CGFloat)height.doubleValue];
    [self sendPendingState];
    [self.panel orderFrontRegardless];
    return;
  }
  if ([type isEqualToString:@"hide"]) {
    [self.panel orderOut:nil];
    return;
  }
  if ([type isEqualToString:@"shutdown"]) {
    [NSApp terminate:nil];
  }
}

- (void)createPanelIfNeededWithHTML:(NSString *)html {
  if (self.panel != nil) return;

  WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
  [configuration.userContentController addScriptMessageHandler:self name:@"paseoIsland"];
  WKWebView *webView = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:configuration];
  webView.navigationDelegate = self;
  if (@available(macOS 12.0, *)) {
    webView.underPageBackgroundColor = NSColor.clearColor;
  }

  PaseoIslandPanel *panel =
      [[PaseoIslandPanel alloc] initWithContentRect:NSZeroRect
                                          styleMask:(NSWindowStyleMaskBorderless |
                                                     NSWindowStyleMaskNonactivatingPanel)
                                            backing:NSBackingStoreBuffered
                                              defer:NO];
  panel.backgroundColor = NSColor.clearColor;
  panel.opaque = NO;
  panel.hasShadow = NO;
  panel.hidesOnDeactivate = NO;
  panel.movable = NO;
  panel.releasedWhenClosed = NO;
  panel.ignoresMouseEvents = NO;
  panel.animationBehavior = NSWindowAnimationBehaviorNone;
  panel.level = NSScreenSaverWindowLevel;
  panel.collectionBehavior =
      NSWindowCollectionBehaviorCanJoinAllSpaces |
      NSWindowCollectionBehaviorFullScreenAuxiliary |
      NSWindowCollectionBehaviorStationary |
      NSWindowCollectionBehaviorIgnoresCycle;
  panel.contentView = webView;

  self.panel = panel;
  self.webView = webView;
  [webView loadHTMLString:html baseURL:nil];
}

- (void)positionOnDisplay:(NSNumber *)displayId width:(CGFloat)width height:(CGFloat)height {
  NSScreen *target = nil;
  for (NSScreen *screen in NSScreen.screens) {
    NSNumber *number = screen.deviceDescription[@"NSScreenNumber"];
    if (displayId == nil || number.unsignedIntValue == displayId.unsignedIntValue) {
      target = screen;
      break;
    }
  }
  if (target == nil) target = NSScreen.mainScreen ?: NSScreen.screens.firstObject;
  if (target == nil || self.panel == nil) return;

  NSRect screenFrame = target.frame;
  NSRect frame = NSMakeRect(
      NSMidX(screenFrame) - width / 2,
      NSMaxY(screenFrame) - height,
      width,
      height);
  [self.panel setFrame:frame display:YES];
  [self emit:@{
    @"type" : @"positioned",
    @"displayId" : displayId ?: @0,
    @"x" : @(frame.origin.x),
    @"top" : @(NSMaxY(screenFrame) - NSMaxY(frame)),
    @"width" : @(frame.size.width),
    @"height" : @(frame.size.height),
  }];
}

- (void)sendPendingState {
  if (!self.webReady || self.webView == nil || self.pendingState == nil) return;
  if (![NSJSONSerialization isValidJSONObject:self.pendingState]) return;
  NSData *data = [NSJSONSerialization dataWithJSONObject:self.pendingState options:0 error:nil];
  NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  if (json == nil) return;
  NSString *script = [NSString stringWithFormat:@"window.__PASEO_ISLAND_RECEIVE__(%@);", json];
  [self.webView evaluateJavaScript:script completionHandler:nil];
}

- (void)markWebReady {
  self.webReady = YES;
  if (!self.readyEmitted) {
    self.readyEmitted = YES;
    [self emit:@{@"type" : @"ready"}];
  }
  [self sendPendingState];
}

- (void)emit:(NSDictionary *)message {
  if (![NSJSONSerialization isValidJSONObject:message]) return;
  NSData *data = [NSJSONSerialization dataWithJSONObject:message options:0 error:nil];
  if (data == nil) return;
  [[NSFileHandle fileHandleWithStandardOutput] writeData:data];
  [[NSFileHandle fileHandleWithStandardOutput] writeData:[NSData dataWithBytes:"\n" length:1]];
}

- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message {
  if (![message.body isKindOfClass:[NSDictionary class]]) return;
  NSDictionary *body = message.body;
  if ([body[@"type"] isEqualToString:@"ready"]) {
    [self markWebReady];
    return;
  }
  [self emit:body];
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
  [self markWebReady];
}

@end

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSApplication *application = NSApplication.sharedApplication;
    [application setActivationPolicy:NSApplicationActivationPolicyAccessory];
    PaseoIslandHost *host = [[PaseoIslandHost alloc] init];

    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      char *line = NULL;
      size_t capacity = 0;
      while (getline(&line, &capacity, stdin) != -1) {
        @autoreleasepool {
          NSString *text = [NSString stringWithUTF8String:line];
          NSData *data = [text dataUsingEncoding:NSUTF8StringEncoding];
          NSDictionary *message =
              [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
          if (![message isKindOfClass:[NSDictionary class]]) continue;
          dispatch_async(dispatch_get_main_queue(), ^{
            [host handleMessage:message];
          });
        }
      }
      free(line);
      dispatch_async(dispatch_get_main_queue(), ^{
        [application terminate:nil];
      });
    });

    [application run];
  }
  return 0;
}
