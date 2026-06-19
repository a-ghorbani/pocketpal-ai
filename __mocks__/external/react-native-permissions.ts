export const RESULTS = {
  UNAVAILABLE: 'unavailable',
  BLOCKED: 'blocked',
  DENIED: 'denied',
  GRANTED: 'granted',
  LIMITED: 'limited',
} as const;

export const PERMISSIONS = {
  IOS: {MICROPHONE: 'ios.permission.MICROPHONE'},
  ANDROID: {RECORD_AUDIO: 'android.permission.RECORD_AUDIO'},
} as const;

export const check = jest.fn().mockResolvedValue(RESULTS.GRANTED);
export const request = jest.fn().mockResolvedValue(RESULTS.GRANTED);
export const openSettings = jest.fn().mockResolvedValue(undefined);
