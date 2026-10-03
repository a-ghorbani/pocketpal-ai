import React, {useContext, useState} from 'react';
import {TouchableOpacity, View} from 'react-native';

import {Text} from 'react-native-paper';

import {ChevronRightIcon, SearchIcon} from '../../assets/icons';
import {useTheme} from '../../hooks';

import {WebSearchResultsSheet} from './WebSearchResultsSheet';
import {styles} from './styles';

import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {WebSearchResultItem} from '../../services/talents/types';

interface WebSearchResultBubbleProps {
  query: string;
  results: WebSearchResultItem[];
}

export const WebSearchResultBubble: React.FC<WebSearchResultBubbleProps> = ({
  query,
  results,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const [sheetVisible, setSheetVisible] = useState(false);

  const componentStyles = styles({theme});

  if (results.length === 0) {
    return (
      <View style={componentStyles.row} testID="web-search-result-card">
        <SearchIcon
          width={14}
          height={14}
          stroke={theme.colors.textSecondary}
        />
        <Text style={componentStyles.label} numberOfLines={1}>
          {t(l10n.chat.webSearch.noResultsFor, {query})}
        </Text>
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={componentStyles.row}
        hitSlop={{top: 12, bottom: 12}}
        onPress={() => setSheetVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={t(
          l10n.chat.webSearch.showResultsAccessibilityLabel,
          {query},
        )}
        testID="web-search-result-trigger">
        <SearchIcon
          width={14}
          height={14}
          stroke={theme.colors.textSecondary}
        />
        {/* Split so a long query truncates but the count never does. */}
        <Text style={componentStyles.label} numberOfLines={1}>
          {t(l10n.chat.webSearch.searched, {query})}
        </Text>
        <Text style={componentStyles.count} numberOfLines={1}>
          {'·  '}
          {results.length === 1
            ? l10n.chat.webSearch.resultsCountOne
            : t(l10n.chat.webSearch.resultsCount, {count: results.length})}
        </Text>
        <ChevronRightIcon
          width={14}
          height={14}
          stroke={theme.colors.textSecondary}
        />
      </TouchableOpacity>

      <WebSearchResultsSheet
        isVisible={sheetVisible}
        query={query}
        results={results}
        onDismiss={() => setSheetVisible(false)}
      />
    </>
  );
};
