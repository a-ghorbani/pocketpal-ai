import React, {useState, useContext} from 'react';
import {View, ScrollView, Pressable, Alert} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, Divider, IconButton} from 'react-native-paper';
import {observer} from 'mobx-react-lite';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {
  ChevronRightIcon,
  ChevronDownIcon,
  PlusIcon,
  PencilLineIcon,
  TrashIcon,
  AlertIcon,
  ShareIcon,
} from '../../assets/icons';
import {
  AssistantPalSheet,
  RoleplayPalSheet,
  VideoPalSheet,
  PalType,
} from '../../components/PalsSheets';
import {palStore, Pal} from '../../store/PalStore';
import {modelStore} from '../../store/ModelStore';
import {L10nContext} from '../../utils';
import {exportPal} from '../../utils/exportUtils';

const PalDetails = ({pal}: {pal: Pal}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets);
  const l10n = useContext(L10nContext);

  if (pal.palType === PalType.ASSISTANT) {
    return (
      <View style={styles.infoContainer}>
        <View style={styles.infoColumn}>
          <Text style={theme.fonts.titleMediumLight}>
            {l10n.palsScreen.systemPrompt}
          </Text>
          <Text style={styles.itemDescription}>{pal.systemPrompt}</Text>
        </View>
      </View>
    );
  }

  if (pal.palType === PalType.VIDEO) {
    return (
      <View style={styles.infoContainer}>
        <View style={styles.infoColumn}>
          <Text style={theme.fonts.titleMediumLight}>
            {l10n.palsScreen.videoAnalysis}
          </Text>
          <Text style={styles.itemDescription}>
            {l10n.palsScreen.videoAnalysisDescription}
          </Text>
        </View>
        <View style={styles.infoColumn}>
          <Text style={theme.fonts.titleMediumLight}>
            {l10n.palsScreen.captureInterval}
          </Text>
          <Text style={styles.itemDescription}>
            {(pal as any).captureInterval} {l10n.palsScreen.captureIntervalUnit}
          </Text>
        </View>
        <View style={styles.infoColumn}>
          <Text style={theme.fonts.titleMediumLight}>
            {l10n.palsScreen.systemPrompt}
          </Text>
          <Text style={styles.itemDescription}>{pal.systemPrompt}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.infoContainer}>
      <View style={styles.infoColumn}>
        <Text style={theme.fonts.titleMediumLight}>
          {l10n.palsScreen.world}
        </Text>
        <Text style={styles.itemDescription}>{pal.world}</Text>
      </View>

      <View style={styles.infoColumn}>
        <Text style={theme.fonts.titleMediumLight}>
          {l10n.palsScreen.toneStyle}
        </Text>
        <Text style={styles.itemDescription}>{pal.toneStyle}</Text>
      </View>

      <View style={styles.infoColumn}>
        <Text style={theme.fonts.titleMediumLight}>
          {l10n.palsScreen.aiRole}
        </Text>
        <Text style={styles.itemDescription}>{pal.aiRole}</Text>
      </View>

      <View style={styles.infoColumn}>
        <Text style={theme.fonts.titleMediumLight}>
          {l10n.palsScreen.userRole}
        </Text>
        <Text style={styles.itemDescription}>{pal.userRole}</Text>
      </View>

      <View style={styles.infoColumn}>
        <Text style={theme.fonts.titleMediumLight}>
          {l10n.palsScreen.prompt}
        </Text>
        <Text style={styles.itemDescription}>{pal.systemPrompt}</Text>
      </View>
    </View>
  );
};

