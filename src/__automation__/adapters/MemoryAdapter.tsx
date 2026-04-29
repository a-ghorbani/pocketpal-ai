import React, {useCallback, useState} from 'react';
import {View, TextInput, Text, StyleSheet} from 'react-native';

import {
  takeMemorySnapshot,
  clearMemorySnapshots,
  readMemorySnapshots,
} from '../../utils/memoryProfile';

const SNAP_PREFIX = 'snap::';
const CLEAR_CMD = 'clear::snapshots';
const READ_CMD = 'read::snapshots';

/**
 * Hidden component for E2E memory profiling.
 *
 * Protocol (single setValue call per action):
 * - setValue('snap::app_launch') → takes snapshot with label 'app_launch'
 * - setValue('clear::snapshots') → clears accumulated snapshots
 * - setValue('read::snapshots') → reads snapshots JSON into a result element
 *
 * Uses opacity 0.01 to stay in Android's accessibility tree.
 */
export const MemoryAdapter: React.FC = () => {
  const [resultData, setResultData] = useState('');

  const handleChangeText = useCallback((text: string) => {
    const processCommand = async () => {
      try {
        if (text === CLEAR_CMD) {
          await clearMemorySnapshots();
        } else if (text === READ_CMD) {
          const data = await readMemorySnapshots();
          setResultData(data);
        } else if (text.startsWith(SNAP_PREFIX)) {
          const label = text.slice(SNAP_PREFIX.length) || 'unnamed';
          await takeMemorySnapshot(label);
        }
      } catch (e) {
        setResultData(`ERROR: ${(e as Error).message}`);
      }
    };
    processCommand();
  }, []);

  return (
    <View testID="memory-snapshot-container" style={styles.container}>
      <TextInput
        testID="memory-snapshot-label"
        onChangeText={handleChangeText}
        style={styles.input}
      />
      <Text
        testID="memory-snapshot-result"
        accessibilityLabel={resultData}
        style={styles.input}>
        {resultData}
      </Text>
    </View>
  );
};
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 44,
    height: 44,
    backgroundColor: 'transparent',
  },
  input: {
    width: 44,
    height: 22,
    color: 'transparent',
    backgroundColor: 'transparent',
  },
});
