import React from 'react';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {act, fireEvent, render} from '../../../../jest/test-utils';
import {measuresIncludeStatusBar} from '../../../utils/edgeToEdge';
import {Menu} from '../Menu';

jest.mock('../../../utils/edgeToEdge', () => ({
  measuresIncludeStatusBar: jest.fn(() => false),
}));

describe('Menu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders menu items correctly', () => {
    const {getByText} = render(
      <Menu visible={true} onDismiss={() => {}} anchor={undefined}>
        <Menu.Item label="Item 1" onPress={() => {}} />
        <Menu.Item label="Item 2" onPress={() => {}} />
      </Menu>,
    );

    expect(getByText('Item 1')).toBeTruthy();
    expect(getByText('Item 2')).toBeTruthy();
  });

  it('renders separators correctly', () => {
    const {UNSAFE_getAllByType} = render(
      <Menu visible={true} onDismiss={() => {}} anchor={undefined}>
        <Menu.Item label="Item 1" onPress={() => {}} />
        <Menu.Separator />
        <Menu.Item label="Item 2" onPress={() => {}} />
        <Menu.GroupSeparator />
        <Menu.Item label="Item 3" onPress={() => {}} />
      </Menu>,
    );

    const separators = UNSAFE_getAllByType(Menu.Separator);
    const groupSeparators = UNSAFE_getAllByType(Menu.GroupSeparator);

    expect(separators).toHaveLength(1);
    expect(groupSeparators).toHaveLength(1);
  });

  describe('statusBarHeight passed to PaperMenu', () => {
    const renderedStatusBarHeight = (includesStatusBar: boolean) => {
      (measuresIncludeStatusBar as jest.Mock).mockReturnValue(
        includesStatusBar,
      );
      (useSafeAreaInsets as jest.Mock).mockReturnValue({
        top: 59,
        right: 0,
        bottom: 34,
        left: 0,
      });

      const PaperMenu = require('react-native-paper').Menu;
      const {UNSAFE_getByType} = render(
        <Menu visible={true} onDismiss={() => {}} anchor={undefined}>
          <Menu.Item label="Item 1" onPress={() => {}} />
        </Menu>,
      );
      return UNSAFE_getByType(PaperMenu).props.statusBarHeight;
    };

    afterEach(() => {
      (measuresIncludeStatusBar as jest.Mock).mockReturnValue(false);
    });

    it('is 0 when RN measures in edge-to-edge window coordinates', () => {
      expect(renderedStatusBarHeight(true)).toBe(0);
    });

    it('is the top inset when the measure excludes the status bar (no edge-to-edge, or iOS)', () => {
      expect(renderedStatusBarHeight(false)).toBe(59);
    });
  });

  it('does not render when visible is true but has no children', () => {
    const PaperMenu = require('react-native-paper').Menu;
    const {UNSAFE_getByType} = render(
      <Menu visible={true} onDismiss={() => {}} anchor={undefined} />,
    );

    const paperMenuInstance = UNSAFE_getByType(PaperMenu);
    expect(paperMenuInstance.props.visible).toBe(false);
  });

  describe('open and close animation', () => {
    const elapse = (ms: number) =>
      act(() => new Promise<void>(resolve => setTimeout(resolve, ms)));

    const renderOpenMenu = async (onDismiss = jest.fn()) => {
      const ui = (isVisible: boolean) => (
        <Menu visible={isVisible} onDismiss={onDismiss} anchor={undefined}>
          <Menu.Item label="Item 1" onPress={() => {}} />
        </Menu>
      );
      const utils = render(ui(true));
      await elapse(600);
      return {...utils, setVisible: (v: boolean) => utils.rerender(ui(v))};
    };

    it('unmounts the items once the hide animation finishes', async () => {
      const {queryByText, setVisible} = await renderOpenMenu();
      expect(queryByText('Item 1')).toBeTruthy();

      setVisible(false);
      await elapse(600);

      expect(queryByText('Item 1')).toBeNull();
    });

    it('stays open when reopened while the hide animation is running', async () => {
      const {queryByText, setVisible} = await renderOpenMenu();

      setVisible(false);
      await elapse(0);
      setVisible(true);
      await elapse(600);

      expect(queryByText('Item 1')).toBeTruthy();
    });

    it('reopens after a completed hide', async () => {
      const {queryByText, setVisible} = await renderOpenMenu();

      setVisible(false);
      await elapse(600);
      expect(queryByText('Item 1')).toBeNull();

      setVisible(true);
      await elapse(600);

      expect(queryByText('Item 1')).toBeTruthy();
    });

    it('calls onDismiss from an overlay press only after the menu animates out', async () => {
      const onDismiss = jest.fn();
      const {getByLabelText} = await renderOpenMenu(onDismiss);

      fireEvent.press(
        getByLabelText('Close menu', {includeHiddenElements: true}),
      );
      expect(onDismiss).not.toHaveBeenCalled();

      await elapse(600);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('calls onDismiss from an accessibility escape only after the menu animates out', async () => {
      const onDismiss = jest.fn();
      const {getByTestId} = await renderOpenMenu(onDismiss);

      act(() => getByTestId('menu-view').props.onAccessibilityEscape());
      expect(onDismiss).not.toHaveBeenCalled();

      await elapse(600);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });
});
