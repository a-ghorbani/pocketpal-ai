import React, {useContext} from 'react';
import {View} from 'react-native';

import {Button, Text} from 'react-native-paper';

import {Sheet} from '..';
import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {t} from '../../locales';

import {createStyles} from './styles';

interface ToolConfirmationSheetProps {
  isVisible: boolean;
  toolName: string;
  /** Pretty-printed call arguments. */
  argsJson: string;
  /** Engine-authored, secret-free one-liner, or null. */
  detail: string | null;
  onApprove: () => void;
  onDecline: () => void;
}

/**
 * Asks before a gated tool call runs. Shows only what the runner handed over —
 * the tool name, the engine's detail line and the model's arguments — so no
 * resolved URL, header or credential can reach the screen.
 */
export const ToolConfirmationSheet: React.FC<ToolConfirmationSheetProps> = ({
  isVisible,
  toolName,
  argsJson,
  detail,
  onApprove,
  onDecline,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);
  const strings = l10n.chat.toolConfirmation;

  return (
    <Sheet
      isVisible={isVisible}
      onClose={onDecline}
      title={strings.title}
      snapPoints={['55%']}>
      <Sheet.ScrollView
        contentContainerStyle={styles.container}
        testID="tool-confirmation-sheet">
        <Text style={styles.description}>
          {t(strings.description, {name: toolName})}
        </Text>

        {detail ? (
          <View style={styles.section}>
            <Text variant="labelSmall" style={styles.sectionLabel}>
              {strings.detailLabel}
            </Text>
            <Text
              style={styles.monospace}
              testID="tool-confirmation-detail"
              selectable>
              {detail}
            </Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text variant="labelSmall" style={styles.sectionLabel}>
            {strings.argumentsLabel}
          </Text>
          <Text
            style={styles.monospace}
            testID="tool-confirmation-arguments"
            selectable>
            {argsJson}
          </Text>
        </View>
      </Sheet.ScrollView>

      <Sheet.Actions>
        <View style={styles.actions}>
          <Button
            testID="tool-confirmation-decline"
            mode="text"
            onPress={onDecline}
            style={styles.declineButton}>
            {strings.decline}
          </Button>
          <Button
            testID="tool-confirmation-approve"
            mode="contained"
            onPress={onApprove}>
            {strings.approve}
          </Button>
        </View>
      </Sheet.Actions>
    </Sheet>
  );
};
