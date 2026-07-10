import React, {useCallback, useState} from 'react';
import {View, TextInput, Text, StyleSheet} from 'react-native';

import {runTtsCommand, readTtsStatus} from '../ttsAutomation';

const READ_CMD = 'read::status';

/**
 * Hidden component for E2E TTS memory profiling.
 *
 * Protocol (single setValue call per action), mirroring MemoryAdapter:
 * - setValue('download::kitten')     downloads + readies an engine
 * - setValue('synthesize::kitten')   runs one synthesis
 * - setValue('release')              releases the active engine
 * - setValue('read::status')         exposes the latest command status JSON
 *
 * iOS drives the same commands via the `pocketpal://tts?cmd=...` deep link;
 * status is read from the file directly via simctl.
 *
 * Uses opacity 0.01 to stay in Android's accessibility tree.
 */
export const TTSAdapter: React.FC = () => {
  const [resultData, setResultData] = useState('');

  const handleChangeText = useCallback((text: string) => {
    const processCommand = async () => {
      try {
        if (text === READ_CMD) {
          setResultData(await readTtsStatus());
        } else if (text.length > 0) {
          await runTtsCommand(text);
        }
      } catch (e) {
        setResultData(`ERROR: ${(e as Error).message}`);
      }
    };
    processCommand();
  }, []);

  return (
    <View testID="tts-command-container" style={styles.container}>
      <TextInput
        testID="tts-command-input"
        onChangeText={handleChangeText}
        style={styles.input}
      />
      <Text
        testID="tts-command-result"
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
    left: 0,
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
