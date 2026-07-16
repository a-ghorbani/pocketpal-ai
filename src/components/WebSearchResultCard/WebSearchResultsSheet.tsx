import React, {useContext, useState} from 'react';
import {Linking, TouchableOpacity, View} from 'react-native';

import {Snackbar, Text} from 'react-native-paper';

import {Sheet} from '../Sheet';
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

export const WebSearchResultsSheet: React.FC<WebSearchResultsSheetProps> = ({
  isVisible,
  query,
  results,
  onDismiss,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const [showOpenError, setShowOpenError] = useState(false);

  const styles = sheetStyles({theme});

  const openUrl = async (url: string) => {
    if (!isOpenableUrl(url)) {
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      setShowOpenError(true);
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
          results.map((item, i) => {
            const rowContent = (
              <>
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
              </>
            );
            // A non-openable URL must not present as a tappable button.
            return isOpenableUrl(item.url) ? (
              <TouchableOpacity
                key={`${item.url}-${i}`}
                style={styles.result}
                hitSlop={{top: 8, bottom: 8}}
                onPress={() => openUrl(item.url)}
                accessibilityRole="button"
                testID="web-search-result-row">
                {rowContent}
              </TouchableOpacity>
            ) : (
              <View
                key={`${item.url}-${i}`}
                style={styles.result}
                testID="web-search-result-row">
                {rowContent}
              </View>
            );
          })
        )}
        <View style={styles.bottomSpacer} />
      </Sheet.ScrollView>
      {/* Inside the sheet's modal layer — the gorhom portal paints above
            siblings and paper Portals, which would hide this feedback. */}
      <Snackbar
        visible={showOpenError}
        onDismiss={() => setShowOpenError(false)}
        duration={3000}
        action={{
          label: l10n.common.dismiss,
          onPress: () => setShowOpenError(false),
        }}>
        {l10n.chat.webSearch.openLinkError}
      </Snackbar>
    </Sheet>
  );
};
