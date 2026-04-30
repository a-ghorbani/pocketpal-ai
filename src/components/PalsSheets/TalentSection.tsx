import React, {useContext, useMemo} from 'react';
import {View} from 'react-native';
import {Switch, Text} from 'react-native-paper';
import {observer} from 'mobx-react-lite';
import {useFormContext, Controller} from 'react-hook-form';

import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {createStyles} from './styles';
import {SectionDivider} from './SectionDivider';
import type {PalFormData} from './types';
import {talentRegistry} from '../../services/talents';

export const TalentSection = observer(() => {
  const {control} = useFormContext<PalFormData>();
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);

  const availableTalents = useMemo(() => {
    return talentRegistry.getAll();
  }, []);

  return (
    <View testID="talent-section">
      <SectionDivider label={l10n.components.palSheet.talents} />
      <Controller
        control={control}
        name="talents"
        render={({field: {onChange, value}}) => (
          <View>
            {availableTalents.map(engine => {
              const isEnabled = (value ?? []).includes(engine.name);
              const descriptions = l10n.components.palSheet.talentDescriptions;
              const description =
                descriptions[engine.name as keyof typeof descriptions] ??
                engine.toToolDefinition().function.description;
              return (
                <View
                  key={engine.name}
                  style={styles.talentItem}
                  testID={`talent-item-${engine.name}`}>
                  <View style={styles.talentInfo}>
                    <Text variant="bodyMedium">{engine.name}</Text>
                    <Text variant="bodySmall" style={styles.talentDescription}>
                      {description}
                    </Text>
                  </View>
                  <Switch
                    testID={`talent-switch-${engine.name}`}
                    value={isEnabled}
                    onValueChange={checked => {
                      const current = value ?? [];
                      onChange(
                        checked
                          ? [...current, engine.name]
                          : current.filter((n: string) => n !== engine.name),
                      );
                    }}
                  />
                </View>
              );
            })}
          </View>
        )}
      />
    </View>
  );
});
