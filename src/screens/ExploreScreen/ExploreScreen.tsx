import React, {useContext, useState} from 'react';
import {Text, View} from 'react-native';

import {observer} from 'mobx-react-lite';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button, Tabs} from '../../components/ui';
import {AuthSheet} from '../../components/PalsHub';

import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';

import {authService} from '../../services';

import {ExplorePalsPanel} from './components';
import {createStyles} from './styles';

type SubTab = 'pals' | 'models';

export const ExploreScreen: React.FC = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);

  const [subTab, setSubTab] = useState<SubTab>('pals');
  const [showAuth, setShowAuth] = useState(false);

  const isAuthenticated = authService.isAuthenticated;

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

      {!isAuthenticated && (
        <View style={styles.promoCard} testID="explore-promo-card">
          <Text style={styles.promoTitle}>{l10n.explore.promoTitle}</Text>
          <Text style={styles.promoSubtitle}>{l10n.explore.promoSubtitle}</Text>
          <Button
            testID="explore-promo-login"
            accessibilityLabel={l10n.explore.promoAction}
            style={styles.promoAction}
            onPress={() => setShowAuth(true)}>
            <Text style={styles.promoActionLabel}>
              {l10n.explore.promoAction}
            </Text>
          </Button>
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
        {subTab === 'pals' ? (
          <ExplorePalsPanel
            isAuthenticated={isAuthenticated}
            onSignInPress={() => setShowAuth(true)}
          />
        ) : (
          <View style={styles.comingSoon} testID="explore-models-panel">
            <Text style={styles.comingSoonText}>
              {l10n.explore.modelsComingSoon}
            </Text>
          </View>
        )}
      </View>

      {showAuth && (
        <AuthSheet isVisible={showAuth} onClose={() => setShowAuth(false)} />
      )}
    </SafeAreaView>
  );
});
