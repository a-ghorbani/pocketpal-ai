import React, {useState} from 'react';
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
} from '../../assets/icons';
import {
  AssistantPalSheet,
  RoleplayPalSheet,
  LookieSheet,
  VideoPalSheet,
  PalType,
} from '../../components/PalsSheets';
import {palStore, Pal} from '../../store/PalStore';
import {modelStore} from '../../store/ModelStore';

const PalDetails = ({pal}: {pal: Pal}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets);

  if (pal.palType === PalType.ASSISTANT) {
    return (
      <View style={styles.infoContainer}>
        <View style={styles.infoColumn}>
          <Text style={theme.fonts.titleMediumLight}>System Prompt</Text>
          <Text style={styles.itemDescription}>{pal.systemPrompt}</Text>
        </View>
      </View>
    );
  }

  if (pal.palType === PalType.CAMERA) {
    return (
      <View style={styles.infoContainer}>
        <View style={styles.infoColumn}>
          <Text style={theme.fonts.titleMediumLight}>Vision</Text>
          <Text style={styles.itemDescription}>
            This is a camera-based AI assistant that analyzes images captured
            through your device's camera.
          </Text>
        </View>
        <View style={styles.infoColumn}>
          <Text style={theme.fonts.titleMediumLight}>System Prompt</Text>
          <Text style={styles.itemDescription}>{pal.systemPrompt}</Text>
        </View>
      </View>
    );
  }

  if (pal.palType === PalType.VIDEO) {
    return (
      <View style={styles.infoContainer}>
        <View style={styles.infoColumn}>
          <Text style={theme.fonts.titleMediumLight}>Video Analysis</Text>
          <Text style={styles.itemDescription}>
            This is a video-based AI assistant that provides real-time
            commentary on video streams from your device's camera.
          </Text>
        </View>
        <View style={styles.infoColumn}>
          <Text style={theme.fonts.titleMediumLight}>Capture Interval</Text>
          <Text style={styles.itemDescription}>
            {(pal as any).captureInterval} ms
          </Text>
        </View>
        <View style={styles.infoColumn}>
          <Text style={theme.fonts.titleMediumLight}>System Prompt</Text>
          <Text style={styles.itemDescription}>{pal.systemPrompt}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.infoContainer}>
      <View style={styles.infoColumn}>
        <Text style={theme.fonts.titleMediumLight}>World</Text>
        <Text style={styles.itemDescription}>{pal.world}</Text>
      </View>

      <View style={styles.infoColumn}>
        <Text style={theme.fonts.titleMediumLight}>Tone/Style</Text>
        <Text style={styles.itemDescription}>{pal.toneStyle}</Text>
      </View>

      <View style={styles.infoColumn}>
        <Text style={theme.fonts.titleMediumLight}>AI's Role</Text>
        <Text style={styles.itemDescription}>{pal.aiRole}</Text>
      </View>

      <View style={styles.infoColumn}>
        <Text style={theme.fonts.titleMediumLight}>My Role</Text>
        <Text style={styles.itemDescription}>{pal.userRole}</Text>
      </View>

      <View style={styles.infoColumn}>
        <Text style={theme.fonts.titleMediumLight}>Prompt</Text>
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
  const isDefaultModelMissing =
    pal.defaultModel && !modelStore.isModelAvailable(pal.defaultModel?.id);

  const handleDelete = () => {
    Alert.alert('Delete Pal', 'Are you sure you want to delete this pal?', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Delete',
        onPress: () => palStore.deletePal(pal.id),
        style: 'destructive',
      },
    ]);
  };

  const handleWarningPress = () => {
    Alert.alert(
      'Missing Model',
      `The default model "${pal.defaultModel?.name}" for this pal is not available. Please download it in the edit sheet or select a different model.`,
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

  const [showAssistantSheet, setShowAssistantSheet] = useState(false);
  const [showRoleplaySheet, setShowRoleplaySheet] = useState(false);
  const [showLookieSheet, setShowLookieSheet] = useState(false);
  const [showVideoSheet, setShowVideoSheet] = useState(false);
  const [editPal, setEditPal] = useState<Pal | undefined>();

  const handleCreatePal = (type: PalType) => {
    setEditPal(undefined);
    if (type === PalType.ASSISTANT) {
      setShowAssistantSheet(true);
    } else if (type === PalType.ROLEPLAY) {
      setShowRoleplaySheet(true);
    } else if (type === PalType.CAMERA) {
      setShowLookieSheet(true);
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
    } else if (pal.palType === PalType.CAMERA) {
      setShowLookieSheet(true);
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
          <Text style={theme.fonts.titleMediumLight}>Assistant</Text>
          <PlusIcon stroke={theme.colors.onSurface} />
        </Pressable>
        <Pressable
          style={styles.itemContainer}
          onPress={() => handleCreatePal(PalType.ROLEPLAY)}>
          <Text style={theme.fonts.titleMediumLight}>Roleplay</Text>
          <PlusIcon stroke={theme.colors.onSurface} />
        </Pressable>
        <Pressable
          style={styles.itemContainer}
          onPress={() => handleCreatePal(PalType.CAMERA)}>
          <Text style={theme.fonts.titleMediumLight}>Vision</Text>
          <PlusIcon stroke={theme.colors.onSurface} />
        </Pressable>
        <Pressable
          style={styles.itemContainer}
          onPress={() => handleCreatePal(PalType.VIDEO)}>
          <Text style={theme.fonts.titleMediumLight}>Video</Text>
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

      <LookieSheet
        isVisible={showLookieSheet}
        onClose={() => setShowLookieSheet(false)}
        editPal={editPal?.palType === PalType.CAMERA ? editPal : undefined}
      />

      <VideoPalSheet
        isVisible={showVideoSheet}
        onClose={() => setShowVideoSheet(false)}
        editPal={editPal?.palType === PalType.VIDEO ? editPal : undefined}
      />
    </ScrollView>
  );
});
