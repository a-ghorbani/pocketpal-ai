import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {observer} from 'mobx-react';

import {isPlusUnlocked, openPlus} from '../../services/plus/gate';

const PLUS_GATE_PROBE = 'PLUS_GATE_PROBE';

export const PlusTestFeatureScreen: React.FC = observer(() => {
  const [opened, setOpened] = useState(false);

  const open = () => {
    if (isPlusUnlocked()) {
      setOpened(true);
      return;
    }
    openPlus({onUnlocked: () => setOpened(true)});
  };

  return (
    <View accessibilityLabel={PLUS_GATE_PROBE} style={styles.root}>
      <Pressable
        testID="plus-test-feature-open"
        accessibilityRole="button"
        onPress={open}
        style={styles.button}>
        <Text>Open locked feature</Text>
      </Pressable>
      {opened && (
        <Text testID="plus-test-feature-unlocked">Locked feature opened</Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  button: {
    padding: 16,
  },
});
