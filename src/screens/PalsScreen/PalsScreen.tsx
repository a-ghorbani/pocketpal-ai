import React, {useState, useContext} from 'react';
import {FlatList, TouchableOpacity, View} from 'react-native';

import {Text} from 'react-native-paper';
import {observer} from 'mobx-react-lite';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';

import {ChevronLeftMdIcon} from '../../assets/icons';

import {Tabs} from '../../components/ui';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {L10nContext} from '../../utils';
import type {RootStackParamList} from '../../utils/types';

// Components
import {AddPalMenu, MyPalsCard} from './components';

// Unified pal sheet component
import {PalSheet} from '../../components/PalsSheets';

// Pal template factories
import {
  createNewAssistantPal,
  createNewRoleplayPal,
  createNewVideoPal,
  preparePalForEditing,
} from '../../utils/pal-templates';

// Stores
import {palStore, Pal} from '../../store';

type MyPalsTab = 'downloaded' | 'created';

export const PalsScreen: React.FC = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();

  const [activeTab, setActiveTab] = useState<MyPalsTab>('created');

  // Unified pal sheet state
  const [showPalSheet, setShowPalSheet] = useState(false);
  const [currentPal, setCurrentPal] = useState<Partial<Pal> | null>(null);

  const handleCreatePal = (type: 'assistant' | 'roleplay' | 'video') => {
    let newPal: Partial<Pal>;

    switch (type) {
      case 'assistant':
        newPal = createNewAssistantPal();
        break;
      case 'roleplay':
        newPal = createNewRoleplayPal();
        break;
      case 'video':
        newPal = createNewVideoPal();
        break;
      default:
        newPal = createNewAssistantPal();
    }

    setCurrentPal(newPal);
    setShowPalSheet(true);
  };

  const handleEditPal = (pal: Pal) => {
    const preparedPal = preparePalForEditing(pal);
    setCurrentPal(preparedPal);
    setShowPalSheet(true);
  };

  const tabItems = [
    {value: 'downloaded', label: l10n.palsScreen.myPals.tabDownloaded},
    {value: 'created', label: l10n.palsScreen.myPals.tabCreatedByMe},
  ];

  const pals =
    activeTab === 'downloaded'
      ? palStore.getDownloadedPalsHubPals()
      : palStore.getLocalPals();

  const emptyCopy =
    activeTab === 'downloaded'
      ? l10n.palsScreen.myPals.emptyDownloaded
      : l10n.palsScreen.myPals.emptyCreatedByMe;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']} testID="pals-screen">
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          testID="back-button"
          accessibilityLabel={l10n.common.close}
          onPress={() => navigation.goBack()}>
          <ChevronLeftMdIcon stroke={theme.colors.foregroundPrimary} />
        </TouchableOpacity>

        <Text style={styles.title}>{l10n.palsScreen.myPals.title}</Text>

        <AddPalMenu
          iconColor={theme.colors.foregroundPrimary}
          iconSize={20}
          onCreatePal={handleCreatePal}
          anchorPosition="bottom"
          renderAnchor={({open, testID}) => (
            <TouchableOpacity
              style={styles.createAction}
              testID={testID}
              accessibilityLabel={l10n.palsScreen.myPals.createPal}
              onPress={open}>
              <Text style={styles.createActionLabel}>
                + {l10n.palsScreen.myPals.createPal}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <Tabs
        style={styles.tabs}
        variant="underline"
        items={tabItems}
        selectedValue={activeTab}
        onChange={value => setActiveTab(value as MyPalsTab)}
      />

      <FlatList
        data={pals}
        keyExtractor={item => item.id}
        renderItem={({item}) => (
          <MyPalsCard
            pal={item}
            onPress={() => handleEditPal(item)}
            onEdit={() => handleEditPal(item)}
          />
        )}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>{emptyCopy}</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        testID="pals-flat-list"
      />

      {/* Unified Pal Creation/Editing Sheet */}
      {showPalSheet && currentPal && (
        <PalSheet
          isVisible={showPalSheet}
          onClose={() => {
            setShowPalSheet(false);
            setCurrentPal(null);
          }}
          pal={currentPal}
        />
      )}
    </SafeAreaView>
  );
});

export default PalsScreen;
