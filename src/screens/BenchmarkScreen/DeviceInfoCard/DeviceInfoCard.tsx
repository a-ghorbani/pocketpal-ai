import React, {useEffect, useState, useContext} from 'react';
import {View, TouchableOpacity} from 'react-native';
import {Platform} from 'react-native';

import {Card, Text, Icon} from 'react-native-paper';
import RNDeviceInfo from 'react-native-device-info';

import {Divider} from '../../../components';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';

import {createStyles} from './styles';

import {DeviceInfo} from '../../../utils/types';
import {
  getCpuInfo,
  getGpuInfo,
  getChipsetInfo,
} from '../../../utils/deviceCapabilities';

type Props = {
  onDeviceInfo?: (info: DeviceInfo) => void;
  testId?: string;
};

export const DeviceInfoCard = ({onDeviceInfo, testId}: Props) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);

  const [deviceInfo, setDeviceInfo] = useState({
    model: RNDeviceInfo.getModel(),
    systemName: Platform.OS === 'ios' ? 'iOS' : 'Android',
    systemVersion: String(Platform.Version || ''),
    brand: RNDeviceInfo.getBrand(),
    cpuArch: [] as string[],
    isEmulator: false,
    version: RNDeviceInfo.getVersion(),
    buildNumber: RNDeviceInfo.getBuildNumber(),
    device: '',
    deviceId: '',
    totalMemory: 0,
    chipset: '',
    cpu: '',
    cpuDetails: {
      cores: 0,
      processors: [] as Array<{
        processor: string;
        'model name': string;
        'cpu MHz': string;
        vendor_id: string;
      }>,
      socModel: '',
      features: [] as string[],
      hasFp16: false,
      hasDotProd: false,
      hasSve: false,
      hasI8mm: false,
    },
    gpuDetails: undefined as
      | {
          renderer: string;
          vendor: string;
          version: string;
          hasAdreno: boolean;
          hasMali: boolean;
          hasPowerVR: boolean;
          supportsOpenCL: boolean;
          gpuType: string;
        }
      | undefined,
  });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    Promise.all([
      RNDeviceInfo.supportedAbis(),
      RNDeviceInfo.isEmulator(),
      RNDeviceInfo.getDevice(),
      RNDeviceInfo.getDeviceId(),
      RNDeviceInfo.getTotalMemory(),
      getChipsetInfo(),
      getCpuInfo(),
      getGpuInfo(),
    ]).then(
      ([
        abis,
        emulator,
        device,
        deviceId,
        totalMem,
        chipset,
        cpuInfo,
        gpuInfo,
      ]) => {
        const newDeviceInfo = {
          model: RNDeviceInfo.getModel(),
          systemName: Platform.OS === 'ios' ? 'iOS' : 'Android',
          systemVersion: String(Platform.Version || ''),
          brand: RNDeviceInfo.getBrand(),
          version: RNDeviceInfo.getVersion(),
          buildNumber: RNDeviceInfo.getBuildNumber(),
          cpuArch: abis,
          isEmulator: emulator,
          device,
          deviceId,
          totalMemory: totalMem,
          chipset: chipset || '',
          cpu: '',
          cpuDetails: cpuInfo
            ? {
                cores: cpuInfo.cores || 0,
                processors: (cpuInfo.processors || []).map(p => ({
                  processor: p.processor || '',
                  'model name': p['model name'] || '',
                  'cpu MHz': p['cpu MHz'] || '',
                  vendor_id: p.vendor_id || '',
                })),
                socModel: cpuInfo.socModel || '',
                features: cpuInfo.features || [],
                hasFp16: cpuInfo.hasFp16 || false,
                hasDotProd: cpuInfo.hasDotProd || false,
                hasSve: cpuInfo.hasSve || false,
                hasI8mm: cpuInfo.hasI8mm || false,
              }
            : {
                cores: 0,
                processors: [],
                socModel: '',
                features: [],
                hasFp16: false,
                hasDotProd: false,
                hasSve: false,
                hasI8mm: false,
              },
          gpuDetails: gpuInfo || undefined,
        };

        setDeviceInfo(newDeviceInfo);
        onDeviceInfo?.(newDeviceInfo);
      },
    );
  }, [onDeviceInfo]);

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  return (
    <Card
      testID={testId ?? 'device-info-card'}
      elevation={0}
      style={styles.deviceInfoCard}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)}>
        <View style={styles.headerRow}>
          <View style={styles.headerContent}>
            <Text variant="titleSmall">
              {l10n.benchmark.deviceInfoCard.title}
            </Text>
            <Text variant="bodySmall" style={styles.headerSummary}>
              {l10n.benchmark.deviceInfoCard.deviceSummary
                .replace('{{brand}}', deviceInfo.brand)
                .replace('{{model}}', deviceInfo.model)
                .replace('{{systemName}}', deviceInfo.systemName)
                .replace('{{systemVersion}}', deviceInfo.systemVersion)}
            </Text>
            <Text variant="bodySmall" style={styles.headerSummary}>
              {l10n.benchmark.deviceInfoCard.coreSummary
                .replace('{{cores}}', deviceInfo.cpuDetails.cores.toString())
                .replace('{{memory}}', formatBytes(deviceInfo.totalMemory))}
            </Text>
          </View>
          <Icon
            source={expanded ? 'chevron-up' : 'chevron-down'}
            size={24}
            color={theme.colors.onSurface}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <>
          <Divider />
          <Card.Content>
            <View style={styles.section}>
              <Text variant="labelSmall" style={styles.sectionTitle}>
                {l10n.benchmark.deviceInfoCard.sections.basicInfo}
              </Text>
              <View style={styles.deviceInfoRow}>
                <Text variant="labelSmall" style={styles.deviceInfoLabel}>
                  {l10n.benchmark.deviceInfoCard.fields.architecture}
                </Text>
                <Text variant="bodySmall" style={styles.deviceInfoValue}>
                  {Array.isArray(deviceInfo.cpuArch)
                    ? deviceInfo.cpuArch.join(', ')
                    : deviceInfo.cpuArch}
                </Text>
              </View>
              <View style={styles.deviceInfoRow}>
                <Text variant="labelSmall" style={styles.deviceInfoLabel}>
                  {l10n.benchmark.deviceInfoCard.fields.totalMemory}
                </Text>
                <Text variant="bodySmall" style={styles.deviceInfoValue}>
                  {formatBytes(deviceInfo.totalMemory)}
                </Text>
              </View>
              <View style={styles.deviceInfoRow}>
                <Text variant="labelSmall" style={styles.deviceInfoLabel}>
                  {l10n.benchmark.deviceInfoCard.fields.deviceId}
                </Text>
                <Text variant="bodySmall" style={styles.deviceInfoValue}>
                  {Platform.OS === 'ios'
                    ? deviceInfo.deviceId
                    : `${deviceInfo.device} (${deviceInfo.deviceId})`}
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text variant="labelSmall" style={styles.sectionTitle}>
                {l10n.benchmark.deviceInfoCard.sections.cpuDetails}
              </Text>
              <View style={styles.deviceInfoRow}>
                <Text variant="labelSmall" style={styles.deviceInfoLabel}>
                  {l10n.benchmark.deviceInfoCard.fields.cpuCores}
                </Text>
                <Text variant="bodySmall" style={styles.deviceInfoValue}>
                  {deviceInfo.cpuDetails.cores}
                </Text>
              </View>
              {deviceInfo.cpuDetails.processors[0]?.['model name'] && (
                <View style={styles.deviceInfoRow}>
                  <Text variant="labelSmall" style={styles.deviceInfoLabel}>
                    {l10n.benchmark.deviceInfoCard.fields.cpuModel}
                  </Text>
                  <Text variant="bodySmall" style={styles.deviceInfoValue}>
                    {deviceInfo.cpuDetails.processors[0]['model name']}
                  </Text>
                </View>
              )}
              {Platform.OS === 'android' && deviceInfo.chipset && (
                <View style={styles.deviceInfoRow}>
                  <Text variant="labelSmall" style={styles.deviceInfoLabel}>
                    {l10n.benchmark.deviceInfoCard.fields.chipset}
                  </Text>
                  <Text variant="bodySmall" style={styles.deviceInfoValue}>
                    {deviceInfo.chipset}
                  </Text>
                </View>
              )}
              {Platform.OS === 'android' && (
                <View style={styles.deviceInfoRow}>
                  <Text variant="labelSmall" style={styles.deviceInfoLabel}>
                    {l10n.benchmark.deviceInfoCard.fields.instructions}
                  </Text>
                  <Text variant="bodySmall" style={styles.deviceInfoValue}>
                    {l10n.benchmark.deviceInfoCard.instructions.format
                      .replace(
                        '{{fp16}}',
                        deviceInfo.cpuDetails.hasFp16
                          ? l10n.benchmark.deviceInfoCard.instructions.yes
                          : l10n.benchmark.deviceInfoCard.instructions.no,
                      )
                      .replace(
                        '{{dotProd}}',
                        deviceInfo.cpuDetails.hasDotProd
                          ? l10n.benchmark.deviceInfoCard.instructions.yes
                          : l10n.benchmark.deviceInfoCard.instructions.no,
                      )
                      .replace(
                        '{{sve}}',
                        deviceInfo.cpuDetails.hasSve
                          ? l10n.benchmark.deviceInfoCard.instructions.yes
                          : l10n.benchmark.deviceInfoCard.instructions.no,
                      )
                      .replace(
                        '{{i8mm}}',
                        deviceInfo.cpuDetails.hasI8mm
                          ? l10n.benchmark.deviceInfoCard.instructions.yes
                          : l10n.benchmark.deviceInfoCard.instructions.no,
                      )}
                  </Text>
                </View>
              )}
            </View>

            {/* GPU Details Section */}
            {deviceInfo.gpuDetails && (
              <View style={styles.section}>
                <Text variant="labelSmall" style={styles.sectionTitle}>
                  {l10n.benchmark.deviceInfoCard.sections.gpuDetails}
                </Text>
                <View style={styles.deviceInfoRow}>
                  <Text variant="labelSmall" style={styles.deviceInfoLabel}>
                    {l10n.benchmark.deviceInfoCard.fields.gpuType}
                  </Text>
                  <Text variant="bodySmall" style={styles.deviceInfoValue}>
                    {deviceInfo.gpuDetails.gpuType}
                  </Text>
                </View>
                {deviceInfo.gpuDetails.renderer && (
                  <View style={styles.deviceInfoRow}>
                    <Text variant="labelSmall" style={styles.deviceInfoLabel}>
                      {l10n.benchmark.deviceInfoCard.fields.gpuRenderer}
                    </Text>
                    <Text variant="bodySmall" style={styles.deviceInfoValue}>
                      {deviceInfo.gpuDetails.renderer}
                    </Text>
                  </View>
                )}
                {deviceInfo.gpuDetails.vendor && (
                  <View style={styles.deviceInfoRow}>
                    <Text variant="labelSmall" style={styles.deviceInfoLabel}>
                      {l10n.benchmark.deviceInfoCard.fields.gpuVendor}
                    </Text>
                    <Text variant="bodySmall" style={styles.deviceInfoValue}>
                      {deviceInfo.gpuDetails.vendor}
                    </Text>
                  </View>
                )}
                <View style={styles.deviceInfoRow}>
                  <Text variant="labelSmall" style={styles.deviceInfoLabel}>
                    {Platform.OS === 'ios'
                      ? l10n.benchmark.deviceInfoCard.fields.metalSupport
                      : l10n.benchmark.deviceInfoCard.fields.openclSupport}
                  </Text>
                  <Text variant="bodySmall" style={styles.deviceInfoValue}>
                    {Platform.OS === 'ios'
                      ? l10n.benchmark.deviceInfoCard.instructions.yes
                      : deviceInfo.gpuDetails.supportsOpenCL
                        ? l10n.benchmark.deviceInfoCard.instructions.yes
                        : l10n.benchmark.deviceInfoCard.instructions.no}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.section}>
              <Text variant="labelSmall" style={styles.sectionTitle}>
                {l10n.benchmark.deviceInfoCard.sections.appInfo}
              </Text>
              <View style={styles.deviceInfoRow}>
                <Text variant="labelSmall" style={styles.deviceInfoLabel}>
                  {l10n.benchmark.deviceInfoCard.fields.version}
                </Text>
                <Text variant="bodySmall" style={styles.deviceInfoValue}>
                  {deviceInfo.version} ({deviceInfo.buildNumber})
                </Text>
              </View>
            </View>
          </Card.Content>
        </>
      )}
    </Card>
  );
};
