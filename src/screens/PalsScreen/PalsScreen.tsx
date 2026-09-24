import React, {useState, useEffect, useCallback, useContext} from 'react';
import {
  View,
  FlatList,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import {Button, Text} from 'react-native-paper';
import {observer} from 'mobx-react-lite';

import {PlusIcon} from '../../assets/icons';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {handlePalByType} from '../../utils/pal-type-guards';
import {L10nContext} from '../../utils';
import {chunkIntoRows, computePalGridLayout} from './palGridLayout';
import {myPals} from './myPals';

import type {PalGridItem} from './palGridLayout';

// Components
import {
  BottomActionBar,
  BottomActionType,
  CompactAuthBar,
  ExpandableSearch,
  FilterChips,
  FilterType,
  PalGridRow,
  ProfileSheet,
} from './components';

import {SectionDivider} from '../../components/PalsSheets/SectionDivider';

// Unified pal sheet component
import {PalSheet} from '../../components/PalsSheets';
import {AuthSheet, PalDetailSheet} from '../../components/PalsHub';

// Pal template factories
import {
  createNewAssistantPal,
  createNewRoleplayPal,
  createNewVideoPal,
  preparePalForEditing,
} from '../../utils/pal-templates';

// Services and stores
import {authService, syncService} from '../../services';
import {palStore, purchaseStore, Pal} from '../../store';
import {hasVideoCapability} from '../../utils/pal-capabilities';

import type {PalsHubPal} from '../../types/palshub';

const SectionGrid: React.FC<{
  section: {title: string; data: PalGridItem[]};
  columns: number;
  cardWidth: number;
  onPalPress: (pal: PalGridItem) => void;
}> = ({section, columns, cardWidth, onPalPress}) => (
  <View>
    {section.title ? <SectionDivider label={section.title} /> : null}
    {chunkIntoRows(section.data, columns).map(row => (
      <PalGridRow
        key={row.key}
        row={row}
        cardWidth={cardWidth}
        onPalPress={onPalPress}
      />
    ))}
  </View>
);

export const PalsScreen: React.FC = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);
  const {width: windowWidth} = useWindowDimensions();

  // Navigation state
  const [activeAction, setActiveAction] = useState<BottomActionType>('search');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  // Search state
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchResults, setSearchResults] = useState<PalsHubPal[]>([]);

  // Sheet states
  const [showProfile, setShowProfile] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showPalDetail, setShowPalDetail] = useState(false);
  const [selectedPal, setSelectedPal] = useState<PalsHubPal | null>(null);

  // Unified pal sheet state
  const [showPalSheet, setShowPalSheet] = useState(false);
  const [currentPal, setCurrentPal] = useState<Partial<Pal> | null>(null);

  // Loading state
  const [refreshing, setRefreshing] = useState(false);

  // Auth bar state
  const [showAuthBar, setShowAuthBar] = useState(true);

  useEffect(() => {
    const runInitialSetup = async () => {
      try {
        // Start sync service if user is authenticated
        if (authService.isAuthenticated) {
          const needsSync = await syncService.needsSync();
          if (needsSync) {
            console.log('Syncing with PalsHub...');
            await syncService.syncAll();
          }
        }
      } catch (error) {
        console.error('Error during initial setup:', error);
      }
    };

    runInitialSetup();
  }, []);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

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

  const loadData = async () => {
    try {
      // Load public pals for browsing
      await palStore.searchPalsHubPals({sortBy: 'newest', limit: 20});
      if (authService.isAuthenticated) {
        await Promise.all([
          palStore.loadUserLibrary(),
          palStore.loadUserCreatedPals(),
        ]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData();
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleActionPress = (action: BottomActionType) => {
    setActiveAction(action);

    switch (action) {
      case 'search':
        setIsSearchExpanded(!isSearchExpanded);
        break;
      case 'profile':
        if (authService.isAuthenticated) {
          setShowProfile(true);
        } else {
          setShowAuth(true);
        }
        break;
    }
  };

  const handlePalPress = (pal: PalsHubPal | Pal) => {
    handlePalByType(pal, {
      onLocalPal: localPal => {
        // Local pal - handle edit
        handleEditPal(localPal);
      },
      onPalsHubPal: palsHubPal => {
        // PalsHub pal - show detail sheet
        setSelectedPal(palsHubPal);
        setShowPalDetail(true);
      },
    });
  };

  const handleEditPal = (pal: Pal) => {
    const preparedPal = preparePalForEditing(pal);
    setCurrentPal(preparedPal);
    setShowPalSheet(true);
  };

  const ownedPals = () =>
    myPals(
      palStore.getLocalPals(),
      palStore.getDownloadedPalsHubPals(),
      authService.isAuthenticated ? palStore.userLibrary : [],
      authService.isAuthenticated ? palStore.userCreatedPals : [],
      palStore.cachedPalsHubPals,
      Object.values(purchaseStore.records),
    );

  // Get filtered data based on current filter and search
  const getFilteredData = (): (PalsHubPal | Pal)[] => {
    if (isSearchExpanded && searchResults.length > 0) {
      return searchResults;
    }

    const localPals = palStore.getLocalPals();
    const downloadedPals = palStore.getDownloadedPalsHubPals();
    const hubPals = palStore.cachedPalsHubPals;

    switch (activeFilter) {
      case 'my-pals': {
        const {installed, notInstalled} = ownedPals();
        return [...installed, ...notInstalled];
      }
      case 'local':
        return [...localPals, ...downloadedPals];
      case 'video':
        return [
          ...localPals.filter(p => hasVideoCapability(p)),
          ...downloadedPals.filter(p => hasVideoCapability(p)),
          ...hubPals.filter(p =>
            p.categories?.some(c => c.name.toLowerCase().includes('video')),
          ),
        ];
      case 'free':
        return [...localPals, ...hubPals.filter(p => p.price_cents === 0)];
      case 'premium':
        return hubPals.filter(p => p.price_cents > 0);
      case 'all':
      default: {
        const {installed, notInstalled} = ownedPals();
        return [...installed, ...notInstalled, ...hubPals];
      }
    }
  };

  const getSectionedData = (): Array<{
    title: string;
    data: (PalsHubPal | Pal)[];
  }> => {
    if (isSearchExpanded && searchResults.length > 0) {
      return [{title: '', data: searchResults}];
    }

    const hubPals = palStore.cachedPalsHubPals;

    switch (activeFilter) {
      case 'all':
      case 'my-pals': {
        const sections: Array<{title: string; data: (PalsHubPal | Pal)[]}> = [];
        const {installed, notInstalled} = ownedPals();

        if (installed.length > 0) {
          sections.push({
            title: l10n.palsScreen.sectionTitles.myPalsLocal,
            data: installed,
          });
        }
        if (notInstalled.length > 0) {
          sections.push({
            title: l10n.palsScreen.sectionTitles.myLibrary,
            data: notInstalled,
          });
        }
        if (activeFilter === 'all' && hubPals.length > 0) {
          sections.push({
            title: l10n.palsScreen.sectionTitles.discoverPals,
            data: hubPals,
          });
        }

        return sections;
      }
      default:
        // For other filters, use single section without header
        return [{title: '', data: getFilteredData()}];
    }
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <PlusIcon stroke={theme.colors.onSurfaceVariant} width={48} height={48} />
      <Text style={styles.emptyStateText}>
        {activeFilter === 'local' || activeFilter === 'my-pals'
          ? 'No Pals yet.\nCreate your first Pal using the + button!'
          : 'No Pals found.\nTry adjusting your filters or search.'}
      </Text>
    </View>
  );

  const restoreRow =
    purchaseStore.availability === 'ready' ? (
      <Button
        testID="restore-purchases-row"
        mode="text"
        onPress={() => purchaseStore.restore()}
        loading={purchaseStore.isRestoring}
        disabled={purchaseStore.isRestoring}
        style={styles.restoreRow}>
        {l10n.palsScreen.purchase.restorePurchases}
      </Button>
    ) : null;

  const {columns, cardWidth} = computePalGridLayout(windowWidth);
  const filteredData = getFilteredData();
  const rows = chunkIntoRows(filteredData, columns);
  const sectionedData = getSectionedData();
  const shouldUseSections =
    (activeFilter === 'all' || activeFilter === 'my-pals') &&
    sectionedData.length > 1;

  return (
    <View style={styles.container}>
      {/* Compact Auth Bar - Only for unauthenticated users and when not dismissed */}
      {!authService.isAuthenticated && showAuthBar && (
        <CompactAuthBar
          isAuthenticated={authService.isAuthenticated}
          onSignInPress={() => setShowAuth(true)}
          onProfilePress={() => setShowProfile(true)}
          onDismiss={() => setShowAuthBar(false)}
        />
      )}

      {/* Expandable Search */}
      <ExpandableSearch
        isExpanded={isSearchExpanded}
        onToggle={() => setIsSearchExpanded(!isSearchExpanded)}
        onSearchResults={setSearchResults}
      />

      {/* Filter Chips */}
      <FilterChips
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        isAuthenticated={authService.isAuthenticated}
      />

      {/* Main Content */}
      {shouldUseSections ? (
        <ScrollView
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}>
          {sectionedData.length === 0
            ? renderEmptyState()
            : sectionedData.map((section, index) => (
                <SectionGrid
                  key={`section-${index}`}
                  section={section}
                  columns={columns}
                  cardWidth={cardWidth}
                  onPalPress={handlePalPress}
                />
              ))}
          {restoreRow}
        </ScrollView>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={row => row.key}
          renderItem={({item}) => (
            <PalGridRow
              row={item}
              cardWidth={cardWidth}
              onPalPress={handlePalPress}
            />
          )}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={renderEmptyState}
          ListFooterComponent={restoreRow}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
          testID="pals-flat-list"
        />
      )}

      {/* Bottom Action Bar */}
      <BottomActionBar
        activeAction={activeAction}
        onActionPress={handleActionPress}
        onCreatePal={handleCreatePal}
        isAuthenticated={authService.isAuthenticated}
      />

      {/* Sheets */}

      {/* Profile Sheet */}
      {showProfile && (
        <ProfileSheet
          isVisible={showProfile}
          onClose={() => setShowProfile(false)}
          onSignInPress={() => setShowAuth(true)}
        />
      )}

      {/* Auth Sheet */}
      {showAuth && (
        <AuthSheet
          isVisible={showAuth}
          onClose={() => {
            setShowAuth(false);
            if (!authService.isAuthenticated) {
              purchaseStore.cancelLinkRequest();
            }
          }}
        />
      )}

      {/* Palhub's Pal Detail Sheet */}
      {selectedPal && (
        <PalDetailSheet
          isVisible={showPalDetail}
          pal={selectedPal}
          onSignInPress={() => setShowAuth(true)}
          onClose={() => {
            setShowPalDetail(false);
            setSelectedPal(null);
          }}
        />
      )}

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
    </View>
  );
});

export default PalsScreen;
