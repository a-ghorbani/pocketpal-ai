import React from 'react';
import {View, ScrollView, TouchableOpacity, Alert} from 'react-native';

import DeviceInfo from 'react-native-device-info';
import Clipboard from '@react-native-clipboard/clipboard';
import {Text} from 'react-native-paper';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {BuildInfo} from 'llama.rn';

import {CopyIcon} from '../../assets/icons';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';

export const AboutScreen: React.FC = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets);

  const [appInfo, setAppInfo] = React.useState({
    version: '',
    build: '',
  });

  React.useEffect(() => {
    const version = DeviceInfo.getVersion();
    const buildNumber = DeviceInfo.getBuildNumber();
    setAppInfo({
      version,
      build: buildNumber,
    });
  }, []);

  const copyVersionToClipboard = () => {
    const versionString = `Version ${appInfo.version} (${appInfo.build})`;
    Clipboard.setString(versionString);
    Alert.alert('Copied', 'Version copied to clipboard.');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Text variant="titleLarge" style={styles.title}>
                AisodChat
              </Text>
              <Text variant="bodyMedium" style={styles.description}>
                Your private AI assistant, running entirely on your device.
              </Text>
              <View style={styles.versionContainer}>
                <TouchableOpacity
                  style={styles.versionButton}
                  onPress={copyVersionToClipboard}>
                  <Text style={styles.versionText}>
                    v{appInfo.version} ({appInfo.build})
                  </Text>
                  <CopyIcon
                    width={16}
                    height={16}
                    stroke={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
              <Text style={styles.llamaBuildText}>
                llama.cpp {BuildInfo.number} ({BuildInfo.commit.substring(0, 7)}
                )
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
