import React, {useEffect} from 'react';
import {BackHandler, View} from 'react-native';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {PlusScreen} from '../../screens/PlusScreen/PlusScreen';
import {ensureRamRead} from '../../services/plus/deviceRam';
import {dismissPlus, plusGate} from '../../services/plus/gate';

import {createStyles} from './styles';

export const PlusHost: React.FC = observer(() => {
  const theme = useTheme();
  const shown = plusGate.request !== null;

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

  if (!shown) {
    return null;
  }
  return (
    <View
      testID="plus-host"
      style={createStyles(theme).root}
      accessibilityViewIsModal>
      <PlusScreen onClose={dismissPlus} />
    </View>
  );
});
