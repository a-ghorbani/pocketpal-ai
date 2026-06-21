import React, {useContext, useEffect, useState} from 'react';
import {View} from 'react-native';

import {Button, Chip} from '../../../components/ui';
import {Sheet} from '../../../components/Sheet';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';

import {createSheetStyles} from './styles';

export interface PriceRange {
  min?: number;
  max?: number;
}

interface PriceFilterSheetProps {
  isVisible: boolean;
  selected: PriceRange | null;
  onClose: () => void;
  onApply: (range: PriceRange | null) => void;
}

// Preset ranges in cents; bounds map to PalsQuery price_min / price_max.
const PRESETS: {key: string; label: string; range: PriceRange}[] = [
  {key: 'free', label: 'Free', range: {min: 0, max: 0}},
  {key: 'under-5', label: '< €5', range: {max: 499}},
  {key: '5-10', label: '€5 – €10', range: {min: 500, max: 1000}},
  {key: 'over-10', label: '€10+', range: {min: 1001}},
];

const sameRange = (a: PriceRange | null, b: PriceRange) =>
  !!a && a.min === b.min && a.max === b.max;

export const PriceFilterSheet: React.FC<PriceFilterSheetProps> = ({
  isVisible,
  selected,
  onClose,
  onApply,
}) => {
  const theme = useTheme();
  const styles = createSheetStyles(theme);
  const l10n = useContext(L10nContext);

  const [current, setCurrent] = useState<PriceRange | null>(selected);

  useEffect(() => {
    if (isVisible) {
      setCurrent(selected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  return (
    <Sheet
      isVisible={isVisible}
      onClose={onClose}
      title={l10n.explore.priceRange}
      snapPoints={['40%']}>
      <Sheet.ScrollView contentContainerStyle={styles.content}>
        <View style={styles.chips}>
          {PRESETS.map(({key, label, range}) => (
            <Chip
              key={key}
              testID={`explore-price-chip-${key}`}
              variant="selectable"
              selected={sameRange(current, range)}
              label={label}
              accessibilityLabel={label}
              onPress={() =>
                setCurrent(sameRange(current, range) ? null : range)
              }
            />
          ))}
        </View>
      </Sheet.ScrollView>
      <Sheet.Actions>
        <View style={styles.actions}>
          <Button
            testID="explore-price-clear"
            variant="tertiary"
            label={l10n.explore.clearFilters}
            onPress={() => setCurrent(null)}
          />
          <Button
            testID="explore-price-apply"
            label={l10n.explore.apply}
            onPress={() => onApply(current)}
          />
        </View>
      </Sheet.Actions>
    </Sheet>
  );
};
