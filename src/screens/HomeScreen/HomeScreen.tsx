import React, {useContext, useState} from 'react';
import {Image, ScrollView, Text, TextInput, View} from 'react-native';

import {observer} from 'mobx-react';
import {SafeAreaView} from 'react-native-safe-area-context';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {palStore, chatSessionStore, modelStore} from '../../store';
import {getFullThumbnailUri} from '../../utils/imageUtils';
import {Pressable} from '../../components/ui/primitives/Pressable';
import {ChatPalModelPickerSheet} from '../../components/ChatPalModelPickerSheet';
import {PlusIcon, SendIcon, ChevronDownIcon} from '../../assets/icons';
import type {Pal} from '../../types/pal';
import type {SessionMetaData} from '../../store/ChatSessionStore';

const PalCarouselItem: React.FC<{
  pal: Pal;
  onPress: () => void;
}> = ({pal, onPress}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const uri = pal.thumbnail_url
    ? getFullThumbnailUri(pal.thumbnail_url)
    : undefined;
  const background = pal.color?.[0] ?? theme.colors.primary;
  return (
    <Pressable
      style={styles.palItem}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={pal.name}
      testID={`home-pal-${pal.id}`}>
      <View style={[styles.palAvatar, {backgroundColor: background}]}>
        {uri ? (
          <Image source={{uri}} style={styles.palAvatarImage} />
        ) : (
          <Text style={styles.palAvatarInitial}>
            {pal.name.slice(0, 1).toUpperCase()}
          </Text>
        )}
      </View>
      <Text style={styles.palLabel} numberOfLines={1}>
        {pal.name}
      </Text>
    </Pressable>
  );
};

export const HomeScreen: React.FC = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);

  const [composerText, setComposerText] = useState('');
  const [activePal, setActivePalLocal] = useState<Pal | undefined>(undefined);
  const [isPickerVisible, setPickerVisible] = useState(false);

  const sessions = chatSessionStore.sessions;
  const activeModelName = modelStore.activeModel?.name;

  const composerPlaceholder = activePal
    ? t(l10n.home.composerPlaceholder, {pal: activePal.name})
    : l10n.home.composerPlaceholderGeneric;

  // Inert in this slice; the start-chat handoff is wired in a later step.
  const handlePalPress = (_pal: Pal) => {};
  const handleAddPal = () => {};
  const handleSend = () => {};
  const handleHistoryPress = (_session: SessionMetaData) => {};
  const handleModelChipPress = () => setPickerVisible(true);

  const palNameFor = (palId?: string) =>
    palId ? palStore.getPalById(palId)?.name : undefined;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']} testID="home-screen">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{l10n.home.title}</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.carousel}
          contentContainerStyle={styles.carouselContent}>
          {palStore.pals.map(pal => (
            <PalCarouselItem
              key={pal.id}
              pal={pal}
              onPress={() => handlePalPress(pal)}
            />
          ))}
          <Pressable
            style={styles.palItem}
            onPress={handleAddPal}
            accessibilityRole="button"
            accessibilityLabel={l10n.home.addPal}
            testID="home-add-pal">
            <View style={[styles.palAvatar, styles.addAvatar]}>
              <PlusIcon stroke={theme.colors.onSurfaceVariant} />
            </View>
            <Text style={styles.palLabel} numberOfLines={1}>
              {l10n.home.addPal}
            </Text>
          </Pressable>
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            placeholder={composerPlaceholder}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={composerText}
            onChangeText={setComposerText}
            multiline
            testID="home-composer-input"
          />
          <View style={styles.composerActions}>
            <Pressable
              onPress={handleAddPal}
              accessibilityRole="button"
              accessibilityLabel={l10n.home.addPal}
              testID="home-composer-attach">
              <PlusIcon stroke={theme.colors.onSurfaceVariant} />
            </Pressable>
            <Pressable
              style={styles.sendButton}
              onPress={handleSend}
              accessibilityRole="button"
              accessibilityLabel={l10n.home.title}
              testID="home-composer-send">
              <SendIcon stroke={theme.colors.onPrimary} />
            </Pressable>
          </View>
        </View>

        <Pressable
          style={styles.modelChip}
          onPress={handleModelChipPress}
          accessibilityRole="button"
          accessibilityLabel={l10n.home.modelChipPrefix}
          testID="home-model-chip">
          <Text style={styles.modelChipText} numberOfLines={1}>
            {activeModelName
              ? `${l10n.home.modelChipPrefix} ${activeModelName}`
              : l10n.home.modelChipEmpty}
          </Text>
          <ChevronDownIcon stroke={theme.colors.onSurfaceVariant} />
        </Pressable>

        <Text style={styles.historyTitle}>{l10n.home.chatHistory}</Text>
        {sessions.length === 0 ? (
          <Text style={styles.emptyHint} testID="home-empty-hint">
            {l10n.home.emptyHint}
          </Text>
        ) : (
          sessions.map(session => (
            <Pressable
              key={session.id}
              style={styles.historyRow}
              onPress={() => handleHistoryPress(session)}
              accessibilityRole="button"
              accessibilityLabel={session.title}
              testID={`home-history-${session.id}`}>
              <Text style={styles.historyRowTitle} numberOfLines={1}>
                {session.title}
              </Text>
              <Text style={styles.historyRowMeta} numberOfLines={1}>
                {[palNameFor(session.activePalId), session.date]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>

      {isPickerVisible && (
        <ChatPalModelPickerSheet
          isVisible={isPickerVisible}
          chatInputHeight={0}
          onClose={() => setPickerVisible(false)}
          onModelSelect={() => setPickerVisible(false)}
          onPalSelect={palId => {
            setActivePalLocal(palId ? palStore.getPalById(palId) : undefined);
            setPickerVisible(false);
          }}
        />
      )}
    </SafeAreaView>
  );
});
