import React from 'react';
import {runInAction} from 'mobx';

import {
  render,
  fireEvent,
  waitFor,
  act,
  within,
} from '../../../../jest/test-utils';
import {palStore} from '../../../store';
import {authService, palsHubService} from '../../../services';
import {
  mockPalsHubPal,
  mockPremiumPalsHubPal,
  createPalsHubPal,
} from '../../../../jest/fixtures/pals';
import en from '../../../locales/en.json';

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

    it('is single-select: choosing a second category replaces the first', async () => {
      const first = {
        id: 'cat-1',
        name: 'Productivity',
        sort_order: 1,
        created_at: '2023-01-01T00:00:00Z',
      };
      const second = {
        id: 'cat-2',
        name: 'Coding',
        sort_order: 2,
        created_at: '2023-01-01T00:00:00Z',
      };
      (palStore.getCategories as jest.Mock).mockResolvedValue({
        categories: [first, second],
      });

      const {getByTestId} = render(<ExploreScreen />, {withSafeArea: true});
      await waitFor(() =>
        expect(palStore.searchPalsHubPals).toHaveBeenCalled(),
      );

      await act(async () => {
        fireEvent.press(getByTestId('explore-filter-categories'));
      });
      await waitFor(() =>
        expect(getByTestId(`explore-category-chip-${first.id}`)).toBeTruthy(),
      );

      fireEvent.press(getByTestId(`explore-category-chip-${first.id}`));
      fireEvent.press(getByTestId(`explore-category-chip-${second.id}`));
      await act(async () => {
        fireEvent.press(getByTestId('explore-category-apply'));
      });

      await waitFor(() => {
        expect(palStore.searchPalsHubPals).toHaveBeenCalledWith(
          expect.objectContaining({category_ids: [second.id]}),
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

    it('is single-select: choosing a second tag replaces the first', async () => {
      const first = {
        id: 'tag-1',
        name: 'assistant',
        usage_count: 5,
        created_at: '2023-01-01T00:00:00Z',
      };
      const second = {
        id: 'tag-2',
        name: 'coding',
        usage_count: 3,
        created_at: '2023-01-01T00:00:00Z',
      };
      (palStore.getTags as jest.Mock).mockResolvedValue({
        tags: [first, second],
      });

      const {getByTestId} = render(<ExploreScreen />, {withSafeArea: true});
      await waitFor(() =>
        expect(palStore.searchPalsHubPals).toHaveBeenCalled(),
      );

      await act(async () => {
        fireEvent.press(getByTestId('explore-filter-tags'));
      });
      await waitFor(() =>
        expect(getByTestId(`explore-tag-chip-${first.id}`)).toBeTruthy(),
      );

      fireEvent.press(getByTestId(`explore-tag-chip-${first.id}`));
      fireEvent.press(getByTestId(`explore-tag-chip-${second.id}`));
      await act(async () => {
        fireEvent.press(getByTestId('explore-tags-apply'));
      });

      await waitFor(() => {
        expect(palStore.searchPalsHubPals).toHaveBeenCalledWith(
          expect.objectContaining({tag_names: [second.name]}),
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
        fireEvent.press(getByTestId('explore-sort-chip-popular'));
      });

      await waitFor(() => {
        expect(palStore.searchPalsHubPals).toHaveBeenCalledWith(
          expect.objectContaining({sort_by: 'popular'}),
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

  // Search overlay: a Portal sibling gated on the search toggle. Its body is
  // selected by the SIGNALS (debouncedQuery / isLoading / items.length), not by
  // the toggle alone — the riskiest piece is that the prompt body is chosen by
  // `debouncedQuery === ''` even while `items` is still populated from the
  // dimmed discovery grid behind the scrim.
  describe('search overlay', () => {
    const openOverlay = (getByTestId: any) => {
      fireEvent.press(getByTestId('explore-search-toggle'));
    };

    it('mounts the overlay (with its focused input) when the toggle is pressed', async () => {
      const {getByTestId, queryByTestId} = render(<ExploreScreen />, {
        withSafeArea: true,
      });
      await waitFor(() =>
        expect(palStore.searchPalsHubPals).toHaveBeenCalled(),
      );

      expect(queryByTestId('explore-search-overlay')).toBeNull();
      openOverlay(getByTestId);

      // I1: the frozen `explore-search-input` testID resolves on the overlay.
      expect(getByTestId('explore-search-overlay')).toBeTruthy();
      expect(getByTestId('explore-search-input')).toBeTruthy();
    });

    it('shows the prompt body for an empty query EVEN WHILE the grid items are populated', async () => {
      // The grid resolves with pals, so `items` is non-empty. Opening the
      // overlay with an empty query must still select the prompt body — the
      // selection is by `debouncedQuery === ''`, NOT by `items.length`.
      (palStore.searchPalsHubPals as jest.Mock).mockResolvedValue(
        pageResponse([mockPalsHubPal, mockPremiumPalsHubPal], false),
      );

      const {getByTestId, queryByTestId} = render(<ExploreScreen />, {
        withSafeArea: true,
      });

      // Grid populated behind the (not-yet-open) overlay.
      await waitFor(() =>
        expect(
          getByTestId(`explore-pal-card-${mockPalsHubPal.id}`),
        ).toBeTruthy(),
      );

      openOverlay(getByTestId);

      // Prompt body selected despite populated items; NOT the results header.
      expect(getByTestId('explore-search-prompt')).toBeTruthy();
      expect(queryByTestId('explore-search-results-header')).toBeNull();
      expect(
        queryByTestId(`explore-search-result-row-${mockPalsHubPal.id}`),
      ).toBeNull();
    });

    it('renders the results header and one reskinned row per pal, with the description subtitle', async () => {
      jest.useFakeTimers();
      try {
        // Mount discovery resolves empty; the typed query resolves with pals.
        (palStore.searchPalsHubPals as jest.Mock)
          .mockResolvedValueOnce(pageResponse([], false))
          .mockResolvedValue(
            pageResponse([mockPalsHubPal, mockPremiumPalsHubPal], false),
          );

        const view = render(<ExploreScreen />, {withSafeArea: true});
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });

        openOverlay(view.getByTestId);
        act(() =>
          fireEvent.changeText(view.getByTestId('explore-search-input'), 'pal'),
        );
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });

        expect(view.getByTestId('explore-search-results-header')).toBeTruthy();
        const row = view.getByTestId(
          `explore-search-result-row-${mockPalsHubPal.id}`,
        );
        expect(row).toBeTruthy();
        expect(
          view.getByTestId(
            `explore-search-result-row-${mockPremiumPalsHubPal.id}`,
          ),
        ).toBeTruthy();
        // Subtitle binds pal.description (not a static literal). Scope to the
        // row — the same description also renders in the dimmed grid card.
        expect(within(row).getByText(mockPalsHubPal.description!)).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    it('closes the overlay BEFORE opening the detail sheet on a free result tap', async () => {
      jest.useFakeTimers();
      try {
        (palStore.searchPalsHubPals as jest.Mock)
          .mockResolvedValueOnce(pageResponse([], false))
          .mockResolvedValue(pageResponse([mockPalsHubPal], false));

        const view = render(<ExploreScreen />, {withSafeArea: true});
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });

        openOverlay(view.getByTestId);
        act(() =>
          fireEvent.changeText(view.getByTestId('explore-search-input'), 'pal'),
        );
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });
        // Overlay + scrim are present right up until the row is tapped.
        expect(view.getByTestId('explore-search-overlay')).toBeTruthy();
        expect(view.getByTestId('explore-search-scrim')).toBeTruthy();

        await act(async () => {
          fireEvent.press(
            view.getByTestId(`explore-search-result-row-${mockPalsHubPal.id}`),
          );
        });

        // Paint-order-independent guard: assert the overlay (and its scrim) is
        // GONE — not merely that the sheet is present. A revert to
        // onResultPress={handleCardPress} would leave searchExpanded true, the
        // overlay/scrim mounted above the bottom-sheet host, and this fails.
        await waitFor(() => {
          expect(view.queryByTestId('explore-search-overlay')).toBeNull();
        });
        expect(view.queryByTestId('explore-search-scrim')).toBeNull();
        expect(view.queryByTestId('explore-search-input')).toBeNull();

        // Free pal: with the overlay closed, the detail sheet opens; no gate.
        await waitFor(() => {
          expect(view.getByTestId('pal-label-free')).toBeTruthy();
        });
        expect(view.queryByTestId('explore-login-required')).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it('closes the overlay AND hits the login-required gate on a premium result tap while signed-out', async () => {
      jest.useFakeTimers();
      try {
        (authService as any).isAuthenticated = false;
        (palStore.searchPalsHubPals as jest.Mock)
          .mockResolvedValueOnce(pageResponse([], false))
          .mockResolvedValue(pageResponse([mockPremiumPalsHubPal], false));

        const view = render(<ExploreScreen />, {withSafeArea: true});
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });

        openOverlay(view.getByTestId);
        act(() =>
          fireEvent.changeText(
            view.getByTestId('explore-search-input'),
            'premium',
          ),
        );
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });
        expect(view.getByTestId('explore-search-overlay')).toBeTruthy();

        await act(async () => {
          fireEvent.press(
            view.getByTestId(
              `explore-search-result-row-${mockPremiumPalsHubPal.id}`,
            ),
          );
        });

        // The handler closes the overlay on ANY result tap (closeSearch runs
        // before handleCardPress), then the gate fires. Assert overlay-absence
        // so the login modal isn't dimmed/swallowed by a left-open scrim.
        await waitFor(() => {
          expect(view.queryByTestId('explore-search-overlay')).toBeNull();
        });
        expect(view.queryByTestId('explore-search-scrim')).toBeNull();

        // Same gate as the discovery card: login-required modal, sheet closed.
        await waitFor(() => {
          expect(view.getByTestId('explore-login-required')).toBeTruthy();
        });
        expect(view.queryByTestId('pal-label-premium')).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it('shows the 0-results body with the query in the accent span when the search returns nothing', async () => {
      jest.useFakeTimers();
      try {
        // Mount AND the typed query both resolve empty.
        (palStore.searchPalsHubPals as jest.Mock).mockResolvedValue(
          pageResponse([], false),
        );

        const view = render(<ExploreScreen />, {withSafeArea: true});
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });

        openOverlay(view.getByTestId);
        act(() =>
          fireEvent.changeText(
            view.getByTestId('explore-search-input'),
            'zzzqqq',
          ),
        );
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });

        const noResults = view.getByTestId('explore-search-no-results');
        expect(noResults).toBeTruthy();
        // The query string is rendered (its own accent span).
        expect(view.getByText('zzzqqq')).toBeTruthy();
        expect(view.getByTestId('explore-search-explore-cta')).toBeTruthy();
        // The softened helper copy renders. The store swallows fetch
        // failures into an empty response, so this same body covers both a
        // genuine 0-results AND a failed fetch; the copy stays neutral (offers
        // "check your connection") rather than asserting "no matches" exist.
        // There is no distinct error-body testID — the body is shared by design.
        expect(view.getByText(en.explore.searchNoResultsHelper)).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    it('the "Explore Pals" CTA closes the overlay AND clears the search input (real action)', async () => {
      jest.useFakeTimers();
      try {
        (palStore.searchPalsHubPals as jest.Mock).mockResolvedValue(
          pageResponse([], false),
        );

        const view = render(<ExploreScreen />, {withSafeArea: true});
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });

        openOverlay(view.getByTestId);
        act(() =>
          fireEvent.changeText(
            view.getByTestId('explore-search-input'),
            'nothinghere',
          ),
        );
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });

        await act(async () => {
          fireEvent.press(view.getByTestId('explore-search-explore-cta'));
        });

        // Overlay unmounts...
        await waitFor(() => {
          expect(view.queryByTestId('explore-search-overlay')).toBeNull();
        });
        // ...and the input is cleared: re-opening shows an empty input, and
        // once the debounce settles the prompt body is selected (no stale
        // query carried over).
        openOverlay(view.getByTestId);
        expect(view.getByTestId('explore-search-input').props.value).toBe('');
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });
        expect(view.getByTestId('explore-search-prompt')).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    it('gives the scrim, input, and clear-X distinct a11y labels that resolve the right control', async () => {
      jest.useFakeTimers();
      try {
        (palStore.searchPalsHubPals as jest.Mock).mockResolvedValue(
          pageResponse([], false),
        );
        const view = render(<ExploreScreen />, {withSafeArea: true});
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });

        openOverlay(view.getByTestId);
        // The clear-X only mounts once the input is non-empty.
        act(() =>
          fireEvent.changeText(view.getByTestId('explore-search-input'), 'pal'),
        );

        // The three overlay controls carry three DISTINCT labels — previously
        // all collided on explore.searchLabel. Select each by its unique
        // testID and assert the label it carries (a11y label is not globally
        // unique — an unrelated "Close" lives elsewhere on the tree — so
        // selecting by label would be ambiguous; testID is the right key).
        const scrimLabel = view.getByTestId('explore-search-scrim').props
          .accessibilityLabel;
        const clearLabel = view.getByTestId('explore-search-clear').props
          .accessibilityLabel;
        const inputLabel = view.getByTestId('explore-search-input').props
          .accessibilityLabel;

        expect(scrimLabel).toBe(en.common.close); // "Close"
        expect(clearLabel).toBe(en.common.clear); // "Clear All"
        expect(inputLabel).toBe(en.explore.searchLabel); // "Search pals"
        // All three are mutually distinct.
        expect(new Set([scrimLabel, clearLabel, inputLabel]).size).toBe(3);

        // Let the debounce settle so teardown is clean.
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('dismissing via the scrim (by testID) closes the overlay and clears the input', async () => {
      const {getByTestId, queryByTestId} = render(<ExploreScreen />, {
        withSafeArea: true,
      });
      await waitFor(() =>
        expect(palStore.searchPalsHubPals).toHaveBeenCalled(),
      );

      openOverlay(getByTestId);

      // The scrim is the backdrop Pressable (label common.close "Close",
      // distinct from the input's "Search pals" and the clear control's
      // "Clear All"); the test targets it by its dedicated testID.
      const scrim = getByTestId('explore-search-scrim');
      await act(async () => {
        fireEvent.press(scrim);
      });

      await waitFor(() => {
        expect(queryByTestId('explore-search-overlay')).toBeNull();
      });
      openOverlay(getByTestId);
      expect(getByTestId('explore-search-input').props.value).toBe('');
    });

    it('shows the loading spinner body while a non-empty query is in flight', async () => {
      jest.useFakeTimers();
      try {
        const inflight = deferred<any>();
        // The overlay's `isLoading` is the store-wide `palStore.isLoadingPalsHub`,
        // captured by the observer `ExplorePalsPanel` and passed DOWN as a plain
        // prop to the non-observer overlay. Driving the flag through the real
        // search path is NOT cheap with this harness: the centralized palStore
        // mock's searchPalsHubPals does not model the real store's loading-flag
        // lifecycle, and when the flag is flipped mid in-flight-promise under
        // fake timers the observer→prop re-render does not flush deterministically
        // (verified: getByTestId/waitFor both still see the stale prop). So we
        // flip the flag directly before opening the overlay — the value the
        // overlay reads is identical to the real path's — rather than fabricating
        // a flush. The store-wide loading coupling (an unrelated PalsHub fetch
        // flips this overlay's loading body) is a documented follow-up.
        (palStore.searchPalsHubPals as jest.Mock)
          .mockResolvedValueOnce(pageResponse([], false))
          .mockReturnValueOnce(inflight.promise);

        const view = render(<ExploreScreen />, {withSafeArea: true});
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });

        // Flip the store's loading flag for the overlay's isLoading prop.
        runInAction(() => {
          palStore.isLoadingPalsHub = true;
        });

        openOverlay(view.getByTestId);
        act(() =>
          fireEvent.changeText(view.getByTestId('explore-search-input'), 'sun'),
        );
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });

        expect(view.getByTestId('explore-search-loading')).toBeTruthy();
        expect(view.queryByTestId('explore-search-prompt')).toBeNull();
        expect(view.queryByTestId('explore-search-results-header')).toBeNull();

        // Let the pending request settle so teardown is clean.
        await act(async () => {
          inflight.resolve(pageResponse([], false));
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('the clear (X) button clears the query and returns to the prompt body', async () => {
      jest.useFakeTimers();
      try {
        (palStore.searchPalsHubPals as jest.Mock)
          .mockResolvedValueOnce(pageResponse([], false))
          .mockResolvedValue(pageResponse([mockPalsHubPal], false));

        const view = render(<ExploreScreen />, {withSafeArea: true});
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });

        openOverlay(view.getByTestId);
        act(() =>
          fireEvent.changeText(view.getByTestId('explore-search-input'), 'pal'),
        );
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });
        expect(view.getByTestId('explore-search-results-header')).toBeTruthy();

        // The clear affordance is present once the input is non-empty.
        act(() => fireEvent.press(view.getByTestId('explore-search-clear')));
        expect(view.getByTestId('explore-search-input').props.value).toBe('');
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });
        expect(view.getByTestId('explore-search-prompt')).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    it('renders the avatar fallback icon and drops the subtitle for a pal with no thumbnail/description', async () => {
      jest.useFakeTimers();
      try {
        const bare = createPalsHubPal({
          id: 'bare-1',
          title: 'Bare Pal',
          thumbnail_url: undefined,
          description: '',
        });
        (palStore.searchPalsHubPals as jest.Mock)
          .mockResolvedValueOnce(pageResponse([], false))
          .mockResolvedValue(pageResponse([bare], false));

        const view = render(<ExploreScreen />, {withSafeArea: true});
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });

        openOverlay(view.getByTestId);
        act(() =>
          fireEvent.changeText(
            view.getByTestId('explore-search-input'),
            'bare',
          ),
        );
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });

        const row = view.getByTestId(`explore-search-result-row-${bare.id}`);
        // Name renders; empty description means no subtitle text is mounted.
        expect(within(row).getByText('Bare Pal')).toBeTruthy();
        expect(within(row).queryByText(mockPalsHubPal.description!)).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it('preserves the last-query-wins stale guard with the overlay mounted (out-of-order deferred resolves)', async () => {
      // A SYNC mock proves nothing here: this asserts the seqRef guard still
      // discards an earlier broad response that resolves AFTER a later narrow
      // one, with the overlay (not just the grid) reading `items`.
      const broadPal = createPalsHubPal({
        id: 'overlay-broad-1',
        title: 'Overlay Broad',
      });
      const narrowPal = createPalsHubPal({
        id: 'overlay-narrow-1',
        title: 'Overlay Narrow',
      });

      const broad = deferred<any>();
      const narrow = deferred<any>();

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

        openOverlay(view.getByTestId);
        const input = view.getByTestId('explore-search-input');

        act(() => fireEvent.changeText(input, 'a'));
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });

        act(() => fireEvent.changeText(input, 'assistant'));
        await act(async () => {
          jest.advanceTimersByTime(SEARCH_DEBOUNCE_FLUSH);
        });
      } finally {
        jest.useRealTimers();
      }

      // Later (narrow) request resolves FIRST...
      await act(async () => {
        narrow.resolve(pageResponse([narrowPal], false));
      });
      // ...earlier (broad) request resolves LATER and must be discarded.
      await act(async () => {
        broad.resolve(pageResponse([broadPal], false));
      });

      await waitFor(() => {
        expect(
          view.getByTestId(`explore-search-result-row-${narrowPal.id}`),
        ).toBeTruthy();
      });
      // The stale broad result must NOT overwrite the narrow one in the overlay.
      expect(
        view.queryByTestId(`explore-search-result-row-${broadPal.id}`),
      ).toBeNull();
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
