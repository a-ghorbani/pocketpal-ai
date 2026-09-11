export const Camera = 'Camera';
export const useCameraDevice = jest.fn(() => ({
  id: 'back',
  name: 'Back Camera',
  position: 'back',
  devices: [],
}));
export const useCameraPermission = jest.fn(() => ({
  hasPermission: true,
  requestPermission: jest.fn(),
}));
export const useCodeScanner = jest.fn((codeScanner: unknown) => codeScanner);
