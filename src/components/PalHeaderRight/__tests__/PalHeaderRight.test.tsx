import React from 'react';
import {Alert, Keyboard} from 'react-native';
import {render, fireEvent, waitFor} from '@testing-library/react-native';

import {PalHeaderRight} from '../PalHeaderRight';
import {exportAllPals} from '../../../utils/exportUtils';
import {importPals} from '../../../utils/importUtils';
import {L10nContext} from '../../../utils';
import {l10n} from '../../../utils/l10n';

// Mock utilities
jest.mock('../../../utils/exportUtils', () => ({
  exportAllPals: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../utils/importUtils', () => ({
  importPals: jest.fn().mockResolvedValue(5),
}));

// Mock Menu component
jest.mock('../../Menu', () => {
  const {View, Button} = require('react-native');

  const MockMenuItem = ({onPress, label, submenu}: any) => {
    if (submenu) {
      return (
        <View testID={`menu-item-${label}`}>
          <Button title={label} onPress={() => {}} />
          {submenu.map((item: any, index: number) => (
            <View key={index}>{item}</View>
          ))}
        </View>
      );
    }
    return (
      <Button testID={`menu-item-${label}`} title={label} onPress={onPress} />
    );
  };

  const Menu = ({children, visible, anchor}: any) => (
    <View testID="menu">
      {anchor}
      {visible && <View testID="menu-content">{children}</View>}
    </View>
  );

  Menu.Item = MockMenuItem;

  return {Menu};
});

// Mock Keyboard
jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
jest.spyOn(Keyboard, 'dismiss').mockImplementation();

// Mock Alert
jest.spyOn(Alert, 'alert');

describe('PalHeaderRight', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders correctly', () => {
      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalHeaderRight />
        </L10nContext.Provider>,
      );

      expect(getByTestId('menu')).toBeTruthy();
      expect(getByTestId('menu-button')).toBeTruthy();
    });

    it('menu is initially closed', () => {
      const {queryByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalHeaderRight />
        </L10nContext.Provider>,
      );

      expect(queryByTestId('menu-content')).toBeNull();
    });
  });

  describe('Menu Interaction', () => {
    it('opens menu when menu button is pressed', () => {
      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('menu-button');
      fireEvent.press(menuButton);

      expect(getByTestId('menu-content')).toBeTruthy();
    });

    it('dismisses keyboard before opening menu if keyboard is visible', () => {
      (Keyboard.isVisible as jest.Mock).mockReturnValue(true);

      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('menu-button');
      fireEvent.press(menuButton);

      expect(Keyboard.dismiss).toHaveBeenCalled();
    });

    it('does not dismiss keyboard if keyboard is not visible', () => {
      (Keyboard.isVisible as jest.Mock).mockReturnValue(false);

      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('menu-button');
      fireEvent.press(menuButton);

      expect(Keyboard.dismiss).not.toHaveBeenCalled();
    });
  });

  describe('Export Functionality', () => {
    it('exports all pals when export option is selected', async () => {
      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalHeaderRight />
        </L10nContext.Provider>,
      );

      // Open menu
      const menuButton = getByTestId('menu-button');
      fireEvent.press(menuButton);

      // Find and press export all pals button
      const exportButton = getByTestId(
        `menu-item-${l10n.en.components.palHeaderRight.exportAllPals}`,
      );
      fireEvent.press(exportButton);

      await waitFor(() => {
        expect(exportAllPals).toHaveBeenCalled();
      });
    });

    it('handles export error gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      (exportAllPals as jest.Mock).mockRejectedValueOnce(
        new Error('Export failed'),
      );

      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('menu-button');
      fireEvent.press(menuButton);

      const exportButton = getByTestId(
        `menu-item-${l10n.en.components.palHeaderRight.exportAllPals}`,
      );
      fireEvent.press(exportButton);

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          'Error exporting all pals:',
          expect.any(Error),
        );
        expect(Alert.alert).toHaveBeenCalledWith(
          'Export Error',
          'Failed to export all pals.',
        );
      });

      consoleError.mockRestore();
    });

    it('closes menu after successful export', async () => {
      const {getByTestId, queryByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('menu-button');
      fireEvent.press(menuButton);

      const exportButton = getByTestId(
        `menu-item-${l10n.en.components.palHeaderRight.exportAllPals}`,
      );
      fireEvent.press(exportButton);

      await waitFor(() => {
        expect(exportAllPals).toHaveBeenCalled();
        // Menu should be closed
        expect(queryByTestId('menu-content')).toBeNull();
      });
    });
  });

  describe('Import Functionality', () => {
    it('imports pals when import option is selected', async () => {
      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('menu-button');
      fireEvent.press(menuButton);

      const importButton = getByTestId(
        `menu-item-${l10n.en.components.palHeaderRight.importPals}`,
      );
      fireEvent.press(importButton);

      await waitFor(() => {
        expect(importPals).toHaveBeenCalled();
      });
    });

    it('shows success alert when pals are imported', async () => {
      (importPals as jest.Mock).mockResolvedValueOnce(5);

      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('menu-button');
      fireEvent.press(menuButton);

      const importButton = getByTestId(
        `menu-item-${l10n.en.components.palHeaderRight.importPals}`,
      );
      fireEvent.press(importButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Import Success',
          expect.stringContaining('5'),
        );
      });
    });

    it('does not show success alert when no pals are imported', async () => {
      (importPals as jest.Mock).mockResolvedValueOnce(0);

      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('menu-button');
      fireEvent.press(menuButton);

      const importButton = getByTestId(
        `menu-item-${l10n.en.components.palHeaderRight.importPals}`,
      );
      fireEvent.press(importButton);

      await waitFor(() => {
        expect(importPals).toHaveBeenCalled();
        expect(Alert.alert).not.toHaveBeenCalled();
      });
    });

    it('handles import error gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      (importPals as jest.Mock).mockRejectedValueOnce(
        new Error('Import failed'),
      );

      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('menu-button');
      fireEvent.press(menuButton);

      const importButton = getByTestId(
        `menu-item-${l10n.en.components.palHeaderRight.importPals}`,
      );
      fireEvent.press(importButton);

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          'Error importing pals:',
          expect.any(Error),
        );
        expect(Alert.alert).toHaveBeenCalledWith(
          'Import Error',
          l10n.en.components.palHeaderRight.importError,
        );
      });

      consoleError.mockRestore();
    });

    it('closes menu after import attempt', async () => {
      const {getByTestId, queryByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('menu-button');
      fireEvent.press(menuButton);

      const importButton = getByTestId(
        `menu-item-${l10n.en.components.palHeaderRight.importPals}`,
      );
      fireEvent.press(importButton);

      await waitFor(() => {
        expect(importPals).toHaveBeenCalled();
        expect(queryByTestId('menu-content')).toBeNull();
      });
    });
  });
});
