import React from 'react';
import {fireEvent, waitFor} from '@testing-library/react-native';

import {render} from '../../../../jest/test-utils';

import {PalsScreen} from '../PalsScreen';

import {palStore} from '../../../store';
import {createPal} from '../../../../jest/fixtures/pals';

describe('PalsScreen (My Pals)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    palStore.pals = [];
  });

  const renderScreen = () =>
    render(<PalsScreen />, {
      withNavigation: true,
      withSafeArea: true,
      withBottomSheetProvider: true,
    });

  it('renders the My Pals header with a create action', () => {
    const {getByTestId, getByText} = renderScreen();
    expect(getByTestId('pals-screen')).toBeTruthy();
    expect(getByTestId('back-button')).toBeTruthy();
    // Create entry keeps the live E2E testID on the new header action.
    expect(getByTestId('bottom-action-add')).toBeTruthy();
    expect(getByText('+ Create Pal')).toBeTruthy();
  });

  it('mounts a single bottom-action-add node (E2E create entry, no collision)', () => {
    const {getAllByTestId} = renderScreen();
    // The frozen E2E create id must resolve to exactly one mounted node so
    // the live create path stays unambiguous after the header re-home.
    expect(getAllByTestId('bottom-action-add')).toHaveLength(1);
  });

  describe('Tab routing', () => {
    beforeEach(() => {
      palStore.pals = [
        createPal({id: 'local-1', name: 'Created Pal', source: 'local'}),
        createPal({
          id: 'dl-1',
          name: 'Downloaded Pal',
          source: 'palshub',
        }),
      ];
    });

    it('shows "Created by me" pals on the default tab', async () => {
      const {getByText, queryByText} = renderScreen();
      await waitFor(() => {
        expect(getByText('Created Pal')).toBeTruthy();
        // Downloaded pal lives on the other tab.
        expect(queryByText('Downloaded Pal')).toBeNull();
      });
    });

    it('shows "Downloaded" pals after switching tabs', async () => {
      const {getByTestId, getByText, queryByText} = renderScreen();

      fireEvent.press(getByTestId('ui-tab-item-downloaded'));

      await waitFor(() => {
        expect(getByText('Downloaded Pal')).toBeTruthy();
        expect(queryByText('Created Pal')).toBeNull();
      });
    });
  });

  describe('Create chooser', () => {
    it('opens the create-type chooser with Assistant / Roleplay / Video', async () => {
      const {getByTestId, getByText} = renderScreen();

      fireEvent.press(getByTestId('bottom-action-add'));

      await waitFor(() => {
        expect(getByText('Assistant')).toBeTruthy();
        expect(getByText('Roleplay')).toBeTruthy();
        expect(getByText('Video')).toBeTruthy();
      });
    });
  });

  describe('Empty states', () => {
    it('shows the created-by-me empty copy when no local pals exist', async () => {
      palStore.pals = [];
      const {getByText} = renderScreen();
      await waitFor(() => {
        expect(getByText(/Create your first Pal/i)).toBeTruthy();
      });
    });

    it('shows the downloaded empty copy on the downloaded tab', async () => {
      palStore.pals = [];
      const {getByTestId, getByText} = renderScreen();

      fireEvent.press(getByTestId('ui-tab-item-downloaded'));

      await waitFor(() => {
        expect(getByText(/No downloaded Pals yet/i)).toBeTruthy();
      });
    });
  });

  describe('Pal interactions', () => {
    beforeEach(() => {
      palStore.pals = [
        createPal({id: 'local-1', name: 'Editable Pal', source: 'local'}),
      ];
    });

    it('renders the frozen local pal card testID', async () => {
      const {getByTestId} = renderScreen();
      await waitFor(() => {
        expect(getByTestId('local-pal-card-local-1')).toBeTruthy();
      });
    });

    it('exposes a screen-scoped overflow menu trigger per card', async () => {
      const {getByTestId} = renderScreen();
      await waitFor(() => {
        expect(getByTestId('mypals-card-overflow-local-1')).toBeTruthy();
      });
    });
  });

  describe('Discovery chrome removed', () => {
    it('no longer renders auth bar, search, filter chips, or bottom action bar', () => {
      palStore.pals = [
        createPal({id: 'local-1', name: 'Local Pal', source: 'local'}),
      ];
      const {queryByTestId} = renderScreen();

      expect(queryByTestId('compact-auth-bar')).toBeNull();
      expect(queryByTestId('expandable-search')).toBeNull();
      expect(queryByTestId('filter-chip-all')).toBeNull();
      expect(queryByTestId('bottom-action-search')).toBeNull();
      expect(queryByTestId('bottom-action-profile')).toBeNull();
    });
  });
});
