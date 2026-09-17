import {createPal} from '../../../../jest/fixtures/pals';
import {
  GAP,
  H_PADDING,
  chunkIntoRows,
  computePalGridLayout,
} from '../palGridLayout';

describe('computePalGridLayout', () => {
  it('keeps two columns on a 320dp phone', () => {
    expect(computePalGridLayout(320)).toEqual({columns: 2, cardWidth: 136});
  });

  it('keeps two columns on a 360dp phone', () => {
    expect(computePalGridLayout(360)).toEqual({columns: 2, cardWidth: 156});
  });

  it('uses four columns on an 800dp tablet', () => {
    expect(computePalGridLayout(800)).toEqual({columns: 4, cardWidth: 180});
  });

  it('caps the column count on a very wide window', () => {
    expect(computePalGridLayout(1738).columns).toBe(6);
  });

  it('uses four columns at the Jest default window width', () => {
    expect(computePalGridLayout(750)).toEqual({columns: 4, cardWidth: 167.5});
  });

  it.each([320, 360, 750, 800, 1024, 1738])(
    'fills the window exactly at width %i',
    width => {
      const {columns, cardWidth} = computePalGridLayout(width);

      expect(
        2 * H_PADDING + columns * cardWidth + (columns - 1) * GAP,
      ).toBeCloseTo(width);
    },
  );
});

describe('chunkIntoRows', () => {
  const items = ['a', 'b', 'c', 'd', 'e'].map(id => createPal({id}));

  it('leaves the last row partial', () => {
    const rows = chunkIntoRows(items, 4);

    expect(rows.map(row => row.items.map(item => item.id))).toEqual([
      ['a', 'b', 'c', 'd'],
      ['e'],
    ]);
  });

  it('derives distinct row keys that are stable across calls', () => {
    const keys = chunkIntoRows(items, 4).map(row => row.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(chunkIntoRows(items, 4).map(row => row.key)).toEqual(keys);
  });

  it('keeps row keys distinct when every id is identical', () => {
    const duplicates = ['dup', 'dup', 'dup', 'dup'].map(id => createPal({id}));

    const keys = chunkIntoRows(duplicates, 2).map(row => row.key);

    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    expect(chunkIntoRows(duplicates, 2).map(row => row.key)).toEqual(keys);
  });

  it('returns no rows for an empty list', () => {
    expect(chunkIntoRows([], 4)).toEqual([]);
  });
});
