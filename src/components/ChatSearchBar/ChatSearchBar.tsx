import React, {useContext, useRef} from 'react';
import {View, TextInput, TouchableOpacity} from 'react-native';

import {observer} from 'mobx-react';
import {Text} from 'react-native-paper';

import {useTheme} from '../../hooks';
import {chatSessionStore} from '../../store';

import {
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  SearchIcon,
} from '../../assets/icons';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

const HIT_SLOP = {top: 8, bottom: 8, left: 8, right: 8};

export const ChatSearchBar: React.FC = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);
  const inputRef = useRef<TextInput>(null);

  const query = chatSessionStore.searchQuery;
  const hasQuery = query.trim().length > 0;
  const total = chatSessionStore.searchMatchCount;
  const position = chatSessionStore.activeMatchPosition;
  const canNavigate = total > 0;

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <SearchIcon
          width={18}
          height={18}
          stroke={theme.colors.onSurfaceVariant}
        />
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={l10n.chat.search.placeholder}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          value={query}
          onChangeText={next => chatSessionStore.setSearchQuery(next)}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoFocus
          returnKeyType="search"
          onSubmitEditing={() => chatSessionStore.goToNextMatch()}
          accessibilityLabel={l10n.chat.search.placeholder}
          testID="chat-search-input"
        />

        {hasQuery && (
          <Text
            variant="bodySmall"
            style={styles.matchCount}
            accessibilityLiveRegion="polite"
            accessibilityLabel={
              canNavigate
                ? l10n.chat.search.matchPosition
                    .replace('{{position}}', String(position))
                    .replace('{{total}}', String(total))
                : l10n.chat.search.noResults
            }
            testID="search-match-count">
            {canNavigate ? `${position}/${total}` : l10n.chat.search.noResults}
          </Text>
        )}

        <TouchableOpacity
          onPress={() => chatSessionStore.goToPreviousMatch()}
          disabled={!canNavigate}
          hitSlop={HIT_SLOP}
          style={styles.navButton}
          accessibilityRole="button"
          accessibilityState={{disabled: !canNavigate}}
          accessibilityLabel={l10n.chat.search.previousMatch}
          testID="search-previous-button">
          <ChevronUpIcon
            width={18}
            height={18}
            stroke={
              canNavigate
                ? theme.colors.onSurfaceVariant
                : theme.colors.onSurfaceDisabled
            }
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => chatSessionStore.goToNextMatch()}
          disabled={!canNavigate}
          hitSlop={HIT_SLOP}
          style={styles.navButton}
          accessibilityRole="button"
          accessibilityState={{disabled: !canNavigate}}
          accessibilityLabel={l10n.chat.search.nextMatch}
          testID="search-next-button">
          <ChevronDownIcon
            width={18}
            height={18}
            stroke={
              canNavigate
                ? theme.colors.onSurfaceVariant
                : theme.colors.onSurfaceDisabled
            }
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => chatSessionStore.exitSearchMode()}
          hitSlop={HIT_SLOP}
          style={styles.navButton}
          accessibilityRole="button"
          accessibilityLabel={l10n.chat.search.close}
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
});
