// Mock for @mhpdev/react-native-speech
const mockSubscription = {
  remove: jest.fn(),
};

const mockSpeech = {
  getAvailableVoices: jest.fn().mockResolvedValue([]),
  initialize: jest.fn(),
  reset: jest.fn(),
  speak: jest.fn().mockResolvedValue(undefined),
  speakWithOptions: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(false),
  resume: jest.fn().mockResolvedValue(false),
  isSpeaking: jest.fn().mockResolvedValue(false),
  onError: jest.fn().mockReturnValue(mockSubscription),
  onStart: jest.fn().mockReturnValue(mockSubscription),
  onFinish: jest.fn().mockReturnValue(mockSubscription),
  onPause: jest.fn().mockReturnValue(mockSubscription),
  onResume: jest.fn().mockReturnValue(mockSubscription),
  onStopped: jest.fn().mockReturnValue(mockSubscription),
  onProgress: jest.fn().mockReturnValue(mockSubscription),
};

export default mockSpeech;
