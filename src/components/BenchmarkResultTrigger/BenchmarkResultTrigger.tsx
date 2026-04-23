import React, {useCallback, useState} from 'react';
import {View, TextInput, Text, StyleSheet} from 'react-native';

import {benchmarkStore, modelStore} from '../../store';

const READ_LATEST = 'read::latest';
const READ_INIT_SETTINGS = 'read::initSettings';
const LIST_MODELS = 'list::models';

/**
 * Hidden component for E2E benchmark-matrix spec.
 *
 * Mirrors MemorySnapshotTrigger: a hidden View with a TextInput command sink
 * and a Text result sink exposed via accessibilityLabel. The spec drives
 * setValue() on the TextInput; the Text element's content-desc / text holds
 * the serialized response.
 *
 * Protocol:
 *   read::latest         -> JSON.stringify(benchmarkStore.latestResult ?? null)
 *   read::initSettings   -> JSON.stringify(modelStore.contextInitParams)
 *   list::models         -> JSON.stringify(<downloaded .gguf filenames>)
 *
 * Placed at bottom-left (MemorySnapshotTrigger uses bottom-right) so the two
 * 44x44 triggers do not overlap in the accessibility tree.
 */
export const BenchmarkResultTrigger: React.FC = () => {
  const [resultData, setResultData] = useState('');

  const handleChangeText = useCallback((text: string) => {
    const processCommand = async () => {
      try {
        if (text === READ_LATEST) {
          setResultData(JSON.stringify(benchmarkStore.latestResult ?? null));
        } else if (text === READ_INIT_SETTINGS) {
          setResultData(JSON.stringify(modelStore.contextInitParams));
        } else if (text === LIST_MODELS) {
          const names = await getDownloadedModelFilenames();
          setResultData(JSON.stringify(names));
        }
      } catch (e) {
        setResultData(`ERROR: ${(e as Error).message}`);
      }
    };
    processCommand();
  }, []);

  return (
    <View testID="benchmark-result-container" style={styles.container}>
      <TextInput
        testID="benchmark-result-label"
        onChangeText={handleChangeText}
        style={styles.input}
      />
      <Text
        testID="benchmark-result-value"
        accessibilityLabel={resultData}
        style={styles.input}>
        {resultData}
      </Text>
    </View>
  );
};

/**
 * List the basenames of every downloaded .gguf file under the app's
 * hf/ subtree. Used by the preseed pre-flight check.
 *
 * Walks DocumentDirectoryPath/models/hf/<author>/<repo>/*.gguf; matches the
 * path ModelStore uses when downloading HF models. Non-hf origins (preset,
 * local imports) are out of scope for the benchmark-matrix spec.
 */
async function getDownloadedModelFilenames(): Promise<string[]> {
  const RNFS = require('@dr.pogodin/react-native-fs');
  const root = `${RNFS.DocumentDirectoryPath}/models/hf`;
  const results: string[] = [];
  try {
    if (!(await RNFS.exists(root))) {
      return [];
    }
    const authors = await RNFS.readDir(root);
    for (const author of authors) {
      if (!author.isDirectory()) {
        continue;
      }
      const repos = await RNFS.readDir(author.path);
      for (const repo of repos) {
        if (!repo.isDirectory()) {
          continue;
        }
        const files = await RNFS.readDir(repo.path);
        for (const f of files) {
          if (f.isFile() && f.name.toLowerCase().endsWith('.gguf')) {
            results.push(f.name);
          }
        }
      }
    }
  } catch {
    // Filesystem not readable — fall back to empty list rather than throw.
  }
  return results;
}

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
