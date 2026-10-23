import React, {useContext} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, View} from 'react-native';

import {IconButton, Text} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {useTheme} from '../../hooks';
import {t} from '../../locales';
import {L10nContext, formatNumber} from '../../utils';
import {displayTokens} from '../../services/documents/budget';
import type {
  ComposerDocumentStatus,
  DocumentMode,
  DocumentRef,
} from '../../services/documents/types';

interface DocumentChipProps {
  name: string;
  documentRef?: DocumentRef;
  status?: ComposerDocumentStatus;
  /** How the document reaches the model; unknown until planned. */
  mode?: DocumentMode;
  onSearchInstead?: () => void;
  onPress?: () => void;
  onRemove?: () => void;
  testID?: string;
}

export const formatTokenCount = (tokens: number): string =>
  formatNumber(tokens, 1);

export const DocumentChip: React.FC<DocumentChipProps> = ({
  name,
  documentRef,
  status = 'ready',
  mode,
  onSearchInstead,
  onPress,
  onRemove,
  testID = 'document-chip',
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const strings = l10n.chat.documents;

  const details: string[] = [];
  const pageCount = documentRef?.pageCount;
  if (documentRef?.pageRange && pageCount !== undefined) {
    details.push(
      t(strings.pageRange, {
        from: documentRef.pageRange.from,
        to: documentRef.pageRange.to,
        total: pageCount,
      }),
    );
  } else if (pageCount !== undefined) {
    details.push(t(strings.pages, {count: pageCount}));
  }
  if (status === 'needs_range') {
    details.push(strings.choosePages);
  } else if (status === 'ready' && mode === 'searched') {
    details.push(strings.searched);
  } else if (status === 'ready' && documentRef) {
    if (mode === 'full') {
      details.push(strings.inFull);
    }
    details.push(
      t(strings.tokens, {tokens: formatTokenCount(displayTokens(documentRef))}),
    );
  }

  const styles = StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      maxWidth: 260,
      paddingLeft: 10,
      paddingRight: onRemove ? 0 : 12,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceVariant,
      borderWidth: status === 'needs_range' ? 1 : 0,
      borderColor: theme.colors.primary,
    },
    text: {flexShrink: 1, marginLeft: 8},
    name: {color: theme.colors.onSurface},
    details: {color: theme.colors.onSurfaceVariant},
    remove: {margin: 0},
    searchInstead: {
      marginTop: 2,
      color: theme.colors.primary,
    },
  });

  const handlers: Record<string, (() => void) | undefined> = {
    activate: onPress,
    remove: onRemove,
    searchInstead: onSearchInstead,
  };
  const accessibilityActions = [
    ...(onPress ? [{name: 'activate'}] : []),
    ...(onRemove ? [{name: 'remove', label: t(strings.remove, {name})}] : []),
    ...(onSearchInstead
      ? [{name: 'searchInstead', label: strings.searchInstead}]
      : []),
  ];

  return (
    <Pressable
      style={styles.chip}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={event =>
        handlers[event.nativeEvent.actionName]?.()
      }
      onPress={onPress}
      disabled={accessibilityActions.length === 0}
      accessibilityState={{busy: status === 'importing'}}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={[name, ...details].join(', ')}
      testID={testID}>
      {status === 'importing' ? (
        <ActivityIndicator
          size="small"
          color={theme.colors.primary}
          testID={`${testID}-progress`}
        />
      ) : (
        <Icon
          name="file-document-outline"
          size={20}
          color={theme.colors.onSurfaceVariant}
        />
      )}
      <View style={styles.text} testID={`${testID}-text`}>
        <Text variant="labelMedium" numberOfLines={1} style={styles.name}>
          {name}
        </Text>
        {details.length > 0 ? (
          <Text
            variant="labelSmall"
            numberOfLines={2}
            style={styles.details}
            testID={`${testID}-details`}>
            {details.join(' · ')}
          </Text>
        ) : null}
        {onSearchInstead ? (
          <Text
            variant="labelSmall"
            style={styles.searchInstead}
            onPress={onSearchInstead}
            accessibilityRole="button"
            testID={`${testID}-search-instead`}>
            {strings.searchInstead}
          </Text>
        ) : null}
      </View>
      {onRemove ? (
        <IconButton
          icon="close"
          size={16}
          style={styles.remove}
          onPress={onRemove}
          accessibilityLabel={t(strings.remove, {name})}
          testID={`${testID}-remove`}
        />
      ) : null}
    </Pressable>
  );
};
