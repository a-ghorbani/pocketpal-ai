import React, {useContext} from 'react';
import {View} from 'react-native';
import {Text} from 'react-native-paper';
import {observer} from 'mobx-react-lite';

import {useTheme} from '../../hooks';
import {L10nContext, formatBytes} from '../../utils';
import {getModelMemoryRequirement} from '../../utils/memoryEstimator';
import {Model} from '../../utils/types';
import {modelStore} from '../../store';

import {createStyles} from './styles';

interface MemoryRequirementProps {
  model: Model;
  projectionModel?: Model;
}

/**
 * Display estimated memory requirement for a model
 *
 * Shows: "Estimated memory: ~2.5 GB"
 * Tappable with tooltip explaining the estimate.
 */
export const MemoryRequirement: React.FC<MemoryRequirementProps> = observer(
  ({model, projectionModel}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);

    // Get memory requirement
    const memoryRequirement = getModelMemoryRequirement(
      model,
      projectionModel,
      modelStore.contextInitParams,
    );

    const sizeText = formatBytes(memoryRequirement, 1); // "2.5 GB"
    const displayText = l10n.memory.estimatedMemory.replace('{size}', sizeText);

    return (
      <View style={styles.container} testID="memory-requirement">
        <View style={styles.row} accessibilityLabel={displayText}>
          <Text
            variant="bodySmall"
            style={styles.text}
            testID="memory-requirement-text">
            {displayText}
          </Text>
        </View>
      </View>
    );
  },
);
