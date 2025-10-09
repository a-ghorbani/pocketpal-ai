import 'react-native-gesture-handler/jestSetup';
import mockClipboard from '@react-native-clipboard/clipboard/jest/clipboard-mock.js';

import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-haptic-feedback');

jest.mock('react-native-keyboard-controller', () => {
  const KeyboardControllerMock = require('react-native-keyboard-controller/jest');
  return KeyboardControllerMock;
});

// Mock react-native-reanimated
//require('react-native-reanimated').setUpTests();
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');

  Reanimated.default.call = () => {};

  Reanimated.useReducedMotion = jest.fn(() => false);

  Reanimated.useSharedValue = jest.fn(() => ({value: 0}));
  Reanimated.useAnimatedStyle = jest.fn(() => ({}));
  Reanimated.useAnimatedScrollHandler = jest.fn(() => ({}));
  Reanimated.useAnimatedProps = jest.fn(() => ({}));
  Reanimated.useAnimatedGestureHandler = jest.fn(() => ({}));
  Reanimated.withTiming = jest.fn(() => ({}));
  Reanimated.withSpring = jest.fn(() => ({}));
  Reanimated.cancelAnimation = jest.fn();

  Reanimated.default.createAnimatedComponent = (Component: any) => Component;

  return Reanimated;
});

jest.mock('@react-navigation/elements', () => ({
  ...jest.requireActual('@react-navigation/elements'),
  useHeaderHeight: jest.fn().mockReturnValue(56), // Provide a mock return value
}));

import {mockUiStore} from '../__mocks__/stores/uiStore';
import {mockHFStore} from '../__mocks__/stores/hfStore';
import {mockModelStore} from '../__mocks__/stores/modelStore';
import {
  mockChatSessionStore,
  mockDefaultCompletionSettings,
} from '../__mocks__/stores/chatSessionStore';
import {benchmarkStore as mockBenchmarkStore} from '../__mocks__/stores/benchmarkStore';
import {mockPalStore} from '../__mocks__/stores/palStore';

jest.mock('@react-native-clipboard/clipboard', () => mockClipboard);

jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter');

// Mock NativeModules.DeviceInfoModule specifically
const {NativeModules} = require('react-native');
NativeModules.DeviceInfoModule = {
  getCPUInfo: jest.fn(() => Promise.resolve({cores: 4})),
};

jest.mock('react-native-safe-area-context', () => {
  const inset = {top: 0, right: 0, bottom: 0, left: 0};
  return {
    ...jest.requireActual('react-native-safe-area-context'),
    SafeAreaProvider: jest.fn(({children}) => children),
    SafeAreaConsumer: jest.fn(({children}) => children(inset)),
    useSafeAreaInsets: jest.fn(() => inset),
    useSafeAreaFrame: jest.fn(() => ({x: 0, y: 0, width: 390, height: 844})),
  };
});

jest.mock('../src/store', () => {
  const {UIStore} = require('../__mocks__/stores/uiStore');
  return {
    modelStore: mockModelStore,
    UIStore,
    uiStore: mockUiStore,
    chatSessionStore: mockChatSessionStore,
    hfStore: mockHFStore,
    benchmarkStore: mockBenchmarkStore,
    palStore: mockPalStore,
    defaultCompletionSettings: mockDefaultCompletionSettings,
  };
});

jest.mock('../src/hooks/useTheme', () => {
  const {themeFixtures} = require('./fixtures/theme');
  return {
    useTheme: jest.fn().mockReturnValue(themeFixtures.lightTheme),
  };
});

jest.mock('../src/hooks/useMemoryCheck', () => ({
  useMemoryCheck: jest.fn().mockReturnValue({
    memoryWarning: '',
    shortMemoryWarning: '',
    multimodalWarning: '',
  }),
  hasEnoughMemory: jest.fn().mockResolvedValue(true),
  isHighEndDevice: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/services/downloads', () => ({
  downloadManager: require('../__mocks__/services/downloads').downloadManager,
}));

jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-12345' + Math.random(),
}));

jest.mock('../src/repositories/ChatSessionRepository', () => ({
  chatSessionRepository:
    require('../__mocks__/repositories/ChatSessionRepository')
      .chatSessionRepository,
}));

jest.mock('../src/utils/keepAwake', () => ({
  activateKeepAwake: jest.fn(),
  deactivateKeepAwake: jest.fn(),
}));

jest.mock('react-native-share', () => ({
  default: jest.fn(),
}));

jest.mock('react-native-image-picker');
jest.mock('react-native-vision-camera');

jest.mock('../src/database', () => {
  return {
    database: require('../__mocks__/database').mockDatabase,
  };
});

jest.mock('../src/services', () => {
  return require('../__mocks__/services');
});
