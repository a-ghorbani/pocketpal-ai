import React, {useContext} from 'react';
import {View} from 'react-native';

import {Button, Text} from 'react-native-paper';

import {Sheet} from '../Sheet/Sheet';
import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {createStyles} from './styles';

interface IncreaseContextSheetProps {
  isVisible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentNCtx: number;
  nextTierTokens: number;
  isReloading?: boolean;
}

export const IncreaseContextSheet: React.FC<IncreaseContextSheetProps> = ({
  isVisible,
  onClose,
  onConfirm,
  currentNCtx,
  nextTierTokens,
  isReloading,
}) => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const copy = l10n.chat.contextWarning.sheet;

  return (
    <Sheet title={copy.title} isVisible={isVisible} onClose={onClose}>
      <Sheet.ScrollView contentContainerStyle={styles.container}>
        <Text variant="bodyMedium" style={styles.body}>
          {copy.body}
        </Text>

        <View style={styles.tierRow}>
          <View style={styles.tierColumn}>
            <Text variant="labelSmall" style={styles.tierLabel}>
              {copy.currentLabel}
            </Text>
            <Text variant="titleMedium" style={styles.tierValue}>
              {currentNCtx}
            </Text>
          </View>
          <View style={styles.tierColumn}>
            <Text variant="labelSmall" style={styles.tierLabel}>
              {copy.nextLabel}
            </Text>
            <Text variant="titleMedium" style={styles.tierValue}>
              {nextTierTokens}
            </Text>
          </View>
        </View>

        <Text variant="bodySmall" style={styles.hint}>
          {copy.reloadHint}
        </Text>
      </Sheet.ScrollView>

      <Sheet.Actions>
        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={onClose}
            disabled={isReloading}
            style={styles.button}
            testID="increase-context-cancel">
            {copy.cancel}
          </Button>
          <Button
            mode="contained"
            onPress={onConfirm}
            disabled={isReloading}
            loading={isReloading}
            style={styles.button}
            testID="increase-context-confirm">
            {copy.confirm}
          </Button>
        </View>
      </Sheet.Actions>
    </Sheet>
  );
};
