import React, {useContext, useEffect, useState} from 'react';
import {View, StyleSheet} from 'react-native';
import {Text} from 'react-native-paper';
import {observer} from 'mobx-react-lite';

import {useTheme} from '../../hooks';
import {L10nContext, formatBytes} from '../../utils';
import {getMemoryFitStatus, MemoryFitStatus} from '../../utils/memoryDisplay';
import {getModelMemoryRequirement} from '../../utils/memoryEstimator';
import {Model} from '../../utils/types';
import {modelStore} from '../../store';

interface MemoryRequirementProps {
  model: Model;
  projectionModel?: Model;
  /** Optional: Override computed fit status for testing */
  fitStatus?: MemoryFitStatus;
}

/**
 * Display memory requirement for a model with fit status indicator
 *
 * Shows: "Required RAM: ~2.1 GB (fits ✓)"
 */
export const MemoryRequirement: React.FC<MemoryRequirementProps> = observer(
  ({model, projectionModel, fitStatus: fitStatusOverride}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const [fitStatus, setFitStatus] = useState<MemoryFitStatus>('fits');

    // Read MobX observables to trigger re-render when calibration changes
    const calibrationCeiling = Math.max(
      modelStore.largestSuccessfulLoad ?? 0,
      modelStore.availableMemoryCeiling ?? 0,
    );

    useEffect(() => {
      if (fitStatusOverride) {
        setFitStatus(fitStatusOverride);
        return;
      }

      getMemoryFitStatus(model, projectionModel).then(setFitStatus);
    }, [model, projectionModel, fitStatusOverride, calibrationCeiling]);

    // Get memory requirement
    const memoryRequirement = getModelMemoryRequirement(
      model,
      projectionModel,
      modelStore.contextInitParams,
    );

    // Get status text and icon
    const statusConfig = {
      fits: {
        text: l10n.memory.fits,
        icon: '✓',
        color: theme.colors.primary, // Green-ish
      },
      tight: {
        text: l10n.memory.tight,
        icon: '⚠️',
        color: theme.colors.error, // Orange/Yellow
      },
      wont_fit: {
        text: l10n.memory.wontFit,
        icon: '✗',
        color: theme.colors.error, // Red
      },
    };

    const config = statusConfig[fitStatus];
    const sizeText = formatBytes(memoryRequirement, 1); // "2.1 GB"
    const displayText = l10n.memory.requiredRAM.replace('{size}', sizeText);

    return (
      <View style={styles.container} testID="memory-requirement">
        <Text
          variant="bodySmall"
          style={[styles.text, {color: theme.colors.onSurfaceVariant}]}
          testID="memory-requirement-text">
          {displayText}{' '}
          <Text
            style={{color: config.color}}
            testID={`memory-status-${fitStatus}`}>
            ({config.text} {config.icon})
          </Text>
        </Text>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    marginTop: 2,
    marginBottom: 4,
  },
  text: {
    fontSize: 12,
  },
});
