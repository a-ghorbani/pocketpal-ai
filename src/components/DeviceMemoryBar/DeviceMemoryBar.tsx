import React, {useContext, useEffect, useState} from 'react';
import {View, StyleSheet} from 'react-native';
import {Text, Tooltip} from 'react-native-paper';
import {observer} from 'mobx-react-lite';

import {useTheme} from '../../hooks';
import {L10nContext, formatBytes} from '../../utils';
import {getDeviceMemoryInfo} from '../../utils/memoryDisplay';
import {modelStore} from '../../store';

interface DeviceMemoryBarProps {
  /** Optional: Override memory info for testing (in bytes) */
  availableBytes?: number;
  totalBytes?: number;
}

/**
 * Display device memory capacity as a progress bar with text
 *
 * Shows: [████ ~3.2/8 GB usable ████░░░░░░░░]
 * Uses simple Views (not ProgressBar) since we need text inside.
 * Uses Tooltip from react-native-paper for tap interaction.
 */
export const DeviceMemoryBar: React.FC<DeviceMemoryBarProps> = observer(
  ({availableBytes: availableOverride, totalBytes: totalOverride}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const [memoryInfo, setMemoryInfo] = useState({
      availableBytes: availableOverride ?? 0,
      totalBytes: totalOverride ?? 0,
    });

    // Read MobX observables to trigger re-render when calibration changes
    const calibrationCeiling = Math.max(
      modelStore.largestSuccessfulLoad ?? 0,
      modelStore.availableMemoryCeiling ?? 0,
    );

    useEffect(() => {
      if (availableOverride !== undefined && totalOverride !== undefined) {
        setMemoryInfo({
          availableBytes: availableOverride,
          totalBytes: totalOverride,
        });
        return;
      }

      getDeviceMemoryInfo().then(setMemoryInfo);
    }, [availableOverride, totalOverride, calibrationCeiling]);

    const {availableBytes, totalBytes} = memoryInfo;
    const percentage = totalBytes > 0 ? (availableBytes / totalBytes) * 100 : 0;

    // Use formatBytes for display
    const availableText = formatBytes(availableBytes, 1); // "3.2 GB"
    const totalText = formatBytes(totalBytes, 0); // "8 GB"
    const usableText = `~${availableText}/${totalText} usable`;

    return (
      <View style={styles.container} testID="device-memory-bar">
        {/* Use Tooltip from react-native-paper */}
        <Tooltip
          title={l10n.memory.deviceMemoryTooltip}
          enterTouchDelay={0}
          leaveTouchDelay={3000}>
          <View
            style={[
              styles.progressBar,
              {backgroundColor: theme.colors.surfaceVariant},
            ]}
            accessibilityLabel={`Device memory: ${usableText}`}
            accessibilityHint="Tap for more information"
            testID="device-memory-bar-touchable">
            {/* Filled portion */}
            <View
              style={[
                styles.progressFill,
                {
                  width: `${percentage}%`,
                  backgroundColor: theme.colors.primary,
                },
              ]}
              testID="memory-bar-fill"
            />
            {/* Text overlay */}
            <View style={styles.textContainer}>
              <Text
                variant="labelSmall"
                style={[styles.text, {color: theme.colors.onPrimary}]}
                testID="memory-bar-text">
                {usableText}
              </Text>
            </View>
          </View>
        </Tooltip>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 8,
  },
  progressBar: {
    height: 24,
    width: 160,
    borderRadius: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 8,
  },
  textContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontWeight: '600',
    fontSize: 11,
  },
});
