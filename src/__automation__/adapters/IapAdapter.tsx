import React, {useCallback, useState} from 'react';
import {View, TextInput, Text, StyleSheet} from 'react-native';

import {fakeStore} from '../fakeStore';

/**
 * Hidden component that scripts the e2e FakeStore on Android, where the
 * automation deep-link host is not delivered. iOS sends the same commands
 * as `pocketpal://iap?cmd=...`.
 *
 * Protocol: setValue('<verb>::<arg>') runs one command; the result shows
 * the FakeStore state as JSON. See fakeStore.ts for the verbs.
 */
export const IapAdapter: React.FC = () => {
  const [resultData, setResultData] = useState('');

  const handleChangeText = useCallback((text: string) => {
    if (text.length === 0) {
      return;
    }
    fakeStore
      .run(text)
      .then(setResultData)
      .catch((e: Error) => setResultData(`ERROR: ${e.message}`));
  }, []);

  return (
    <View testID="iap-command-container" style={styles.container}>
      <TextInput
        testID="iap-command-input"
        onChangeText={handleChangeText}
        style={styles.input}
      />
      <Text
        testID="iap-command-result"
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
    left: 44,
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
