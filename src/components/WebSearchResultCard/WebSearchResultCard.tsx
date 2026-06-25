import React, {useContext} from 'react';
import {View} from 'react-native';

import {Text} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {useTheme} from '../../hooks';

import {styles} from './styles';

import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {WebSearchResultItem} from '../../services/talents/types';

interface WebSearchResultCardProps {
  query: string;
  results: WebSearchResultItem[];
}

/**
 * Compact card for a `web_search` outcome: a "Searched: {query}" header and one
 * row per hit (title, source URL, snippet). The model reads the wrapped menu in
 * the result summary; this surface is the human-facing view of the same hits.
 */
export const WebSearchResultCard: React.FC<WebSearchResultCardProps> = ({
  query,
  results,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);

  const componentStyles = styles({theme});

  return (
    <View style={componentStyles.container} testID="web-search-result-card">
      <View style={componentStyles.header}>
        <Icon
          name="magnify"
          style={componentStyles.headerIcon}
          testID="web-search-result-card-icon"
        />
        <Text style={componentStyles.headerText} numberOfLines={1}>
          {t(l10n.chat.webSearch.searched, {query})}
        </Text>
      </View>

      {results.length === 0 ? (
        <Text style={componentStyles.empty} testID="web-search-result-empty">
          {l10n.chat.webSearch.noResults}
        </Text>
      ) : (
        results.map((item, i) => (
          <View
            key={`${item.url}-${i}`}
            style={componentStyles.result}
            testID="web-search-result-row">
            <Text variant="labelMedium" style={componentStyles.title}>
              {item.title || item.url}
            </Text>
            <Text style={componentStyles.url} numberOfLines={1}>
              {item.url}
            </Text>
            {item.snippet ? (
              <Text style={componentStyles.snippet} numberOfLines={2}>
                {item.snippet}
              </Text>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
};
