import React from 'react';
import {ScrollView, View} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {observer} from 'mobx-react-lite';
import {Button, Switch, Text} from 'react-native-paper';

import {useTheme} from '../../hooks';
import {debugStore} from '../../store/DebugStore';

import {createStyles} from './styles';

export const ConsoleScreen: React.FC = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);

  const handleCopy = () => {
    Clipboard.setString(debugStore.formattedLogs || 'No logs captured.');
  };

  return (
    <View style={styles.container}>
      <View style={styles.controls}>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Capture console logs</Text>
          <Switch
            value={debugStore.captureConsole}
            onValueChange={value => debugStore.setCaptureConsole(value)}
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Vision debug mode</Text>
          <Switch
            value={debugStore.visionDebugEnabled}
            onValueChange={value => debugStore.setVisionDebugEnabled(value)}
          />
        </View>
        <View style={styles.buttonRow}>
          <Button mode="contained" onPress={handleCopy}>
            Copy
          </Button>
          <Button mode="outlined" onPress={() => debugStore.clearLogs()}>
            Clear
          </Button>
        </View>
      </View>

      <ScrollView
        style={styles.logContainer}
        contentContainerStyle={styles.logContent}>
        {debugStore.logs.length === 0 ? (
          <Text style={styles.emptyText}>No logs captured.</Text>
        ) : (
          debugStore.logs
            .slice()
            .reverse()
            .map(entry => (
              <View key={entry.id} style={styles.logEntry}>
                <Text style={styles.metaText}>
                  {new Date(entry.timestamp).toLocaleTimeString()}{' '}
                  {entry.level.toUpperCase()}
                </Text>
                <Text selectable style={styles.messageText}>
                  {entry.message}
                </Text>
              </View>
            ))
        )}
      </ScrollView>
    </View>
  );
});
