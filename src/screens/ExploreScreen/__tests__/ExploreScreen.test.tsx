import React from 'react';
import {Linking} from 'react-native';
import {runInAction} from 'mobx';

import {render, fireEvent, waitFor, act} from '../../../../jest/test-utils';
import {palStore} from '../../../store';
import {authService, palsHubService} from '../../../services';
import {
  mockPalsHubPal,
  mockPremiumPalsHubPal,
  createPalsHubPal,
} from '../../../../jest/fixtures/pals';

import {ExploreScreen} from '../ExploreScreen';

// Matches the panel's debounce window; advancing past it flushes one search.
const SEARCH_DEBOUNCE_FLUSH = 350;

// A controllable promise: lets a test resolve a pending mock call on demand,
// so out-of-order resolution and per-page appends can be exercised.
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return {promise, resolve};
};

const pageResponse = (
  pals: any[],
  has_more: boolean,
  page = 1,
  total_count = pals.length,
) => ({pals, total_count, page, limit: 20, has_more});

const resetPalStore = () => {
  runInAction(() => {
    palStore.cachedPalsHubPals = [];
    palStore.isLoadingPalsHub = false;
  });
  (palStore.searchPalsHubPals as jest.Mock).mockReset();
  (palStore.searchPalsHubPals as jest.Mock).mockResolvedValue(
    pageResponse([], false),
  );
  (palStore.getCategories as jest.Mock).mockReset();
  (palStore.getCategories as jest.Mock).mockResolvedValue({categories: []});
  (palStore.getTags as jest.Mock).mockReset();
  (palStore.getTags as jest.Mock).mockResolvedValue({tags: []});
  (palsHubService.getPal as jest.Mock).mockReset();
  (palsHubService.getPal as jest.Mock).mockResolvedValue(null);
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
      expect(getByTestId('explore-pals-list')).toBeTruthy();

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
        expect(palStore.searchPalsHubPals).toHaveBeenCalled(),
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

    it('renders a card row per pal returned by the discovery search', async () => {
      (palStore.searchPalsHubPals as jest.Mock).mockResolvedValue(
        pageResponse([mockPalsHubPal, mockPremiumPalsHubPal], false),
      );

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

    it('shows a localized price pill for premium pals and the free label for free pals', async () => {
      (palStore.searchPalsHubPals as jest.Mock).mockResolvedValue(
        pageResponse([mockPalsHubPal, mockPremiumPalsHubPal], false),
      );

      const {getByTestId} = render(<ExploreScreen />, {withSafeArea: true});

      await waitFor(() => {
        // Premium pal: EUR currency formatting via Intl (locale 'en').
        expect(
          getByTestId(`explore-pal-price-${mockPremiumPalsHubPal.id}`).props
            .children,
        ).toBe('€9.99');
        // Free pal: localized "Free" label, not a hardcoded string.
        expect(
          getByTestId(`explore-pal-price-${mockPalsHubPal.id}`).props.children,
        ).toBe('Free');
      });
    });
  });

  // Debounce + last-query-wins stale-response guard.
  describe('search debounce and stale-response guard', () => {
    it('coalesces rapid keystrokes into a single search after the debounce', async () => {
      jest.useFakeTimers();
      try {
        const {getByTestId} = render(<ExploreScreen />, {withSafeArea: true});

        // Initial mount search (page 1, no query).
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });
        const callsAfterMount = (palStore.searchPalsHubPals as jest.Mock).mock
          .calls.length;

        // Reveal the input and type a sequence quickly.
        fireEvent.press(getByTestId('explore-search-toggle'));
        const input = getByTestId('explore-search-input');
        act(() => {
          fireEvent.changeText(input, 'c');
          fireEvent.changeText(input, 'ca');
          fireEvent.changeText(input, 'cat');
        });

        // Before the debounce elapses, no new request fired.
        expect(
          (palStore.searchPalsHubPals as jest.Mock).mock.calls.length,
        ).toBe(callsAfterMount);

        // After the debounce window, exactly one coalesced request fires.
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });
        const newCalls = (palStore.searchPalsHubPals as jest.Mock).mock.calls
          .slice(callsAfterMount)
          .map(args => args[0]?.query);
        expect(newCalls.filter(Boolean)).toEqual(['cat']);
      } finally {
        jest.useRealTimers();
      }
    });

    it('ignores an earlier broad response that resolves after a later narrow query', async () => {
      const broadPal = createPalsHubPal({id: 'broad-1', title: 'Broad Result'});
      const narrowPal = createPalsHubPal({
        id: 'narrow-1',
        title: 'Narrow Result',
      });

      const broad = deferred<any>();
      const narrow = deferred<any>();

      // Mount call resolves immediately (empty); then the broad query, then
      // the narrow query each get their own controllable promise.
      (palStore.searchPalsHubPals as jest.Mock)
        .mockResolvedValueOnce(pageResponse([], false))
        .mockReturnValueOnce(broad.promise)
        .mockReturnValueOnce(narrow.promise);

      jest.useFakeTimers();
      let view: ReturnType<typeof render>;
      try {
        view = render(<ExploreScreen />, {withSafeArea: true});
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });

        const input = (() => {
          fireEvent.press(view.getByTestId('explore-search-toggle'));
          return view.getByTestId('explore-search-input');
        })();

        // Type the broad query, let it debounce -> issues the broad request.
        act(() => fireEvent.changeText(input, 'a'));
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });

        // Type the narrow query, let it debounce -> issues the narrow request.
        act(() => fireEvent.changeText(input, 'assistant'));
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });
      } finally {
        jest.useRealTimers();
      }

      // The narrow (later) request resolves FIRST.
      await act(async () => {
        narrow.resolve(pageResponse([narrowPal], false));
      });
      // The broad (earlier) request resolves LATER and must be ignored.
      await act(async () => {
        broad.resolve(pageResponse([broadPal], false));
      });

      await waitFor(() => {
        expect(
          view.getByTestId(`explore-pal-card-${narrowPal.id}`),
        ).toBeTruthy();
      });
      // The stale broad result must NOT have overwritten the narrow one.
      expect(view.queryByTestId(`explore-pal-card-${broadPal.id}`)).toBeNull();
    });
  });

  // Pagination: onEndReached appends the next page.
  describe('pagination', () => {
    it('appends the next page on end-reached and advances the query page', async () => {
      const page1 = [
        createPalsHubPal({id: 'p1', title: 'Page1 A'}),
        createPalsHubPal({id: 'p2', title: 'Page1 B'}),
      ];
      const page2 = [createPalsHubPal({id: 'p3', title: 'Page2 A'})];

      (palStore.searchPalsHubPals as jest.Mock)
        .mockResolvedValueOnce(pageResponse(page1, true, 1))
        .mockResolvedValueOnce(pageResponse(page2, false, 2));

      const {getByTestId, queryByTestId} = render(<ExploreScreen />, {
        withSafeArea: true,
      });

      await waitFor(() => {
        expect(getByTestId('explore-pal-card-p1')).toBeTruthy();
        expect(getByTestId('explore-pal-card-p2')).toBeTruthy();
      });
      // More pages remain -> end footer hidden.
      expect(queryByTestId('explore-pals-end')).toBeNull();

      // Trigger end-reached.
      await act(async () => {
        fireEvent(getByTestId('explore-pals-list'), 'endReached');
      });

      // Page 2 fetched with page advanced, and its items appended.
      await waitFor(() => {
        expect(getByTestId('explore-pal-card-p3')).toBeTruthy();
      });
      expect(getByTestId('explore-pal-card-p1')).toBeTruthy();
      const lastCall = (palStore.searchPalsHubPals as jest.Mock).mock.calls.at(
        -1,
      )?.[0];
      expect(lastCall.page).toBe(2);

      // Now that has_more is false, the end footer appears.
      await waitFor(() => {
        expect(getByTestId('explore-pals-end')).toBeTruthy();
      });
    });

    it('does not fetch beyond the last page once has_more is false', async () => {
      (palStore.searchPalsHubPals as jest.Mock).mockResolvedValue(
        pageResponse([createPalsHubPal({id: 'only-1'})], false),
      );

      const {getByTestId} = render(<ExploreScreen />, {withSafeArea: true});
      await waitFor(() => {
        expect(getByTestId('explore-pal-card-only-1')).toBeTruthy();
      });
      const callsBefore = (palStore.searchPalsHubPals as jest.Mock).mock.calls
        .length;

      await act(async () => {
        fireEvent(getByTestId('explore-pals-list'), 'endReached');
      });

      expect((palStore.searchPalsHubPals as jest.Mock).mock.calls.length).toBe(
        callsBefore,
      );
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

      await waitFor(() => {
        expect(palStore.searchPalsHubPals).toHaveBeenCalled();
      });

      await act(async () => {
        fireEvent.press(getByTestId('explore-filter-categories'));
      });
      await waitFor(() => {
        expect(palStore.getCategories).toHaveBeenCalled();
        expect(
          getByTestId(`explore-category-chip-${category.id}`),
        ).toBeTruthy();
      });

      fireEvent.press(getByTestId(`explore-category-chip-${category.id}`));
      await act(async () => {
        fireEvent.press(getByTestId('explore-category-apply'));
      });

      await waitFor(() => {
        expect(palStore.searchPalsHubPals).toHaveBeenCalledWith(
          expect.objectContaining({category_ids: [category.id]}),
        );
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
      fireEvent.press(getByTestId('explore-price-chip-5-10'));
      await act(async () => {
        fireEvent.press(getByTestId('explore-price-apply'));
      });

      await waitFor(() => {
        expect(palStore.searchPalsHubPals).toHaveBeenCalledWith(
          expect.objectContaining({price_min: 500, price_max: 1000}),
        );
      });
    });

    it('renders localized price preset labels (no hardcoded currency strings)', async () => {
      const {getByTestId} = render(<ExploreScreen />, {withSafeArea: true});
      await waitFor(() =>
        expect(palStore.searchPalsHubPals).toHaveBeenCalled(),
      );

      await act(async () => {
        fireEvent.press(getByTestId('explore-filter-price'));
      });

      // "Free" routes through l10n.explore.free; ranges through Intl currency.
      expect(getByTestId('explore-price-chip-free')).toHaveTextContent('Free');
      expect(getByTestId('explore-price-chip-under-5')).toHaveTextContent(
        '< €5.00',
      );
      expect(getByTestId('explore-price-chip-5-10')).toHaveTextContent(
        '€5.00 – €10.00',
      );
      expect(getByTestId('explore-price-chip-over-10')).toHaveTextContent(
        '€10.00+',
      );
    });
  });

  // Tags filter is wired into the query.
  describe('filter by tags', () => {
    it('opens the tags sheet, applies a tag, and searches by tag_names', async () => {
      const tag = {
        id: 'tag-1',
        name: 'assistant',
        usage_count: 5,
        created_at: '2023-01-01T00:00:00Z',
      };
      (palStore.getTags as jest.Mock).mockResolvedValue({tags: [tag]});

      const {getByTestId} = render(<ExploreScreen />, {withSafeArea: true});
      await waitFor(() =>
        expect(palStore.searchPalsHubPals).toHaveBeenCalled(),
      );

      await act(async () => {
        fireEvent.press(getByTestId('explore-filter-tags'));
      });
      await waitFor(() => {
        expect(palStore.getTags).toHaveBeenCalled();
        expect(getByTestId(`explore-tag-chip-${tag.id}`)).toBeTruthy();
      });

      fireEvent.press(getByTestId(`explore-tag-chip-${tag.id}`));
      await act(async () => {
        fireEvent.press(getByTestId('explore-tags-apply'));
      });

      await waitFor(() => {
        expect(palStore.searchPalsHubPals).toHaveBeenCalledWith(
          expect.objectContaining({tag_names: [tag.name]}),
        );
      });
    });
  });

  // Sort control is wired into the query.
  describe('sort', () => {
    it('opens the sort sheet and searches with the chosen sort_by', async () => {
      const {getByTestId} = render(<ExploreScreen />, {withSafeArea: true});
      await waitFor(() =>
        expect(palStore.searchPalsHubPals).toHaveBeenCalled(),
      );

      // Default sort is applied on mount.
      expect(
        (palStore.searchPalsHubPals as jest.Mock).mock.calls[0][0].sort_by,
      ).toBe('newest');

      await act(async () => {
        fireEvent.press(getByTestId('explore-sort-control'));
      });
      await act(async () => {
        fireEvent.press(getByTestId('explore-sort-chip-rating'));
      });

      await waitFor(() => {
        expect(palStore.searchPalsHubPals).toHaveBeenCalledWith(
          expect.objectContaining({sort_by: 'rating'}),
        );
      });
    });
  });

  // Reached the end footer reflects the resolved has_more
  describe('reached-the-end footer', () => {
    it('shows the end footer when the resolved response has has_more === false', async () => {
      (palStore.searchPalsHubPals as jest.Mock).mockResolvedValue(
        pageResponse([mockPalsHubPal], false),
      );

      const {getByTestId} = render(<ExploreScreen />, {withSafeArea: true});

      await waitFor(() => {
        expect(getByTestId('explore-pals-end')).toBeTruthy();
        expect(getByTestId('explore-browse-palshub')).toBeTruthy();
      });
    });

    it('does NOT show the end footer while more results remain (has_more === true)', async () => {
      (palStore.searchPalsHubPals as jest.Mock).mockResolvedValue(
        pageResponse([mockPalsHubPal], true, 1, 50),
      );

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

    it('opens the user-facing web listing from the browse CTA', async () => {
      const openURL = jest
        .spyOn(Linking, 'openURL')
        .mockResolvedValue(undefined as any);
      (palStore.searchPalsHubPals as jest.Mock).mockResolvedValue(
        pageResponse([mockPalsHubPal], false),
      );

      const {getByTestId} = render(<ExploreScreen />, {withSafeArea: true});
      const cta = await waitFor(() => getByTestId('explore-browse-palshub'));
      fireEvent.press(cta);

      // Browse URL must NOT be the empty-id per-pal route.
      const url = openURL.mock.calls[0][0];
      expect(url).not.toMatch(/\/pals\/$/);
      expect(url).toMatch(/\/pals$/);
      openURL.mockRestore();
    });
  });

  // Two distinct auth gates: the card-tap gates sheet ACCESS for a premium,
  // unowned pal while signed-out (the login-required modal); the detail sheet
  // separately gates the BUY action at purchase time.
  describe('sheet-access gate while signed-out', () => {
    it('shows the login-required modal for a premium pal and keeps the detail sheet closed', async () => {
      (palStore.searchPalsHubPals as jest.Mock).mockResolvedValue(
        pageResponse([mockPremiumPalsHubPal], false),
      );

      const {getByTestId, queryByTestId} = render(<ExploreScreen />, {
        withSafeArea: true,
      });

      const card = await waitFor(() =>
        getByTestId(`explore-pal-card-${mockPremiumPalsHubPal.id}`),
      );
      await act(async () => {
        fireEvent.press(card);
      });

      // The login-required modal opens; the detail sheet does NOT.
      await waitFor(() => {
        expect(getByTestId('explore-login-required')).toBeTruthy();
        expect(getByTestId('explore-login-action')).toBeTruthy();
      });
      expect(queryByTestId('pal-label-premium')).toBeNull();
    });

    it('routes the login-required action to the sign-in surface', async () => {
      (palStore.searchPalsHubPals as jest.Mock).mockResolvedValue(
        pageResponse([mockPremiumPalsHubPal], false),
      );

      const {getByTestId, queryByTestId} = render(<ExploreScreen />, {
        withSafeArea: true,
      });

      const card = await waitFor(() =>
        getByTestId(`explore-pal-card-${mockPremiumPalsHubPal.id}`),
      );
      await act(async () => {
        fireEvent.press(card);
      });

      const action = await waitFor(() => getByTestId('explore-login-action'));
      await act(async () => {
        fireEvent.press(action);
      });

      // The action dismisses the modal and fires onSignInPress; the screen
      // stays mounted and the modal is gone.
      await waitFor(() => {
        expect(queryByTestId('explore-login-required')).toBeNull();
      });
      expect(getByTestId('explore-screen')).toBeTruthy();
    });

    it('opens the detail sheet for a free pal while signed-out', async () => {
      (palStore.searchPalsHubPals as jest.Mock).mockResolvedValue(
        pageResponse([mockPalsHubPal], false),
      );

      const {getByTestId, queryByTestId} = render(<ExploreScreen />, {
        withSafeArea: true,
      });

      const card = await waitFor(() =>
        getByTestId(`explore-pal-card-${mockPalsHubPal.id}`),
      );
      await act(async () => {
        fireEvent.press(card);
      });

      // The detail sheet opens (its label renders); no sheet-access modal.
      await waitFor(() => {
        expect(getByTestId('pal-label-free')).toBeTruthy();
      });
      expect(queryByTestId('explore-login-required')).toBeNull();
    });
  });

  // Models segment is inert (disabled "coming soon")
  describe('Models segment is inert', () => {
    it('keeps the Pals panel active when the disabled Models segment is tapped', async () => {
      const {getByTestId, queryByTestId} = render(<ExploreScreen />, {
        withSafeArea: true,
      });

      expect(getByTestId('explore-pals-list')).toBeTruthy();
      expect(queryByTestId('explore-models-panel')).toBeNull();
      await waitFor(() =>
        expect(palStore.searchPalsHubPals).toHaveBeenCalled(),
      );

      fireEvent.press(getByTestId('ui-tab-item-models'));

      expect(getByTestId('explore-pals-list')).toBeTruthy();
      expect(queryByTestId('explore-models-panel')).toBeNull();
    });
  });
});
