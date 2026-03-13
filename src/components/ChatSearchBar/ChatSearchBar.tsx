import React, {useContext, useRef, useEffect} from 'react';
import {View, TextInput, TouchableOpacity, StyleSheet} from 'react-native';

import {observer} from 'mobx-react';
import {Text} from 'react-native-paper';

import {useTheme} from '../../hooks';
import {chatSessionStore} from '../../store';

import {SearchIcon, CloseIcon} from '../../assets/icons';
import {L10nContext} from '../../utils';

interface ChatSearchBarProps {
  matchCount: number;
}

export const ChatSearchBar: React.FC<ChatSearchBarProps> = observer(
  ({matchCount}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const inputRef = useRef<TextInput>(null);

    useEffect(() => {
      // Auto-focus when search bar appears
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }, []);

    const hasQuery = chatSessionStore.searchQuery.trim().length > 0;

    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.outlineVariant,
          },
        ]}>
        <View style={styles.inputRow}>
          <SearchIcon
            width={18}
            height={18}
            stroke={theme.colors.onSurfaceVariant}
          />
          <TextInput
            ref={inputRef}
            style={[styles.input, {color: theme.colors.onSurface}]}
            placeholder={l10n.chat.searchMessages}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={chatSessionStore.searchQuery}
            onChangeText={query => chatSessionStore.setSearchQuery(query)}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            testID="chat-search-input"
          />
          {hasQuery && (
            <Text
              variant="bodySmall"
              style={[
                styles.matchCount,
                {color: theme.colors.onSurfaceVariant},
              ]}>
              {matchCount > 0 ? `${matchCount}` : l10n.chat.noResults}
            </Text>
          )}
          <TouchableOpacity
            onPress={() => chatSessionStore.exitSearchMode()}
            style={styles.closeButton}
            testID="search-close-button">
            <CloseIcon
              width={18}
              height={18}
              stroke={theme.colors.onSurfaceVariant}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
  matchCount: {
    marginHorizontal: 4,
  },
  closeButton: {
    padding: 4,
  },
});
