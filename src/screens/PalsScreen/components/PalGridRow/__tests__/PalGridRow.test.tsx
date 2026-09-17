import React from 'react';
import {StyleSheet, View} from 'react-native';

import {render} from '../../../../../../jest/test-utils';
import {createPal} from '../../../../../../jest/fixtures/pals';

import {PalGridRow} from '../PalGridRow';
import {styles} from '../styles';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: jest.fn()}),
}));

describe('PalGridRow', () => {
  const items = [createPal({id: 'cell-a'}), createPal({id: 'cell-b'})];

  const renderCells = () => {
    const {UNSAFE_getAllByType} = render(
      <PalGridRow
        row={{key: 'row-0', items}}
        cardWidth={180}
        onPalPress={jest.fn()}
      />,
    );

    return UNSAFE_getAllByType(View).filter(
      view =>
        Array.isArray(view.props.style) && view.props.style[0] === styles.cell,
    );
  };

  it('gives every cell the card width and no flex of its own', () => {
    const cells = renderCells();

    expect(cells).toHaveLength(items.length);
    cells.forEach(cell => {
      const style = StyleSheet.flatten(cell.props.style);

      expect(style.width).toBe(180);
      expect(style.flex).toBeUndefined();
      expect(style.flexGrow).toBeUndefined();
      expect(style.flexBasis).toBeUndefined();
    });
  });
});
