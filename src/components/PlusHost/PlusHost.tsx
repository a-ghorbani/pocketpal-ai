import React, {useEffect, useRef} from 'react';
import {BackHandler, type HostInstance, View} from 'react-native';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {PlusScreen} from '../../screens/PlusScreen/PlusScreen';
import {ensureRamRead} from '../../services/plus/deviceRam';
import {
  dismissPlus,
  isPlusUnlocked,
  plusGate,
  shouldReturnFocusOnClose,
} from '../../services/plus/gate';
import {moveScreenReaderFocus} from '../../utils/screenReaderFocus';
import {plusReturnFocusTarget} from '../HeaderLeft/plusReturnFocus';

import {createStyles} from './styles';

export const PlusHost: React.FC = observer(() => {
  const theme = useTheme();
  const shown = plusGate.request !== null;
  const headlineRef = useRef<HostInstance>(null);
  const wasShown = useRef(false);
  const unlocked = isPlusUnlocked();
  const wasUnlocked = useRef(unlocked);

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
    const unlockedWhileShown =
      shown && wasShown.current && unlocked && !wasUnlocked.current;
    wasUnlocked.current = unlocked;
    const target = headlineRef.current;
    if (!unlockedWhileShown || !target) {
      return;
    }
    const frame = requestAnimationFrame(() => moveScreenReaderFocus(target));
    return () => cancelAnimationFrame(frame);
  }, [shown, unlocked]);

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
