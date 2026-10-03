import React, {useContext, useMemo, useState} from 'react';
import {Text} from 'react-native';
import {observer} from 'mobx-react';

import {ChevronDownIcon} from '../../assets/icons';
import {useTheme} from '../../hooks';
import {AvailableLanguage, languageDisplayNames} from '../../locales';
import {uiStore} from '../../store';
import {L10nContext} from '../../utils';
import {SearchableSelectSheet} from '../SearchableSelectSheet';
import {Pressable} from '../ui/primitives/Pressable';

import {createStyles} from './styles';

/**
 * App-language control: a content-sized trigger plus the shared searchable
 * sheet. Search keeps every locale reachable by typing its Latin code even
 * when the UI is in a script the user cannot read.
 */
export const LanguageSelector: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);
  const [sheetOpen, setSheetOpen] = useState(false);

  const options = useMemo(
    () =>
      uiStore.supportedLanguages.map(lang => ({
        value: lang,
        label: languageDisplayNames[lang],
      })),
    [],
  );

  return (
    <>
      <Pressable
        testID="language-selector-button"
        accessibilityRole="button"
        accessibilityLabel={languageDisplayNames[uiStore.language]}
        onPress={() => setSheetOpen(true)}
        style={styles.trigger}>
        <Text style={styles.triggerLabel} numberOfLines={1}>
          {languageDisplayNames[uiStore.language]}
        </Text>
        <ChevronDownIcon
          width={18}
          height={18}
          stroke={theme.colors.onSurface}
        />
      </Pressable>
      <SearchableSelectSheet
        testID="language-sheet"
        searchTestID="language-search"
        optionTestIDPrefix="language-option"
        isVisible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={l10n.settings.languageSheetTitle}
        searchPlaceholder={l10n.settings.languageSearchPlaceholder}
        options={options}
        value={uiStore.language}
        onSelect={value => uiStore.setLanguage(value as AvailableLanguage)}
      />
    </>
  );
});
