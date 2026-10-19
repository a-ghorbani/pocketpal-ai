import React, {useEffect, useRef} from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  type HostInstance,
  Platform,
  Text,
  View,
} from 'react-native';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {PlusScreen} from '../../screens/PlusScreen/PlusScreen';
import {ensureRamRead} from '../../services/plus/deviceRam';
import {
  dismissPlus,
  plusGate,
  shouldReturnFocusOnClose,
} from '../../services/plus/gate';
import {plusReturnFocusTarget} from '../HeaderLeft/plusReturnFocus';

import {createStyles} from './styles';

const moveScreenReaderFocus = (target: HostInstance) =>
  AccessibilityInfo.sendAccessibilityEvent(
    target,
    Platform.OS === 'android' ? 'viewHoverEnter' : 'focus',
  );

export const PlusHost: React.FC = observer(() => {
  const theme = useTheme();
  const shown = plusGate.request !== null;
  const headlineRef = useRef<Text>(null);
  const wasShown = useRef(false);

  useEffect(() => {
    if (!shown) {
      return;
    }
    ensureRamRead().catch(() => {});
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        dismissPlus();
        return true;
      },
    );
    return () => subscription.remove();
  }, [shown]);

  useEffect(() => {
    if (shown === wasShown.current) {
      return;
    }
    wasShown.current = shown;
    const target = shown
      ? headlineRef.current
      : shouldReturnFocusOnClose()
        ? plusReturnFocusTarget()
        : null;
    if (!target) {
      return;
    }
    const frame = requestAnimationFrame(() => moveScreenReaderFocus(target));
    return () => cancelAnimationFrame(frame);
  }, [shown]);

  if (!shown) {
    return null;
  }
  return (
    <View
      testID="plus-host"
      style={createStyles(theme).root}
      accessibilityViewIsModal
      onAccessibilityEscape={dismissPlus}>
      <PlusScreen onClose={dismissPlus} headlineRef={headlineRef} />
    </View>
  );
});
