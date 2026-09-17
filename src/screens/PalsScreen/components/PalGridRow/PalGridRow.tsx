import React from 'react';
import {View} from 'react-native';

import {SquarePalCard} from '../SquarePalCard';

import {styles} from './styles';

import {isLocalPal} from '../../../../utils/pal-type-guards';

import type {PalGridItem, PalGridRowData} from '../../palGridLayout';

interface PalGridRowProps {
  row: PalGridRowData;
  cardWidth: number;
  onPalPress: (pal: PalGridItem) => void;
}

export const PalGridRow: React.FC<PalGridRowProps> = ({
  row,
  cardWidth,
  onPalPress,
}) => (
  <View style={styles.row}>
    {row.items.map(item => (
      <View key={item.id} style={[styles.cell, {width: cardWidth}]}>
        <SquarePalCard
          pal={item}
          onPress={() => onPalPress(item)}
          isLocal={isLocalPal(item)}
        />
      </View>
    ))}
  </View>
);
