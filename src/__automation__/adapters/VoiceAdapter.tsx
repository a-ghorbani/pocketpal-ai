import React, {useCallback, useState} from 'react';
import {View, TextInput, Text, StyleSheet} from 'react-native';

import {observer} from 'mobx-react';

import {runVoiceCommand, voiceTraceDump} from '../voiceAutomation';

/**
 * Hidden component that drives voice-mode states on Android, where the
 * automation deep-link host is not delivered. iOS sends the same commands
 * as `pocketpal://voice?cmd=...`.
 *
 * Protocol: setValue('<verb>::<arg>') runs one command; the result shows
 * `ok` or the error. `voice-trace-result` holds the last `trace::dump` on
 * both platforms.
 */
export const VoiceAdapter: React.FC = observer(() => {
  const [resultData, setResultData] = useState('');

  const handleChangeText = useCallback((text: string) => {
    if (text.length === 0) {
      return;
    }
    runVoiceCommand(text)
      .then(() => setResultData(`ok ${text}`))
      .catch((e: Error) => setResultData(`ERROR: ${e.message}`));
  }, []);

  return (
    <View testID="voice-command-container" style={styles.container}>
      <TextInput
        testID="voice-command-input"
        onChangeText={handleChangeText}
        style={styles.input}
      />
      <Text
        testID="voice-command-result"
        accessibilityLabel={resultData}
        style={styles.input}>
        {resultData}
      </Text>
      <Text
        testID="voice-trace-result"
        accessibilityLabel={voiceTraceDump.get()}
        numberOfLines={1}
        style={styles.input}>
        {voiceTraceDump.get()}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 88,
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
