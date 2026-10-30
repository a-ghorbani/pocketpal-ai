import {AccessibilityInfo, type HostInstance, Platform} from 'react-native';

export const moveScreenReaderFocus = (target: HostInstance) =>
  AccessibilityInfo.sendAccessibilityEvent(
    target,
    Platform.OS === 'android' ? 'viewHoverEnter' : 'focus',
  );
