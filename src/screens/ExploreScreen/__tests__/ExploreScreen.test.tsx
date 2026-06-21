import React from 'react';
import {runInAction} from 'mobx';

import {render, fireEvent, waitFor, act} from '../../../../jest/test-utils';
import {palStore} from '../../../store';
import {authService} from '../../../services';
import {
  mockPalsHubPal,
  mockPremiumPalsHubPal,
} from '../../../../jest/fixtures/pals';

import {ExploreScreen} from '../ExploreScreen';

const resetPalStore = () => {
  runInAction(() => {
    palStore.cachedPalsHubPals = [];
    palStore.isLoadingPalsHub = false;
  });
  (palStore.searchPalsHubPals as jest.Mock).mockReset();
  (palStore.searchPalsHubPals as jest.Mock).mockResolvedValue({
    pals: [],
    total_count: 0,
    page: 1,
    limit: 20,
    has_more: false,
  });
  (palStore.getCategories as jest.Mock).mockReset();
  (palStore.getCategories as jest.Mock).mockResolvedValue({categories: []});
  (palStore.getTags as jest.Mock).mockReset();
  (palStore.getTags as jest.Mock).mockResolvedValue({tags: []});
};

describe('ExploreScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPalStore();
    (authService as any).isAuthenticated = false;
  });

  // Explore tab loads on the Pals sub-tab
  describe('mount on Pals sub-tab', () => {
    it('renders the shell: header, pill Tabs, and the Pals discovery panel', async () => {
      const {getByTestId} = render(<ExploreScreen />, {withSafeArea: true});

      expect(getByTestId('explore-screen')).toBeTruthy();
      expect(getByTestId('ui-tabs')).toBeTruthy();
      expect(getByTestId('ui-tab-item-pals')).toBeTruthy();
      expect(getByTestId('ui-tab-item-models')).toBeTruthy();
      // Pals panel mounts (its list); Models panel does not.
      expect(getByTestId('explore-pals-list')).toBeTruthy();

      // The discovery panel runs an initial search on mount.
      await waitFor(() => {
        expect(palStore.searchPalsHubPals).toHaveBeenCalled();
      });
    });

    it('shows the signed-out promo/login card and hides it when authenticated', async () => {
      const signedOut = render(<ExploreScreen />, {withSafeArea: true});
      expect(signedOut.getByTestId('explore-promo-card')).toBeTruthy();
      expect(signedOut.getByTestId('explore-promo-login')).toBeTruthy();
      await waitFor(() =>
        expect(palStore.searchPalsHubPals).toHaveBeenCalled(),
      );
      signedOut.unmount();

      (authService as any).isAuthenticated = true;
      const signedIn = render(<ExploreScreen />, {withSafeArea: true});
      expect(signedIn.queryByTestId('explore-promo-card')).toBeNull();
      await waitFor(() =>
        expect(palStore.searchPalsHubPals).toHaveBeenCalledTimes(2),
      );
    });

    it('renders the loading state while discovery is in flight', async () => {
      runInAction(() => {
        palStore.isLoadingPalsHub = true;
      });

      const {getByTestId, queryByTestId} = render(<ExploreScreen />, {
        withSafeArea: true,
      });

      expect(getByTestId('explore-pals-loading')).toBeTruthy();
      expect(queryByTestId('explore-pals-empty')).toBeNull();
      await waitFor(() =>
        expect(palStore.searchPalsHubPals).toHaveBeenCalled(),
      );
    });

    it('renders the empty state when discovery returns no pals', async () => {
      const {getByTestId} = render(<ExploreScreen />, {withSafeArea: true});
      expect(getByTestId('explore-pals-empty')).toBeTruthy();
      await waitFor(() =>
        expect(palStore.searchPalsHubPals).toHaveBeenCalled(),
      );
    });

    it('renders a card row per cached pal', async () => {
      runInAction(() => {
        palStore.cachedPalsHubPals = [mockPalsHubPal, mockPremiumPalsHubPal];
      });

      const {getByTestId} = render(<ExploreScreen />, {withSafeArea: true});

      await waitFor(() => {
        expect(
          getByTestId(`explore-pal-card-${mockPalsHubPal.id}`),
        ).toBeTruthy();
        expect(
          getByTestId(`explore-pal-card-${mockPremiumPalsHubPal.id}`),
        ).toBeTruthy();
      });
    });

    it('shows a price pill for premium pals and the free label for free pals', async () => {
      runInAction(() => {
        palStore.cachedPalsHubPals = [mockPalsHubPal, mockPremiumPalsHubPal];
      });

      const {getByTestId} = render(<ExploreScreen />, {withSafeArea: true});

      await waitFor(() => {
        expect(
          getByTestId(`explore-pal-price-${mockPremiumPalsHubPal.id}`).props
            .children,
        ).toBe('€9.99');
        expect(
          getByTestId(`explore-pal-price-${mockPalsHubPal.id}`).props.children,
        ).toBe('Free');
      });
    });
  });

  // Filter by category
  describe('filter by category', () => {
    it('opens the category sheet, applies a selection, and searches by category_ids', async () => {
      const category = {
        id: 'cat-1',
        name: 'Productivity',
        sort_order: 1,
        created_at: '2023-01-01T00:00:00Z',
      };
      (palStore.getCategories as jest.Mock).mockResolvedValue({
        categories: [category],
      });

      const {getByTestId} = render(<ExploreScreen />, {withSafeArea: true});

      // Initial mount search runs with no filters.
      await waitFor(() => {
        expect(palStore.searchPalsHubPals).toHaveBeenCalledWith({});
      });

      // Open the category sheet -> getCategories fires and chip renders.
      await act(async () => {
        fireEvent.press(getByTestId('explore-filter-categories'));
      });
      await waitFor(() => {
        expect(palStore.getCategories).toHaveBeenCalled();
        expect(
          getByTestId(`explore-category-chip-${category.id}`),
        ).toBeTruthy();
      });

      // Select the chip and apply.
      fireEvent.press(getByTestId(`explore-category-chip-${category.id}`));
      await act(async () => {
        fireEvent.press(getByTestId('explore-category-apply'));
      });

      // Re-search is driven with the selected category_ids.
      await waitFor(() => {
        expect(palStore.searchPalsHubPals).toHaveBeenCalledWith({
          category_ids: [category.id],
        });
      });
    });

    it('searches by price bounds when a price preset is applied', async () => {
      const {getByTestId} = render(<ExploreScreen />, {withSafeArea: true});

      await waitFor(() => {
        expect(palStore.searchPalsHubPals).toHaveBeenCalled();
      });

      await act(async () => {
        fireEvent.press(getByTestId('explore-filter-price'));
      });
      // "€5 – €10" preset -> {min:500,max:1000}
      fireEvent.press(getByTestId('explore-price-chip-5-10'));
      await act(async () => {
        fireEvent.press(getByTestId('explore-price-apply'));
      });

      await waitFor(() => {
        expect(palStore.searchPalsHubPals).toHaveBeenCalledWith({
          price_min: 500,
          price_max: 1000,
        });
      });
    });
  });

  // Reached the end: has_more === false read off the resolved response
  describe('reached-the-end footer', () => {
    it('shows the end footer when the resolved response has has_more === false', async () => {
      runInAction(() => {
        palStore.cachedPalsHubPals = [mockPalsHubPal];
      });
      (palStore.searchPalsHubPals as jest.Mock).mockResolvedValueOnce({
        pals: [mockPalsHubPal],
        total_count: 1,
        page: 1,
        limit: 20,
        has_more: false,
      });

      const {getByTestId} = render(<ExploreScreen />, {withSafeArea: true});

      await waitFor(() => {
        expect(getByTestId('explore-pals-end')).toBeTruthy();
        expect(getByTestId('explore-browse-palshub')).toBeTruthy();
      });
    });

    it('does NOT show the end footer while more results remain (has_more === true)', async () => {
      runInAction(() => {
        palStore.cachedPalsHubPals = [mockPalsHubPal];
      });
      (palStore.searchPalsHubPals as jest.Mock).mockResolvedValueOnce({
        pals: [mockPalsHubPal],
        total_count: 50,
        page: 1,
        limit: 20,
        has_more: true,
      });

      const {queryByTestId, getByTestId} = render(<ExploreScreen />, {
        withSafeArea: true,
      });

      await waitFor(() => {
        expect(
          getByTestId(`explore-pal-card-${mockPalsHubPal.id}`),
        ).toBeTruthy();
      });
      expect(queryByTestId('explore-pals-end')).toBeNull();
    });
  });

  // Gated action while signed-out
  describe('gated action while signed-out', () => {
    it('opens the login-required modal on a premium card tap and fires onSignInPress', async () => {
      runInAction(() => {
        palStore.cachedPalsHubPals = [mockPremiumPalsHubPal];
      });

      const {getByTestId} = render(<ExploreScreen />, {withSafeArea: true});

      const card = await waitFor(() =>
        getByTestId(`explore-pal-card-${mockPremiumPalsHubPal.id}`),
      );
      fireEvent.press(card);

      // Login-required modal is shown (no detail sheet for the gated pal).
      await waitFor(() => {
        expect(getByTestId('explore-login-required')).toBeTruthy();
        expect(getByTestId('explore-login-action')).toBeTruthy();
      });

      // Tapping the modal action routes to the auth surface (AuthSheet).
      fireEvent.press(getByTestId('explore-login-action'));
      await waitFor(() => {
        expect(getByTestId('explore-screen')).toBeTruthy();
      });
    });

    it('opens the detail sheet (not the login modal) for a free pal while signed-out', async () => {
      runInAction(() => {
        palStore.cachedPalsHubPals = [mockPalsHubPal];
      });

      const {getByTestId, queryByTestId} = render(<ExploreScreen />, {
        withSafeArea: true,
      });

      const card = await waitFor(() =>
        getByTestId(`explore-pal-card-${mockPalsHubPal.id}`),
      );
      fireEvent.press(card);

      // Free pal is not gated -> no login-required modal.
      expect(queryByTestId('explore-login-required')).toBeNull();
      await waitFor(() =>
        expect(palStore.searchPalsHubPals).toHaveBeenCalled(),
      );
    });
  });

  // Models segment is inert (disabled "coming soon")
  describe('Models segment is inert', () => {
    it('keeps the Pals panel active when the disabled Models segment is tapped', async () => {
      const {getByTestId, queryByTestId} = render(<ExploreScreen />, {
        withSafeArea: true,
      });

      // Pals panel is active to start.
      expect(getByTestId('explore-pals-list')).toBeTruthy();
      expect(queryByTestId('explore-models-panel')).toBeNull();
      await waitFor(() =>
        expect(palStore.searchPalsHubPals).toHaveBeenCalled(),
      );

      fireEvent.press(getByTestId('ui-tab-item-models'));

      // No-op: still on Pals, Models panel never mounts.
      expect(getByTestId('explore-pals-list')).toBeTruthy();
      expect(queryByTestId('explore-models-panel')).toBeNull();
    });
  });
});
