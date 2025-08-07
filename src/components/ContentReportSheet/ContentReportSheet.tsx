import {View, Alert} from 'react-native';
import React, {useContext, useState} from 'react';

import {Text, Button, Switch, ActivityIndicator} from 'react-native-paper';

import {Sheet} from '../Sheet/Sheet';

import {submitContentReport} from '../../api/feedback';

import {ChevronDownIcon} from '../../assets/icons';

import {useTheme} from '../../hooks';

import {Menu} from '../Menu';
import {createStyles} from './styles';

import {modelStore} from '../../store';

import {L10nContext} from '../../utils';

import {TextInput} from '..';

interface ContentReportSheetProps {
  isVisible: boolean;
  onClose: () => void;
}

const REPORT_CATEGORIES = [
  'hate',
  'sexual',
  'selfHarm',
  'violence',
  'other',
] as const;

type ReportCategory = (typeof REPORT_CATEGORIES)[number];

const ChevronDownButtonIcon = ({color}: {color: string}) => (
  <ChevronDownIcon width={16} height={16} stroke={color} />
);

export const ContentReportSheet: React.FC<ContentReportSheetProps> = ({
  isVisible,
  onClose,
}) => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);

  const [selectedCategory, setSelectedCategory] =
    useState<ReportCategory | null>(null);
  const [description, setDescription] = useState('');
  const [includeModelInfo, setIncludeModelInfo] = useState(false);

  const hasActiveModel = modelStore.activeModelId !== undefined;
  const activeModel = modelStore.models.find(
    m => m.id === modelStore.activeModelId,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categoryMenuVisible, setCategoryMenuVisible] = useState(false);

  const handleClose = () => {
    setSelectedCategory(null);
    setDescription('');
    setIncludeModelInfo(false);
    setIsSubmitting(false);
    setCategoryMenuVisible(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedCategory || !description.trim()) {
      Alert.alert(
        l10n.components.contentReportSheet.validation.title,
        l10n.components.contentReportSheet.validation.message,
        [{text: l10n.common.ok}],
      );
      return;
    }

    setIsSubmitting(true);

    try {
      await submitContentReport({
        category: selectedCategory,
        description: description.trim(),
        includeModelInfo,
        modelId: includeModelInfo ? activeModel?.id : undefined,
        modelOid: includeModelInfo ? activeModel?.hfModelFile?.oid : undefined,
        isContentReport: true,
      });

      Alert.alert(
        l10n.components.contentReportSheet.success.title,
        l10n.components.contentReportSheet.success.message,
        [{text: l10n.common.ok, onPress: handleClose}],
      );
    } catch (error) {
      console.error('Content report submission error:', error);
      Alert.alert(
        l10n.components.contentReportSheet.error.title,
        l10n.components.contentReportSheet.error.message,
        [{text: l10n.common.ok}],
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCategoryLabel = (category: ReportCategory) => {
    return l10n.components.contentReportSheet.categories[category];
  };

  return (
    <Sheet
      title={l10n.components.contentReportSheet.title}
      isVisible={isVisible}
      onClose={handleClose}
      snapPoints={['70%']}>
      <Sheet.ScrollView
        // bottomOffset={80}
        contentContainerStyle={styles.container}>
        <View style={styles.section}>
          <Text variant="bodyMedium" style={styles.infoNote}>
            {l10n.components.contentReportSheet.privacyNote}
          </Text>
        </View>

        <View style={styles.section}>
          <Text variant="labelMedium" style={styles.label}>
            {l10n.components.contentReportSheet.categoryLabel}
          </Text>
          <Menu
            visible={categoryMenuVisible}
            onDismiss={() => setCategoryMenuVisible(false)}
            anchor={
              <Button
                mode="outlined"
                onPress={() => setCategoryMenuVisible(true)}
                style={styles.categoryButton}
                contentStyle={styles.categoryButtonContent}
                icon={ChevronDownButtonIcon}>
                {selectedCategory
                  ? getCategoryLabel(selectedCategory)
                  : l10n.components.contentReportSheet.selectCategory}
              </Button>
            }>
            {REPORT_CATEGORIES.map(category => (
              <Menu.Item
                key={category}
                onPress={() => {
                  setSelectedCategory(category);
                  setCategoryMenuVisible(false);
                }}
                label={getCategoryLabel(category)}
              />
            ))}
          </Menu>
        </View>

        <View style={styles.section}>
          <Text variant="labelMedium" style={styles.label}>
            {l10n.components.contentReportSheet.descriptionLabel}
          </Text>
          <TextInput
            multiline
            numberOfLines={4}
            defaultValue={description}
            onChangeText={setDescription}
            placeholder={
              l10n.components.contentReportSheet.descriptionPlaceholder
            }
            style={styles.textInput}
          />
        </View>

        <View style={styles.switchSection}>
          <View style={styles.switchContent}>
            <Text
              variant="bodyMedium"
              style={[
                styles.switchLabel,
                !hasActiveModel && styles.disabledText,
              ]}>
              {l10n.components.contentReportSheet.includeModelInfo}
            </Text>
            <Switch
              value={includeModelInfo && hasActiveModel}
              onValueChange={hasActiveModel ? setIncludeModelInfo : undefined}
              disabled={!hasActiveModel}
            />
          </View>
          <Text
            variant="bodySmall"
            style={[
              styles.switchDescription,
              !hasActiveModel && styles.disabledText,
            ]}>
            {hasActiveModel
              ? l10n.components.contentReportSheet.includeModelInfoDescription
              : l10n.components.contentReportSheet.noActiveModelNote}
          </Text>
        </View>
      </Sheet.ScrollView>

      <Sheet.Actions>
        <View style={styles.actionsContainer}>
          <Button
            mode="outlined"
            onPress={handleClose}
            disabled={isSubmitting}
            style={styles.button}>
            {l10n.common.cancel}
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={styles.button}>
            {isSubmitting ? (
              <ActivityIndicator size="small" />
            ) : (
              l10n.components.contentReportSheet.submit
            )}
          </Button>
        </View>
      </Sheet.Actions>
    </Sheet>
  );
};
