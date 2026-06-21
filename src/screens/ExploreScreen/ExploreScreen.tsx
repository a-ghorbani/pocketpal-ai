import React, {useContext, useState} from 'react';
import {Text, View} from 'react-native';

import {observer} from 'mobx-react-lite';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button, Tabs} from '../../components/ui';

import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';

import {authService} from '../../services';

import {createStyles} from './styles';

type SubTab = 'pals' | 'models';

export const ExploreScreen: React.FC = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);

  const [subTab, setSubTab] = useState<SubTab>('pals');

  const tabItems = [
    {value: 'pals', label: l10n.explore.tabPals},
    {value: 'models', label: l10n.explore.tabModels, disabled: true},
  ];

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top']}
      testID="explore-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{l10n.explore.title}</Text>
      </View>

      {!authService.isAuthenticated && (
        <View style={styles.promoCard} testID="explore-promo-card">
          <Text style={styles.promoTitle}>{l10n.explore.promoTitle}</Text>
          <Text style={styles.promoSubtitle}>{l10n.explore.promoSubtitle}</Text>
          <Button
            testID="explore-promo-login"
            variant="secondary"
            label={l10n.explore.promoAction}
            style={styles.promoAction}
          />
        </View>
      )}

      <Tabs
        style={styles.tabs}
        variant="pill"
        items={tabItems}
        selectedValue={subTab}
        onChange={value => setSubTab(value as SubTab)}
      />

      <View style={styles.panel}>
        {subTab === 'models' && (
          <View style={styles.comingSoon} testID="explore-models-panel">
            <Text style={styles.comingSoonText}>
              {l10n.explore.modelsComingSoon}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
});
