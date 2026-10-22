import React, {useContext, useEffect} from 'react';
import {Keyboard, StyleSheet, View} from 'react-native';

import {Button, Text} from 'react-native-paper';

import {Sheet} from '..';
import {formatTokenCount} from '../DocumentChip';
import {useTheme} from '../../hooks';
import {t} from '../../locales';
import {L10nContext} from '../../utils';
import type {BudgetVerdict} from '../../services/documents/plan';
import type {DocumentRef} from '../../services/documents/types';

type OverVerdict = Extract<BudgetVerdict, {kind: 'over'}>;

interface DocumentBudgetSheetProps {
  isVisible: boolean;
  verdict: OverVerdict;
  onChoosePages: (ref: DocumentRef) => void;
  onRemove: (ref: DocumentRef) => void;
  onSearchInstead: (ref: DocumentRef) => void;
  /** Present only when the active model is local and a larger context fits. */
  onIncreaseContext?: () => void;
  onNewChat: () => void;
  /** Present only when an earlier user message carries documents. */
  onEditMessage?: () => void;
  onClose: () => void;
}

export const DocumentBudgetSheet: React.FC<DocumentBudgetSheetProps> = ({
  isVisible,
  verdict,
  onChoosePages,
  onRemove,
  onSearchInstead,
  onIncreaseContext,
  onNewChat,
  onEditMessage,
  onClose,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const strings = l10n.chat.documents.budgetSheet;
  useEffect(() => {
    if (isVisible) {
      Keyboard.dismiss();
    }
  }, [isVisible]);

  const historyOverflow = verdict.reason === 'history';
  const amounts = {
    needed: formatTokenCount(verdict.needed),
    available: formatTokenCount(Math.max(0, verdict.available)),
  };

  const styles = StyleSheet.create({
    container: {padding: 16, gap: 12},
    body: {color: theme.colors.onSurfaceVariant},
    doc: {
      padding: 12,
      gap: 8,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceVariant,
    },
    docName: {color: theme.colors.onSurface},
    docActions: {flexDirection: 'row', gap: 8},
    history: {color: theme.colors.onSurfaceVariant},
    button: {flex: 1},
  });

  return (
    <Sheet
      isVisible={isVisible}
      onClose={onClose}
      title={historyOverflow ? strings.historyTitle : strings.title}
      snapPoints={['70%']}>
      <Sheet.ScrollView contentContainerStyle={styles.container}>
        <Text variant="bodyMedium" style={styles.body} testID="budget-body">
          {t(historyOverflow ? strings.historyBody : strings.newBody, amounts)}
        </Text>

        {verdict.newDocs
          .filter(({mode}) => !historyOverflow || mode === 'full')
          .map(({ref, tokens, mode}) => (
            <View key={ref.id} style={styles.doc} testID="budget-new-doc">
              <Text
                variant="labelLarge"
                numberOfLines={1}
                style={styles.docName}>
                {mode === 'searched'
                  ? `${ref.name} · ${l10n.chat.documents.searched}`
                  : `${ref.name} · ${t(l10n.chat.documents.tokens, {
                      tokens: formatTokenCount(tokens),
                    })}`}
              </Text>
              <View style={styles.docActions}>
                {mode === 'full' ? (
                  <Button
                    mode="outlined"
                    compact
                    onPress={() => onSearchInstead(ref)}
                    testID="budget-search-instead">
                    {strings.searchInstead}
                  </Button>
                ) : null}
                {!historyOverflow && ref.kind === 'pdf' ? (
                  <Button
                    mode="outlined"
                    compact
                    onPress={() => onChoosePages(ref)}
                    testID="budget-choose-pages">
                    {strings.choosePages}
                  </Button>
                ) : null}
                {!historyOverflow ? (
                  <Button
                    mode="outlined"
                    compact
                    onPress={() => onRemove(ref)}
                    testID="budget-remove">
                    {strings.remove}
                  </Button>
                ) : null}
              </View>
            </View>
          ))}

        {verdict.historyDocTokens > 0 ? (
          <Text
            variant="bodySmall"
            style={styles.history}
            testID="budget-history">
            {t(strings.earlierDocuments, {
              tokens: formatTokenCount(verdict.historyDocTokens),
            })}
          </Text>
        ) : null}

        {historyOverflow ? (
          <>
            <Button
              mode="contained"
              onPress={onNewChat}
              testID="budget-new-chat">
              {strings.newChat}
            </Button>
            {onEditMessage ? (
              <Button
                mode="outlined"
                onPress={onEditMessage}
                testID="budget-edit-message">
                {strings.editMessage}
              </Button>
            ) : null}
          </>
        ) : null}

        {onIncreaseContext ? (
          <Button
            mode="outlined"
            onPress={onIncreaseContext}
            testID="budget-increase-context">
            {strings.increaseContext}
          </Button>
        ) : null}
      </Sheet.ScrollView>
      <Sheet.Actions>
        <Button
          mode="text"
          onPress={onClose}
          style={styles.button}
          testID="budget-cancel">
          {strings.cancel}
        </Button>
      </Sheet.Actions>
    </Sheet>
  );
};
