export const InAppBrowser = {
  open: jest.fn().mockResolvedValue({type: 'dismiss'}),
  close: jest.fn(),
  isAvailable: jest.fn().mockResolvedValue(true),
  openAuth: jest.fn().mockResolvedValue({type: 'dismiss'}),
  closeAuth: jest.fn(),
  warmup: jest.fn().mockResolvedValue(true),
  mayLaunchUrl: jest.fn(),
};

export default InAppBrowser;
