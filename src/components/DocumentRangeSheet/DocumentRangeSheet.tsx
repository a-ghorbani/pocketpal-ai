import React, {useContext, useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';

import {Button, Text} from 'react-native-paper';

import {Sheet, TextInput} from '..';
import {useTheme} from '../../hooks';
import {t} from '../../locales';
import {L10nContext} from '../../utils';
import {
  MAX_DOCUMENT_CHARS,
  MAX_RANGE_PAGES,
  type DocumentRef,
  type RangeLimitReason,
} from '../../services/documents/types';

interface DocumentRangeSheetProps {
  isVisible: boolean;
  documentRef: DocumentRef;
  rangeLimit?: RangeLimitReason;
  isApplying?: boolean;
  onApply: (from: number, to: number) => void;
  onClose: () => void;
}

const parsePage = (value: string): number | undefined => {
  const page = Number(value.trim());
  return Number.isInteger(page) ? page : undefined;
};

export const DocumentRangeSheet: React.FC<DocumentRangeSheetProps> = ({
  isVisible,
  documentRef,
  rangeLimit,
  isApplying = false,
  onApply,
  onClose,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const strings = l10n.chat.documents.rangeSheet;
  const total = documentRef.pageCount ?? 1;

  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');

  useEffect(() => {
    setFromText(
      documentRef.pageRange ? String(documentRef.pageRange.from) : '',
    );
    setToText(documentRef.pageRange ? String(documentRef.pageRange.to) : '');
  }, [documentRef.id, documentRef.pageRange]);

  const from = parsePage(fromText);
  const to = parsePage(toText);
  const inBounds =
    from !== undefined &&
    to !== undefined &&
    from >= 1 &&
    to <= total &&
    from <= to;
  const tooManyPages = inBounds && to! - from! + 1 > MAX_RANGE_PAGES;
  const showInvalid = fromText !== '' && toText !== '' && !inBounds;

  const showsFailedRange = documentRef.pageRange
    ? from === documentRef.pageRange.from && to === documentRef.pageRange.to
    : fromText === '' && toText === '';
  const limitMessage = tooManyPages
    ? t(strings.tooManyPages, {max: MAX_RANGE_PAGES})
    : rangeLimit === 'too_many_chars' && showsFailedRange
      ? strings.tooManyChars
      : undefined;

  const styles = StyleSheet.create({
    container: {padding: 16, gap: 12},
    body: {color: theme.colors.onSurfaceVariant},
    row: {flexDirection: 'row', gap: 12},
    input: {flex: 1},
    error: {color: theme.colors.error},
    button: {flex: 1},
  });

  return (
    <Sheet
      isVisible={isVisible}
      onClose={onClose}
      title={strings.title}
      snapPoints={['60%']}>
      <Sheet.ScrollView contentContainerStyle={styles.container}>
        <Text variant="titleSmall" numberOfLines={1}>
          {documentRef.name}
        </Text>
        <Text variant="bodyMedium" style={styles.body}>
          {t(strings.body, {
            total,
            maxPages: MAX_RANGE_PAGES,
            maxChars: MAX_DOCUMENT_CHARS.toLocaleString(),
          })}
        </Text>
        <View style={styles.row}>
          <View style={styles.input}>
            <TextInput
              testID="document-range-from"
              label={strings.from}
              value={fromText}
              onChangeText={setFromText}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.input}>
            <TextInput
              testID="document-range-to"
              label={strings.to}
              value={toText}
              onChangeText={setToText}
              keyboardType="number-pad"
            />
          </View>
        </View>
        {showInvalid ? (
          <Text variant="bodySmall" style={styles.error}>
            {t(strings.invalid, {total})}
          </Text>
        ) : null}
        {limitMessage ? (
          <Text
            variant="bodySmall"
            style={styles.error}
            testID="document-range-limit">
            {limitMessage}
          </Text>
        ) : null}
      </Sheet.ScrollView>
      <Sheet.Actions>
        <Button
          mode="outlined"
          onPress={onClose}
          style={styles.button}
          testID="document-range-cancel">
          {strings.cancel}
        </Button>
        <Button
          mode="contained"
          onPress={() => onApply(from!, to!)}
          disabled={!inBounds || tooManyPages || isApplying}
          loading={isApplying}
          style={styles.button}
          testID="document-range-apply">
          {strings.apply}
        </Button>
      </Sheet.Actions>
    </Sheet>
  );
};
