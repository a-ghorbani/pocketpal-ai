import {View, Alert, Platform} from 'react-native';
import React, {useContext, useState, useEffect, useCallback} from 'react';

import {ContextParams} from 'llama.rn';
import DeviceInfo from 'react-native-device-info';
import {Text, Button, Checkbox, ActivityIndicator} from 'react-native-paper';

import {submitModelLoadErrorReport} from '../../api/feedback';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

import {ErrorState, L10nContext, formatBytes} from '../../utils';

import {Sheet, TextInput} from '..';

interface ModelErrorReportSheetProps {
  isVisible: boolean;
  onClose: () => void;
  error: ErrorState | null;
}

interface DeviceData {
  deviceModel: string;
  systemName: string;
  systemVersion: string;
  totalMemory: number;
  cpuArch: string[];
  isEmulator: boolean;
}

export const ModelErrorReportSheet: React.FC<ModelErrorReportSheetProps> = ({
  isVisible,
  onClose,
  error,
}) => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);

  // Extract model info from error metadata
  const modelName = error?.metadata?.modelName as string | undefined;
  const modelId = error?.metadata?.modelId as string | undefined;
  const modelUrl = error?.metadata?.modelUrl as string | undefined;
  const modelSize = error?.metadata?.modelSize as number | undefined;
  const contextParams = error?.metadata?.contextParams as
    | Omit<ContextParams, 'model'>
    | undefined;
  const errorMessage = error?.message ?? '';
  const hasModelInfo = !!(modelName || modelId || modelUrl || modelSize);
  const hasContextParams = !!contextParams;

  // Format context params as readable JSON
  const contextParamsJson = contextParams
    ? JSON.stringify(contextParams, null, 2)
    : '';

  // What data to include (all checked by default for transparency)
  const [includeModelInfo, setIncludeModelInfo] = useState(true);
  const [includeContextParams, setIncludeContextParams] = useState(true);
  const [includeDeviceInfo, setIncludeDeviceInfo] = useState(true);

  const [additionalInfo, setAdditionalInfo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Device info state
  const [deviceData, setDeviceData] = useState<DeviceData | null>(null);

  // Fetch device info when sheet opens
  useEffect(() => {
    if (!isVisible) {
      return;
    }

    let isMounted = true;

    const fetchDeviceInfo = async () => {
      const [totalMemory, cpuArch, isEmulator] = await Promise.all([
        DeviceInfo.getTotalMemory(),
        DeviceInfo.supportedAbis(),
        DeviceInfo.isEmulator(),
      ]);

      if (isMounted) {
        setDeviceData({
          deviceModel: DeviceInfo.getModel(),
          systemName: Platform.OS === 'ios' ? 'iOS' : 'Android',
          systemVersion:
            Platform.OS === 'ios'
              ? Platform.Version.toString()
              : DeviceInfo.getSystemVersion(),
          totalMemory,
          cpuArch,
          isEmulator,
        });
      }
    };
    fetchDeviceInfo();

    return () => {
      isMounted = false;
    };
  }, [isVisible]);

  const handleClose = useCallback(() => {
    setIncludeModelInfo(true);
    setIncludeContextParams(true);
    setIncludeDeviceInfo(true);
    setAdditionalInfo('');
    setIsSubmitting(false);
    onClose();
  }, [onClose]);

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      await submitModelLoadErrorReport({
        reportType: 'model-load-error',
        version: 1,
        errorMessage: errorMessage,
        modelInfo: includeModelInfo
          ? {
              name: modelName,
              id: modelId,
              url: modelUrl,
              size: modelSize,
            }
          : undefined,
        contextParams: includeContextParams ? contextParams : undefined,
        deviceInfo: includeDeviceInfo
          ? {
              model: deviceData?.deviceModel,
              systemName: deviceData?.systemName,
              systemVersion: deviceData?.systemVersion,
              totalMemory: deviceData?.totalMemory,
              cpuArch: deviceData?.cpuArch,
              isEmulator: deviceData?.isEmulator,
            }
          : undefined,
        additionalInfo: additionalInfo.trim() || undefined,
      });

      Alert.alert(
        l10n.components.modelErrorReportSheet.success.title,
        l10n.components.modelErrorReportSheet.success.message,
        [{text: l10n.common.ok, onPress: handleClose}],
      );
    } catch (err) {
      console.error('Model error report submission error:', err);
      Alert.alert(
        l10n.components.modelErrorReportSheet.error.title,
        l10n.components.modelErrorReportSheet.error.message,
        [{text: l10n.common.ok}],
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render a group with checkbox header and content
  const renderGroup = (
    title: string,
    isIncluded: boolean,
    onToggle: () => void,
    content: React.ReactNode,
  ) => (
    <View style={[styles.groupContainer, !isIncluded && styles.groupDisabled]}>
      <View style={styles.groupHeader}>
        <Checkbox
          status={isIncluded ? 'checked' : 'unchecked'}
          onPress={onToggle}
        />
        <Text variant="labelLarge" style={styles.groupTitle}>
          {title}
        </Text>
      </View>
      {isIncluded && <View style={styles.groupContent}>{content}</View>}
    </View>
  );

  // Render a simple key-value row
  const renderField = (label: string, value: string) => (
    <View style={styles.fieldRow}>
      <Text variant="bodySmall" style={styles.fieldLabel}>
        {label}
      </Text>
      <Text variant="bodySmall" style={styles.fieldValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );

  // Build model info summary
  const sheetL10n = l10n.components.modelErrorReportSheet;
  const modelInfoFields: Array<{label: string; value: string}> = [];
  if (modelName) {
    modelInfoFields.push({label: sheetL10n.modelName, value: modelName});
  }
  if (modelUrl) {
    modelInfoFields.push({label: sheetL10n.modelSource, value: modelUrl});
  }
  if (modelSize !== undefined) {
    modelInfoFields.push({
      label: sheetL10n.modelSize,
      value: formatBytes(modelSize),
    });
  }

  // Build device info summary
  const deviceInfoFields = deviceData
    ? [
        {label: sheetL10n.deviceModel, value: deviceData.deviceModel},
        {
          label: sheetL10n.osVersion,
          value: `${deviceData.systemName} ${deviceData.systemVersion}`,
        },
        {
          label: sheetL10n.memoryInfo,
          value: formatBytes(deviceData.totalMemory),
        },
        ...(deviceData.cpuArch.length > 0
          ? [
              {
                label: sheetL10n.cpuArchitecture,
                value: deviceData.cpuArch.join(', '),
              },
            ]
          : []),
        ...(deviceData.isEmulator
          ? [{label: sheetL10n.isEmulator, value: 'Yes'}]
          : []),
      ]
    : [];

  return (
    <Sheet
      title={l10n.components.modelErrorReportSheet.title}
      isVisible={isVisible}
      onClose={handleClose}
      snapPoints={['80%']}>
      <Sheet.ScrollView contentContainerStyle={styles.container}>
        {/* Privacy Note */}
        <Text variant="bodySmall" style={styles.privacyNote}>
          {l10n.components.modelErrorReportSheet.privacyNote}
        </Text>

        {/* Error Message - always included */}
        <View style={styles.errorSection}>
          <Text variant="labelMedium" style={styles.errorLabel}>
            {l10n.components.modelErrorReportSheet.errorMessage}
          </Text>
          <Text variant="bodySmall" style={styles.errorText} numberOfLines={3}>
            {errorMessage}
          </Text>
        </View>

        {/* Model Info Group */}
        {hasModelInfo &&
          renderGroup(
            l10n.components.modelErrorReportSheet.modelInfo,
            includeModelInfo,
            () => setIncludeModelInfo(!includeModelInfo),
            modelInfoFields.map((field, index) => (
              <React.Fragment key={index}>
                {renderField(field.label, field.value)}
              </React.Fragment>
            )),
          )}

        {/* Context Parameters Group */}
        {hasContextParams &&
          renderGroup(
            l10n.components.modelErrorReportSheet.contextParams,
            includeContextParams,
            () => setIncludeContextParams(!includeContextParams),
            <Text variant="bodySmall" style={styles.jsonText}>
              {contextParamsJson}
            </Text>,
          )}

        {/* Device Info Group */}
        {deviceData &&
          renderGroup(
            l10n.components.modelErrorReportSheet.deviceInfo,
            includeDeviceInfo,
            () => setIncludeDeviceInfo(!includeDeviceInfo),
            deviceInfoFields.map((field, index) => (
              <React.Fragment key={index}>
                {renderField(field.label, field.value)}
              </React.Fragment>
            )),
          )}

        {/* Additional Info */}
        <View style={styles.additionalSection}>
          <Text variant="labelMedium" style={styles.label}>
            {l10n.components.modelErrorReportSheet.additionalInfoLabel}
          </Text>
          <TextInput
            multiline
            numberOfLines={2}
            defaultValue={additionalInfo}
            onChangeText={setAdditionalInfo}
            placeholder={
              l10n.components.modelErrorReportSheet.additionalInfoPlaceholder
            }
            style={styles.textInput}
          />
        </View>
      </Sheet.ScrollView>

      <Sheet.Actions>
        <View style={styles.actionsContainer}>
          <Button
            mode="outlined"
            onPress={handleClose}
            disabled={isSubmitting}
            style={styles.button}>
            {l10n.common.cancel}
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={styles.button}>
            {isSubmitting ? (
              <ActivityIndicator size="small" />
            ) : (
              l10n.components.modelErrorReportSheet.submit
            )}
          </Button>
        </View>
      </Sheet.Actions>
    </Sheet>
  );
};
