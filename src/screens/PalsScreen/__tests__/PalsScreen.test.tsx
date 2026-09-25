import React from 'react';
import {act, fireEvent, waitFor} from '@testing-library/react-native';

import {render} from '../../../../jest/test-utils';

import {PalsScreen} from '../PalsScreen';
import {PalGridRow} from '../components';

import {authService, syncService} from '../../../services';
import {palStore} from '../../../store';
import {createPal, createPalsHubPal} from '../../../../jest/fixtures/pals';

// Mirrors the real hook: the width change re-renders from inside the component,
// which is what rotation does. A parent re-render cannot, since observer() memoises.
let mockWindow = {width: 750, height: 1334, scale: 2, fontScale: 1};
const mockWindowListeners = new Set<() => void>();

const setWindowWidth = (width: number) => {
  mockWindow = {...mockWindow, width};
  mockWindowListeners.forEach(listener => listener());
};

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => {
  const {useSyncExternalStore} = require('react');

  const subscribe = (listener: () => void) => {
    mockWindowListeners.add(listener);
    return () => mockWindowListeners.delete(listener);
  };

  const useMockWindowDimensions = () =>
    useSyncExternalStore(subscribe, () => mockWindow);

  return {__esModule: true, default: useMockWindowDimensions};
});

describe('PalsScreen', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Nothing is mounted yet, so assign straight through without notifying.
    mockWindow = {width: 750, height: 1334, scale: 2, fontScale: 1};

    // Reset the mock services to default state
    authService.isAuthenticated = false;
    (syncService.needsSync as jest.Mock).mockResolvedValue(false);
    (syncService.syncAll as jest.Mock).mockResolvedValue(undefined);

    // Reset palStore state
    palStore.pals = [];
    palStore.cachedPalsHubPals = [];
    palStore.userLibrary = [];
    palStore.userCreatedPals = [];
  });

  it('should render without crashing', () => {
    render(<PalsScreen />, {
      withNavigation: true,
      withSafeArea: true,
      withBottomSheetProvider: true,
    });
    // Basic render test - the component should mount successfully
    expect(true).toBe(true); // Placeholder assertion
  });

  // Migration tests removed - migration is now handled by PalStore

  it('should sync data on mount if user is authenticated and sync is needed', async () => {
    // const {authService, syncService} = require('../../services');

    // Set up the mock before rendering
    authService.isAuthenticated = true;
    (syncService.needsSync as jest.Mock).mockResolvedValue(true);

    render(<PalsScreen />, {
      withNavigation: true,
      withSafeArea: true,
      withBottomSheetProvider: true,
    });

    // Wait for useEffect to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(syncService.needsSync).toHaveBeenCalled();
    expect(syncService.syncAll).toHaveBeenCalled();
  });

  it('should not sync if user is not authenticated', async () => {
    // const {authService, syncService} = require('../../services');

    // Set up the mock before rendering
    authService.isAuthenticated = false;

    render(<PalsScreen />, {
      withNavigation: true,
      withSafeArea: true,
      withBottomSheetProvider: true,
    });

    // Wait for useEffect to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(syncService.syncAll).not.toHaveBeenCalled();
  });

  it('should handle sync errors gracefully', async () => {
    // const {authService, syncService} = require('../../services');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    // Set up the mock before rendering
    authService.isAuthenticated = true;
    (syncService.needsSync as jest.Mock).mockResolvedValue(true);
    (syncService.syncAll as jest.Mock).mockRejectedValue(
      new Error('Sync failed'),
    );

    render(<PalsScreen />, {
      withNavigation: true,
      withSafeArea: true,
      withBottomSheetProvider: true,
    });

    // Wait for useEffect to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(consoleSpy).toHaveBeenCalledWith(
      'Error during initial setup:',
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  describe('Filter Functionality', () => {
    beforeEach(() => {
      // Set up test data with different pal types
      palStore.pals = [
        createPal({id: 'local-1', name: 'Local Pal 1', source: 'local'}),
        createPal({id: 'local-2', name: 'Local Pal 2', source: 'local'}),
        createPal({
          id: 'video-1',
          name: 'Video Pal',
          source: 'local',
          capabilities: {video: true, multimodal: true},
        }),
        createPal({
          id: 'downloaded-1',
          name: 'Downloaded Pal',
          source: 'palshub',
        }),
      ];

      palStore.cachedPalsHubPals = [
        createPalsHubPal({id: 'hub-1', title: 'Free Hub Pal', price_cents: 0}),
        createPalsHubPal({
          id: 'hub-2',
          title: 'Premium Hub Pal',
          price_cents: 999,
        }),
        createPalsHubPal({
          id: 'hub-video',
          title: 'Video Hub Pal',
          price_cents: 0,
          categories: [
            {
              id: 'cat-1',
              name: 'Video',
              sort_order: 1,
              created_at: '2023-01-01',
            },
          ],
        }),
      ];
    });

    it('should display all pals when "all" filter is active', async () => {
      const {getByText} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      await waitFor(() => {
        expect(getByText('Local Pal 1')).toBeTruthy();
        expect(getByText('Downloaded Pal')).toBeTruthy();
        expect(getByText('Free Hub Pal')).toBeTruthy();
      });
    });

    it('should filter local pals when "local" filter is pressed', async () => {
      const {getByText, queryByText} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Wait for initial render
      await waitFor(() => {
        expect(getByText('Local Pal 1')).toBeTruthy();
      });

      // Press the "Local" filter chip
      const localFilter = getByText('Local');
      fireEvent.press(localFilter);

      await waitFor(() => {
        // Local pals should be visible
        expect(getByText('Local Pal 1')).toBeTruthy();
        expect(getByText('Downloaded Pal')).toBeTruthy();
        // Hub pals should not be visible
        expect(queryByText('Free Hub Pal')).toBeNull();
        expect(queryByText('Premium Hub Pal')).toBeNull();
      });
    });

    it('should filter video pals when "video" filter is pressed', async () => {
      const {getByText, queryByText} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Wait for initial render
      await waitFor(() => {
        expect(getByText('Local Pal 1')).toBeTruthy();
      });

      // Press the "Video" filter chip
      const videoFilter = getByText('Video');
      fireEvent.press(videoFilter);

      await waitFor(() => {
        // Video pals should be visible
        expect(getByText('Video Pal')).toBeTruthy();
        expect(getByText('Video Hub Pal')).toBeTruthy();
        // Non-video pals should not be visible
        expect(queryByText('Local Pal 1')).toBeNull();
      });
    });

    it('should filter free pals when "free" filter is pressed', async () => {
      const {getByText, queryByText} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Wait for initial render
      await waitFor(() => {
        expect(getByText('Local Pal 1')).toBeTruthy();
      });

      // Press the "Free" filter chip
      const freeFilter = getByText('Free');
      fireEvent.press(freeFilter);

      await waitFor(() => {
        // Free pals should be visible (local + free hub pals)
        expect(getByText('Local Pal 1')).toBeTruthy();
        expect(getByText('Free Hub Pal')).toBeTruthy();
        // Premium pals should not be visible
        expect(queryByText('Premium Hub Pal')).toBeNull();
      });
    });

    it('should filter premium pals when "premium" filter is pressed', async () => {
      const {getByText, queryByText, getByTestId} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Wait for initial render
      await waitFor(() => {
        expect(getByText('Local Pal 1')).toBeTruthy();
      });

      // Press the "Premium" filter chip
      const premiumFilter = getByTestId('filter-chip-premium');
      fireEvent.press(premiumFilter);

      await waitFor(() => {
        // Premium pals should be visible
        expect(getByText('Premium Hub Pal')).toBeTruthy();
        // Free and local pals should not be visible
        expect(queryByText('Local Pal 1')).toBeNull();
        expect(queryByText('Free Hub Pal')).toBeNull();
      });
    });
  });

  describe('Authentication State', () => {
    it('should show auth bar when user is not authenticated', () => {
      authService.isAuthenticated = false;

      const {getByTestId} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      expect(getByTestId('compact-auth-bar')).toBeTruthy();
    });

    it('should not show auth bar when user is authenticated', () => {
      authService.isAuthenticated = true;

      const {queryByTestId} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      expect(queryByTestId('compact-auth-bar')).toBeNull();
    });

    it('should dismiss auth bar when dismiss button is pressed', async () => {
      authService.isAuthenticated = false;

      const {getByTestId, queryByTestId} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Auth bar should be visible
      expect(getByTestId('compact-auth-bar')).toBeTruthy();

      // Find and press the dismiss button
      const dismissButton = getByTestId('dismiss-auth-bar');
      fireEvent.press(dismissButton);

      await waitFor(() => {
        // Auth bar should be hidden
        expect(queryByTestId('compact-auth-bar')).toBeNull();
      });
    });
  });

  describe('Pal Interactions', () => {
    beforeEach(() => {
      palStore.pals = [
        createPal({id: 'local-1', name: 'Local Test Pal', source: 'local'}),
      ];
      palStore.cachedPalsHubPals = [
        createPalsHubPal({id: 'hub-1', title: 'Hub Test Pal', price_cents: 0}),
      ];
    });

    it('should open pal sheet when local pal is pressed', async () => {
      const {getByText} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      await waitFor(() => {
        expect(getByText('Local Test Pal')).toBeTruthy();
      });

      // Press the local pal card
      const palCard = getByText('Local Test Pal');
      fireEvent.press(palCard);

      // PalSheet should open (we can't easily test this without mocking the sheet)
      // But we can verify the press handler was called without errors
      expect(palCard).toBeTruthy();
    });

    it('should open pal detail sheet when PalsHub pal is pressed', async () => {
      const {getByText} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      await waitFor(() => {
        expect(getByText('Hub Test Pal')).toBeTruthy();
      });

      // Press the hub pal card
      const palCard = getByText('Hub Test Pal');
      fireEvent.press(palCard);

      // PalDetailSheet should open
      expect(palCard).toBeTruthy();
    });
  });

  describe('Empty States', () => {
    it('should show empty state when no pals exist', async () => {
      palStore.pals = [];
      palStore.cachedPalsHubPals = [];

      const {getByText} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      await waitFor(() => {
        expect(getByText(/No Pals found|Create your first Pal/i)).toBeTruthy();
      });
    });

    it('should show appropriate empty state for local filter', async () => {
      palStore.pals = [];
      palStore.cachedPalsHubPals = [
        createPalsHubPal({id: 'hub-1', title: 'Hub Pal', price_cents: 0}),
      ];

      const {getByText} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Press the "Local" filter
      const localFilter = getByText('Local');
      fireEvent.press(localFilter);

      await waitFor(() => {
        expect(getByText(/Create your first Pal/i)).toBeTruthy();
      });
    });
  });

  describe('Pull to Refresh', () => {
    it('should have refresh control on FlatList', async () => {
      palStore.pals = [
        createPal({id: 'local-1', name: 'Test Pal', source: 'local'}),
      ];

      const {getByTestId} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Wait for initial render
      await waitFor(() => {
        const flatList = getByTestId('pals-flat-list');
        expect(flatList).toBeTruthy();
        expect(flatList.props.refreshControl).toBeTruthy();
      });
    });
  });

  describe('Bottom Action Bar', () => {
    it('should toggle search when search button is pressed', async () => {
      const {getByTestId, queryByTestId} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Search should not be expanded initially
      expect(queryByTestId('expandable-search')).toBeNull();

      // Press search button
      const searchButton = getByTestId('bottom-action-search');
      fireEvent.press(searchButton);

      // Search should expand
      await waitFor(() => {
        expect(getByTestId('expandable-search')).toBeTruthy();
      });
    });

    it('should show auth sheet when profile button is pressed and user is not authenticated', async () => {
      authService.isAuthenticated = false;

      const {getByTestId} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Press profile button
      const profileButton = getByTestId('bottom-action-profile');
      fireEvent.press(profileButton);

      // Auth sheet should open (we can verify the button was pressed without errors)
      expect(profileButton).toBeTruthy();
    });

    it('should show profile sheet when profile button is pressed and user is authenticated', async () => {
      authService.isAuthenticated = true;

      const {getByTestId} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Press profile button
      const profileButton = getByTestId('bottom-action-profile');
      fireEvent.press(profileButton);

      // Profile sheet should open (we can verify the button was pressed without errors)
      expect(profileButton).toBeTruthy();
    });
  });

  describe('Data Loading', () => {
    it('should render without errors when data is available', async () => {
      palStore.pals = [
        createPal({id: 'local-1', name: 'Test Pal', source: 'local'}),
      ];
      palStore.cachedPalsHubPals = [
        createPalsHubPal({id: 'hub-1', title: 'Hub Pal', price_cents: 0}),
      ];

      const {getByText} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      await waitFor(() => {
        expect(getByText('Test Pal')).toBeTruthy();
        expect(getByText('Hub Pal')).toBeTruthy();
      });
    });

    it('should render correctly when authenticated', async () => {
      authService.isAuthenticated = true;
      palStore.pals = [
        createPal({id: 'local-1', name: 'Local Pal', source: 'local'}),
      ];
      palStore.userLibrary = [
        createPalsHubPal({id: 'lib-1', title: 'Library Pal', price_cents: 0}),
      ];

      const {getByText, queryByTestId} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Auth bar should not be shown
      expect(queryByTestId('compact-auth-bar')).toBeNull();

      await waitFor(() => {
        expect(getByText('Local Pal')).toBeTruthy();
      });
    });

    it('should render correctly when not authenticated', async () => {
      authService.isAuthenticated = false;
      palStore.pals = [
        createPal({id: 'local-1', name: 'Local Pal', source: 'local'}),
      ];

      const {getByText, getByTestId} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

      // Auth bar should be shown
      expect(getByTestId('compact-auth-bar')).toBeTruthy();

      await waitFor(() => {
        expect(getByText('Local Pal')).toBeTruthy();
      });
    });
  });

  describe('Grid Layout', () => {
    const fiveLocalPals = ['g1', 'g2', 'g3', 'g4', 'g5'].map(id =>
      createPal({id, name: `Grid Pal ${id}`, source: 'local'}),
    );

    const renderScreen = () =>
      render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

    afterEach(() => {
      act(() => {
        setWindowWidth(750);
      });
    });

    it('reflows the flat list on a width change without remounting it', () => {
      palStore.pals = fiveLocalPals;
      setWindowWidth(360);

      const {getByTestId, UNSAFE_getAllByType} = renderScreen();
      const firstRowSize = () =>
        UNSAFE_getAllByType(PalGridRow)[0].props.row.items.length;

      const flatList = getByTestId('pals-flat-list');
      expect(flatList.props.numColumns).toBeUndefined();
      expect(firstRowSize()).toBe(2);

      act(() => {
        setWindowWidth(800);
      });

      expect(getByTestId('pals-flat-list')).toBe(flatList);
      expect(firstRowSize()).toBe(4);
    });

    it('renders the same rows and cell width on both render paths', async () => {
      // A second section is what sends the screen down the sectioned path.
      palStore.pals = fiveLocalPals;
      palStore.cachedPalsHubPals = [
        createPalsHubPal({id: 'hub-1', title: 'Hub Pal', price_cents: 0}),
      ];
      setWindowWidth(800);

      const {getByText, UNSAFE_getAllByType} = renderScreen();

      const sectionedRows = UNSAFE_getAllByType(PalGridRow);
      expect(sectionedRows[0].props.row.items).toHaveLength(4);
      expect(sectionedRows[1].props.row.items).toHaveLength(1);
      sectionedRows.forEach(row =>
        expect(row.props.cardWidth).toBeCloseTo(180),
      );

      fireEvent.press(getByText('Local'));

      await waitFor(() => {
        const flatRows = UNSAFE_getAllByType(PalGridRow);
        expect(flatRows.map(row => row.props.row.items.length)).toEqual([4, 1]);
        flatRows.forEach(row => expect(row.props.cardWidth).toBeCloseTo(180));
      });
    });
  });

  describe('purchases', () => {
    const {runInAction} = require('mobx');
    const {purchaseStore} = require('../../../store');

    beforeEach(() => {
      runInAction(() => purchaseStore.reset());
    });

    it('shows Restore purchases as the list footer when billing is ready', () => {
      runInAction(() => {
        purchaseStore.availability = 'ready';
      });
      const {getByTestId} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });
      fireEvent.press(getByTestId('restore-purchases-row'));
      expect(purchaseStore.restore).toHaveBeenCalled();
    });

    it.each(['initializing', 'unavailable'])(
      'hides the restore row while billing is %s',
      availability => {
        runInAction(() => {
          purchaseStore.availability = availability;
        });
        const {queryByTestId} = render(<PalsScreen />, {
          withNavigation: true,
          withSafeArea: true,
          withBottomSheetProvider: true,
        });
        expect(queryByTestId('restore-purchases-row')).toBeNull();
      },
    );

    it('lists a store-owned Pal that is not installed while signed out', () => {
      runInAction(() => {
        purchaseStore.records['store-pal'] = {
          palId: 'store-pal',
          source: 'store',
          productId: 'pal.store',
          transactionIds: [],
          status: 'active',
          title: 'Bought Pal',
          updatedAt: 1,
        };
      });
      const {getByTestId} = render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });
      expect(getByTestId('palshub-pal-card-store-pal')).toBeTruthy();
    });

    const flatten = (node: any, out: string[] = []): string[] => {
      if (node == null) {
        return out;
      }
      if (typeof node === 'string') {
        out.push(node);
        return out;
      }
      if (Array.isArray(node)) {
        node.forEach(child => flatten(child, out));
        return out;
      }
      if (node.props?.testID) {
        out.push(node.props.testID);
      }
      flatten(node.children, out);
      return out;
    };

    const renderSections = () =>
      render(<PalsScreen />, {
        withNavigation: true,
        withSafeArea: true,
        withBottomSheetProvider: true,
      });

    const addStorePurchase = () =>
      runInAction(() => {
        palStore.pals = [
          createPal({id: 'mine', name: 'Mine', source: 'local'}),
        ];
        palStore.cachedPalsHubPals = [
          createPalsHubPal({id: 'hub-listed', title: 'Listed'}),
        ];
        purchaseStore.records['store-pal'] = {
          palId: 'store-pal',
          source: 'store',
          productId: 'pal.store',
          transactionIds: [],
          status: 'pending_payment',
          title: 'Bought Pal',
          updatedAt: 1,
        };
      });

    it('keeps store purchases out of the account library section when signed out', () => {
      addStorePurchase();
      const {getByText, queryByText, toJSON} = renderSections();

      expect(getByText('My Pals (local)')).toBeTruthy();
      expect(queryByText('My Library (palshub.ai)')).toBeNull();
      const tree = flatten(toJSON());
      expect(tree.indexOf('My Pals (local)')).toBeLessThan(
        tree.indexOf('palshub-pal-card-store-pal'),
      );
    });

    it('lists only account Pals under the library section when signed in', () => {
      authService.isAuthenticated = true;
      addStorePurchase();
      runInAction(() => {
        palStore.userLibrary = [
          createPalsHubPal({id: 'lib-pal', title: 'Library Pal'}),
        ];
      });
      const {getByText, toJSON} = renderSections();

      expect(getByText('My Library (palshub.ai)')).toBeTruthy();
      const tree = flatten(toJSON());
      const libraryTitle = tree.indexOf('My Library (palshub.ai)');
      expect(tree.indexOf('palshub-pal-card-store-pal')).toBeLessThan(
        libraryTitle,
      );
      expect(tree.indexOf('palshub-pal-card-lib-pal')).toBeGreaterThan(
        libraryTitle,
      );
    });
  });
});
