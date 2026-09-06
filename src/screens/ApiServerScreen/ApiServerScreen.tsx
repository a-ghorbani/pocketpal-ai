import React, {useContext, useEffect, useState} from 'react';
import {
  ScrollView,
  TouchableOpacity,
  View,
  Alert,
  Platform,
} from 'react-native';

import Clipboard from '@react-native-clipboard/clipboard';
import DeviceInfo from 'react-native-device-info';
import {observer} from 'mobx-react-lite';
import {Switch, Text, Button} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';

import {CopyIcon, GlobeIcon, RefreshIcon} from '../../assets/icons';
import {TextInput} from '../../components';
import {useTheme} from '../../hooks';
import {apiServerStore} from '../../store';
import {apiServerService} from '../../services/openai-compat/apiServer';
import {L10nContext} from '../../utils';
import {t} from '../../locales';

import {createStyles} from './styles';

export const ApiServerScreen: React.FC = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);
  const apiServerL10n = l10n.apiServer;

  const [portInput, setPortInput] = useState(String(apiServerStore.port));
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'android') {
      try {
        DeviceInfo.getIpAddress().then(addr => setIpAddress(addr));
      } catch {
        setIpAddress(null);
      }
    }
  }, []);

  const handleToggleServer = async (enabled: boolean) => {
    if (enabled) {
      const port = parseInt(portInput, 10);
      if (!Number.isFinite(port) || port < 1024 || port > 65535) {
        Alert.alert(
          apiServerL10n.errorTitle,
          t(apiServerL10n.invalidPort, {min: '1024', max: '65535'}),
        );
        return;
      }
      apiServerStore.setPort(port);
      setIsStarting(true);
      try {
        await apiServerService.start();
        if (apiServerStore.autoStart) {
          apiServerStore.setAutoStart(true);
        }
      } catch (error) {
        Alert.alert(
          apiServerL10n.errorTitle,
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        setIsStarting(false);
      }
    } else {
      try {
        await apiServerService.stop();
      } catch (error) {
        Alert.alert(
          apiServerL10n.errorTitle,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  };

  const handleCopyUrl = () => {
    if (!ipAddress) {
      return;
    }
    Clipboard.setString(`http://${ipAddress}:${apiServerStore.port}/v1`);
  };

  const handleCopyApiKey = () => {
    Clipboard.setString(apiServerStore.apiKey);
    Alert.alert(apiServerL10n.copiedTitle, apiServerL10n.copiedMessage);
  };

  const handleRegenerateApiKey = () => {
    apiServerStore.regenerateApiKey();
  };

  const handlePortChange = (text: string) => {
    setPortInput(text.replace(/[^0-9]/g, ''));
  };

  const running = apiServerStore.running;
  const statusLabel = running
    ? apiServerL10n.statusRunning
    : apiServerL10n.statusStopped;

  const url = ipAddress
    ? `http://${ipAddress}:${apiServerStore.port}/v1`
    : null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{apiServerL10n.statusTitle}</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                running ? styles.statusDotRunning : styles.statusDotStopped,
              ]}
            />
            <Text style={styles.statusText}>{statusLabel}</Text>
            <Switch
              value={running}
              disabled={isStarting}
              onValueChange={handleToggleServer}
              testID="api-server-switch"
            />
          </View>
          {url && (
            <TouchableOpacity
              style={styles.urlRow}
              onPress={handleCopyUrl}
              testID="api-server-url">
              <Text style={styles.urlText}>{url}</Text>
              <CopyIcon
                width={18}
                height={18}
                stroke={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          )}
          {running && (
            <Text style={styles.noteText}>
              {t(apiServerL10n.activeRequests, {
                count: String(apiServerStore.activeRequests),
              })}
            </Text>
          )}
          {apiServerStore.lastError && (
            <Text style={styles.errorText}>{apiServerStore.lastError}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{apiServerL10n.settingsTitle}</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{apiServerL10n.portLabel}</Text>
            <TextInput
              style={styles.input}
              value={portInput}
              onChangeText={handlePortChange}
              keyboardType="number-pad"
              editable={!running}
              testID="api-server-port-input"
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>
              {apiServerL10n.requireAuthLabel}
            </Text>
            <Switch
              value={apiServerStore.requireAuth}
              onValueChange={value => apiServerStore.setRequireAuth(value)}
              testID="api-server-auth-switch"
            />
          </View>
          <Text style={styles.rowLabel}>{apiServerL10n.apiKeyLabel}</Text>
          <View style={styles.apiKeyRow}>
            <Text
              style={styles.apiKeyText}
              numberOfLines={1}
              ellipsizeMode="middle">
              {apiServerStore.apiKey}
            </Text>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleCopyApiKey}
              testID="api-server-copy-key">
              <CopyIcon
                width={18}
                height={18}
                stroke={theme.colors.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleRegenerateApiKey}
              testID="api-server-regen-key">
              <RefreshIcon
                width={18}
                height={18}
                stroke={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>
              {apiServerL10n.autoStartLabel}
            </Text>
            <Switch
              value={apiServerStore.autoStart}
              onValueChange={value => apiServerStore.setAutoStart(value)}
            />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.statusRow}>
            <GlobeIcon width={20} height={20} stroke={theme.colors.primary} />
            <Text style={styles.sectionTitle}>{apiServerL10n.compatTitle}</Text>
          </View>
          <Text style={styles.noteText}>{apiServerL10n.compatEndpoints}</Text>
          <Text style={styles.noteText}>{apiServerL10n.compatTools}</Text>
          <Text style={styles.noteText}>{apiServerL10n.compatThinking}</Text>
          <Text style={styles.noteText}>{apiServerL10n.compatMcp}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.actionsRow}>
            <Text style={styles.sectionTitle}>
              {apiServerL10n.requestLogTitle}
            </Text>
            <View style={styles.spacer} />
            <Button
              mode="text"
              compact
              onPress={() => apiServerStore.clearRequestLogs()}>
              {l10n.common.clear}
            </Button>
          </View>
          {apiServerStore.requestLogs.length === 0 ? (
            <Text style={styles.emptyText}>
              {apiServerL10n.requestLogEmpty}
            </Text>
          ) : (
            apiServerStore.requestLogs.slice(0, 20).map(entry => (
              <View key={entry.id} style={styles.logEntry}>
                <View style={styles.logMeta}>
                  <Text style={styles.logMethod}>{entry.method}</Text>
                  {entry.status !== null ? (
                    <Text
                      style={
                        entry.status < 400
                          ? styles.logStatusOk
                          : styles.logStatusError
                      }>
                      {entry.status}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.logPath}>{entry.path}</Text>
                {entry.error ? (
                  <Text style={styles.errorText} numberOfLines={2}>
                    {entry.error}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
});