const PalCard = ({pal, onEdit}: {pal: Pal; onEdit: (pal: Pal) => void}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets);
  const l10n = useContext(L10nContext);
  const isDefaultModelMissing =
    pal.defaultModel && !modelStore.isModelAvailable(pal.defaultModel?.id);

  const handleDelete = () => {
    Alert.alert(l10n.palsScreen.deletePal, l10n.palsScreen.deletePalMessage, [
      {
        text: l10n.common.cancel,
        style: 'cancel',
      },
      {
        text: l10n.common.delete,
        onPress: () => palStore.deletePal(pal.id),
        style: 'destructive',
      },
    ]);
  };

  const handleExport = async () => {
    await exportPal(pal.id);
  };

  const handleWarningPress = () => {
    Alert.alert(
      l10n.palsScreen.missingModel,
      l10n.palsScreen.missingModelMessage.replace(
        '{{modelName}}',
        pal.defaultModel?.name || '',
      ),
    );
  };

  const renderWarningIcon = () => (
    <AlertIcon stroke={theme.colors.error} width={20} height={20} />
  );

  const renderTrashIcon = () => (
    <TrashIcon stroke={theme.colors.onSurface} width={20} height={20} />
  );

  const renderPencilIcon = () => (
    <PencilLineIcon stroke={theme.colors.onSurface} width={20} height={20} />
  );

  const renderShareIcon = () => (
    <ShareIcon stroke={theme.colors.onSurface} width={20} height={20} />
  );

  return (
    <View style={styles.palCard}>
      <Pressable
        onPress={() => setIsExpanded(!isExpanded)}
        style={[styles.itemContainer, isExpanded && styles.expandedItem]}>
        <View style={styles.nameContainer}>
          {isDefaultModelMissing && (
            <IconButton
              icon={renderWarningIcon}
              onPress={handleWarningPress}
              style={styles.warningIcon}
            />
          )}
          <Text style={theme.fonts.titleMediumLight}>{pal.name}</Text>
        </View>
        <View style={styles.itemRight}>
          <IconButton
            icon={renderShareIcon}
            onPress={handleExport}
            style={styles.iconBtn}
          />
          <IconButton
            icon={renderTrashIcon}
            onPress={handleDelete}
            style={styles.iconBtn}
          />
          <IconButton
            icon={renderPencilIcon}
            onPress={() => onEdit(pal)}
            style={styles.iconBtn}
          />
          {isExpanded ? (
            <ChevronDownIcon stroke={theme.colors.onSurface} />
          ) : (
            <ChevronRightIcon stroke={theme.colors.onSurface} />
          )}
        </View>
      </Pressable>

      {isExpanded && <PalDetails pal={pal} />}
    </View>
  );
};

export const PalsScreen: React.FC = observer(() => {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = createStyles(theme, insets);
  const l10n = useContext(L10nContext);

  const [showAssistantSheet, setShowAssistantSheet] = useState(false);
  const [showRoleplaySheet, setShowRoleplaySheet] = useState(false);

  const [showVideoSheet, setShowVideoSheet] = useState(false);
  const [editPal, setEditPal] = useState<Pal | undefined>();

  const handleCreatePal = (type: PalType) => {
    setEditPal(undefined);
    if (type === PalType.ASSISTANT) {
      setShowAssistantSheet(true);
    } else if (type === PalType.ROLEPLAY) {
      setShowRoleplaySheet(true);
    } else if (type === PalType.VIDEO) {
      setShowVideoSheet(true);
    }
  };

  const handleEditPal = (pal: Pal) => {
    setEditPal(pal);
    if (pal.palType === PalType.ASSISTANT) {
      setShowAssistantSheet(true);
    } else if (pal.palType === PalType.ROLEPLAY) {
      setShowRoleplaySheet(true);
    } else if (pal.palType === PalType.VIDEO) {
      setShowVideoSheet(true);
    }
  };

  const pals = palStore.getPals();

  return (
    <ScrollView
      style={styles.scrollview}
      contentContainerStyle={styles.scrollviewContent}>
      <View style={styles.createBtnsContainer}>
        <Pressable
          style={styles.itemContainer}
          onPress={() => handleCreatePal(PalType.ASSISTANT)}>
          <Text style={theme.fonts.titleMediumLight}>
            {l10n.palsScreen.assistant}
          </Text>
          <PlusIcon stroke={theme.colors.onSurface} />
        </Pressable>
        <Pressable
          style={styles.itemContainer}
          onPress={() => handleCreatePal(PalType.ROLEPLAY)}>
          <Text style={theme.fonts.titleMediumLight}>
            {l10n.palsScreen.roleplay}
          </Text>
          <PlusIcon stroke={theme.colors.onSurface} />
        </Pressable>

        <Pressable
          style={styles.itemContainer}
          onPress={() => handleCreatePal(PalType.VIDEO)}>
          <Text style={theme.fonts.titleMediumLight}>
            {l10n.palsScreen.video}
          </Text>
          <PlusIcon stroke={theme.colors.onSurface} />
        </Pressable>
      </View>

      <Divider style={styles.divider} />

      <View style={styles.palContainer}>
        {pals.map(pal => (
          <PalCard key={pal.id} pal={pal} onEdit={handleEditPal} />
        ))}
      </View>

      <AssistantPalSheet
        isVisible={showAssistantSheet}
        onClose={() => setShowAssistantSheet(false)}
        editPal={editPal?.palType === PalType.ASSISTANT ? editPal : undefined}
      />

      <RoleplayPalSheet
        isVisible={showRoleplaySheet}
        onClose={() => setShowRoleplaySheet(false)}
        editPal={editPal?.palType === PalType.ROLEPLAY ? editPal : undefined}
      />

      <VideoPalSheet
        isVisible={showVideoSheet}
        onClose={() => setShowVideoSheet(false)}
        editPal={editPal?.palType === PalType.VIDEO ? editPal : undefined}
      />
    </ScrollView>
  );
});
