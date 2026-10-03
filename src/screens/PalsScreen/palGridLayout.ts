import type {Pal} from '../../store';
import type {PalsHubPal} from '../../types/palshub';

export const H_PADDING = 16;
export const GAP = 16;
export const MIN_CARD_WIDTH = 160;
export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 6;

export type PalGridItem = PalsHubPal | Pal;

export interface PalGridLayout {
  columns: number;
  cardWidth: number;
}

export interface PalGridRowData {
  key: string;
  items: PalGridItem[];
}

export const computePalGridLayout = (width: number): PalGridLayout => {
  const available = width - 2 * H_PADDING;
  const fitting = Math.floor((available + GAP) / (MIN_CARD_WIDTH + GAP));
  const columns = Math.min(Math.max(fitting, MIN_COLUMNS), MAX_COLUMNS);

  return {
    columns,
    cardWidth: (available - GAP * (columns - 1)) / columns,
  };
};

export const chunkIntoRows = (
  items: PalGridItem[],
  columns: number,
): PalGridRowData[] => {
  const rows: PalGridRowData[] = [];

  for (let index = 0; index < items.length; index += columns) {
    const rowItems = items.slice(index, index + columns);
    rows.push({
      key: `${index}|${rowItems.map(item => item.id).join('|')}`,
      items: rowItems,
    });
  }

  return rows;
};
