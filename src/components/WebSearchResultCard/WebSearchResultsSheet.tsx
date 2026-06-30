import React, {useContext} from 'react';
import {Linking, TouchableOpacity, View} from 'react-native';

import {Text} from 'react-native-paper';

import {Sheet} from '..';
import {useTheme} from '../../hooks';

import {sheetStyles} from './styles';

import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {WebSearchResultItem} from '../../services/talents/types';

interface WebSearchResultsSheetProps {
  isVisible: boolean;
  query: string;
  results: WebSearchResultItem[];
  onDismiss: () => void;
}

// Only follow plain http(s) links from a result row. Untrusted page content
// could otherwise smuggle a `file:`/`javascript:`/`data:` URL into a hit.
const isOpenableUrl = (url: string): boolean => /^https?:\/\//i.test(url);

/**
 * Bottom-sheet body for a `web_search` outcome: the full hit list. Each row is
 * tappable and opens its URL in the system browser. Mounted on demand by the
 * compact in-chat trigger in `WebSearchResultBubble`.
 */
export const WebSearchResultsSheet: React.FC<WebSearchResultsSheetProps> = ({
  isVisible,
  query,
  results,
  onDismiss,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);

  const styles = sheetStyles({theme});

  const openUrl = (url: string) => {
    if (isOpenableUrl(url)) {
      Linking.openURL(url);
    }
  };

  return (
    <Sheet
      isVisible={isVisible}
      onClose={onDismiss}
      title={l10n.chat.webSearch.searchResultsTitle}
      snapPoints={['60%']}>
      <Sheet.ScrollView
        contentContainerStyle={styles.container}
        testID="web-search-results-sheet">
        <Text style={styles.subtitle} numberOfLines={1}>
          {t(l10n.chat.webSearch.searched, {query})}
        </Text>

        {results.length === 0 ? (
          <Text style={styles.empty} testID="web-search-results-sheet-empty">
            {l10n.chat.webSearch.noResults}
          </Text>
        ) : (
          results.map((item, i) => (
            <TouchableOpacity
              key={`${item.url}-${i}`}
              style={styles.result}
              onPress={() => openUrl(item.url)}
              accessibilityRole="button"
              testID="web-search-result-row">
              <Text variant="labelMedium" style={styles.title}>
                {item.title || item.url}
              </Text>
              <Text style={styles.url} numberOfLines={1}>
                {item.url}
              </Text>
              {item.snippet ? (
                <Text style={styles.snippet} numberOfLines={3}>
                  {item.snippet}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))
        )}
        <View style={styles.bottomSpacer} />
      </Sheet.ScrollView>
    </Sheet>
  );
};
