#import <BareKit/BareKit.h>
#import <UIKit/UIKit.h>

@interface DeviceViewController : UIViewController
@property(nonatomic, strong) UITextField *serverURL;
@property(nonatomic, strong) UITextView *output;
@property(nonatomic, strong) BareWorklet *worklet;
@property(nonatomic, strong) BareIPC *ipc;
@property(nonatomic, strong) NSMutableData *pending;
@end

@implementation DeviceViewController

- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = UIColor.systemBackgroundColor;
  self.pending = [NSMutableData data];

  UIStackView *stack = [[UIStackView alloc] init];
  stack.axis = UILayoutConstraintAxisVertical;
  stack.spacing = 12;
  stack.translatesAutoresizingMaskIntoConstraints = NO;
  [self.view addSubview:stack];

  self.serverURL = [[UITextField alloc] init];
  self.serverURL.borderStyle = UITextBorderStyleRoundedRect;
  self.serverURL.placeholder = @"ws://192.168.1.100:5173/__bare_vite?environment=bare";
  self.serverURL.autocapitalizationType = UITextAutocapitalizationTypeNone;
  self.serverURL.autocorrectionType = UITextAutocorrectionTypeNo;
  [stack addArrangedSubview:self.serverURL];

  UIButton *development = [UIButton buttonWithType:UIButtonTypeSystem];
  [development setTitle:@"Start development" forState:UIControlStateNormal];
  [development addTarget:self action:@selector(startDevelopment) forControlEvents:UIControlEventTouchUpInside];
  [stack addArrangedSubview:development];

  UIButton *production = [UIButton buttonWithType:UIButtonTypeSystem];
  [production setTitle:@"Start production" forState:UIControlStateNormal];
  [production addTarget:self action:@selector(startProduction) forControlEvents:UIControlEventTouchUpInside];
  [stack addArrangedSubview:production];

  self.output = [[UITextView alloc] init];
  self.output.editable = NO;
  self.output.font = [UIFont monospacedSystemFontOfSize:12 weight:UIFontWeightRegular];
  [stack addArrangedSubview:self.output];

  [NSLayoutConstraint activateConstraints:@[
    [stack.leadingAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.leadingAnchor constant:16],
    [stack.trailingAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.trailingAnchor constant:-16],
    [stack.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor constant:16],
    [stack.bottomAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.bottomAnchor constant:-16],
  ]];
}

- (void)startDevelopment {
  [self startBundle:@"dev" arguments:@[self.serverURL.text, @"/app/application.ts"]];
}

- (void)startProduction {
  [self startBundle:@"production" arguments:@[]];
}

- (void)startBundle:(NSString *)name arguments:(NSArray<NSString *> *)arguments {
  [self stopWorklet];
  self.output.text = @"";
  [self.pending setLength:0];

  NSURL *url = [NSBundle.mainBundle URLForResource:name withExtension:@"bundle"];
  NSData *source = url == nil ? nil : [NSData dataWithContentsOfURL:url];
  if (source == nil) {
    [self appendLine:[NSString stringWithFormat:@"Host error: missing %@.bundle", name]];
    return;
  }

  self.worklet = [[BareWorklet alloc] initWithConfiguration:nil];
  self.ipc = [[BareIPC alloc] initWithWorklet:self.worklet];
  [self readNext];
  [self.worklet start:@"/app.bundle" source:source arguments:arguments];
}

- (void)readNext {
  BareIPC *current = self.ipc;
  if (current == nil) return;

  __weak DeviceViewController *weakSelf = self;
  [current read:^(NSData *data, NSError *error) {
    DeviceViewController *self = weakSelf;
    if (self == nil || current != self.ipc) return;
    if (error != nil) {
      [self appendLine:[NSString stringWithFormat:@"IPC error: %@", error.localizedDescription]];
      return;
    }
    if (data == nil) return;
    [self.pending appendData:data];
    [self flushLines];
    [self readNext];
  }];
}

- (void)flushLines {
  const uint8_t newline = '\n';
  while (self.pending.length > 0) {
    NSRange range = [self.pending rangeOfData:[NSData dataWithBytes:&newline length:1]
                                      options:0
                                        range:NSMakeRange(0, self.pending.length)];
    if (range.location == NSNotFound) return;
    NSData *lineData = [self.pending subdataWithRange:NSMakeRange(0, range.location)];
    [self.pending replaceBytesInRange:NSMakeRange(0, range.location + 1) withBytes:NULL length:0];
    NSString *line = [[NSString alloc] initWithData:lineData encoding:NSUTF8StringEncoding];
    [self appendLine:line ?: @"<invalid UTF-8>"];
  }
}

- (void)appendLine:(NSString *)line {
  NSLog(@"BareViteDevice: %@", line);
  dispatch_async(dispatch_get_main_queue(), ^{
    self.output.text = [self.output.text stringByAppendingFormat:@"%@\n", line];
  });
}

- (void)stopWorklet {
  [self.ipc close];
  [self.worklet terminate];
  self.ipc = nil;
  self.worklet = nil;
}

- (void)dealloc {
  [self stopWorklet];
}

@end

@interface AppDelegate : UIResponder <UIApplicationDelegate>
@property(nonatomic, strong) UIWindow *window;
@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
  self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
  self.window.rootViewController = [[DeviceViewController alloc] init];
  [self.window makeKeyAndVisible];
  return YES;
}

@end

int main(int argc, char *argv[]) {
  @autoreleasepool {
    return UIApplicationMain(argc, argv, nil, NSStringFromClass(AppDelegate.class));
  }
}
