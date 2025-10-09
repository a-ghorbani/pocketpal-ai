import React, {useRef, useEffect, useContext} from 'react';
import {Alert, Dimensions, View, Pressable} from 'react-native';
import {observer} from 'mobx-react';
import {Text} from 'react-native-paper';
import BottomSheet, {
  BottomSheetFlatList,
  BottomSheetFlatListMethods,
  BottomSheetScrollView,
  BottomSheetView,
} from '@gorhom/bottom-sheet';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {modelStore, palStore, chatSessionStore} from '../../store';
import {CustomBackdrop} from '../Sheet/CustomBackdrop';
import {getModelSkills, L10nContext, Model} from '../../utils';
import type {Pal} from '../../types/pal';
//import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {CloseIcon, SettingsIcon} from '../../assets/icons';
import {SkillsDisplay} from '../SkillsDisplay';

type Tab = 'models' | 'pals';

interface ChatPalModelPickerSheetProps {
  isVisible: boolean;
  chatInputHeight: number;
  onClose: () => void;
  onModelSelect?: (modelId: string) => void;
  onPalSelect?: (palId: string | undefined) => void;
  onPalSettingsSelect?: (pal: Pal) => void;
  keyboardHeight: number;
}

const ObservedSkillsDisplay = observer(({model}) => {
  const hasProjectionModelWarning =
    model.supportsMultimodal &&
    model.visionEnabled &&
    modelStore.getProjectionModelStatus(model).state === 'missing';

  const toggleVision = async () => {
    if (!model.supportsMultimodal) {
      return;
    }
    try {
      await modelStore.setModelVisionEnabled(
        model.id,
        !modelStore.getModelVisionPreference(model),
      );
    } catch (error) {
      console.error('Failed to toggle vision setting:', error);
      // The error is already handled in setModelVisionEnabled (vision state is reverted)
      // We could show a toast/snackbar here if needed
    }
  };
  const visionEnabled = modelStore.getModelVisionPreference(model);

  return (
    <SkillsDisplay
      model={model}
      hasProjectionModelWarning={hasProjectionModelWarning}
      onVisionPress={toggleVision}
      onProjectionWarningPress={() =>
        model.defaultProjectionModel &&
        modelStore.checkSpaceAndDownload(model.defaultProjectionModel)
      }
      visionEnabled={visionEnabled}
    />
  );
});

export const ChatPalModelPickerSheet = observer(
  ({
    isVisible,
    onClose,
    onModelSelect,
    onPalSelect,
    onPalSettingsSelect,
    chatInputHeight,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    keyboardHeight,
  }: ChatPalModelPickerSheetProps) => {
    const [activeTab, setActiveTab] = React.useState<Tab>('models');
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    // const insets = useSafeAreaInsets();
    const styles = createStyles({theme});
    const bottomSheetRef = useRef<BottomSheet>(null);
    const flatListRef = useRef<BottomSheetFlatListMethods>(null);

    const TABS = React.useMemo(
      () => [
        {
          id: 'pals' as Tab,
          label: l10n.components.chatPalModelPickerSheet.palsTab,
        },
        {
          id: 'models' as Tab,
          label: l10n.components.chatPalModelPickerSheet.modelsTab,
        },
      ],
      [
        l10n.components.chatPalModelPickerSheet.palsTab,
        l10n.components.chatPalModelPickerSheet.modelsTab,
      ],
    );

    useEffect(() => {
      if (isVisible) {
        bottomSheetRef.current?.expand();
      } else {
        bottomSheetRef.current?.close();
      }
    }, [isVisible]);

    const handleTabPress = (tab: Tab, index: number) => {
      setActiveTab(tab);
      flatListRef.current?.scrollToIndex({
        index,
        animated: true,
      });
    };

    const renderTab = (tab: Tab, label: string, index: number) => (
      <Pressable
        key={tab}
        style={[styles.tab, activeTab === tab && styles.activeTab]}
        onPress={() => handleTabPress(tab, index)}>
        <Text
          style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
          {label}
        </Text>
      </Pressable>
    );

    const handleModelSelect = React.useCallback(
      async (model: (typeof modelStore.availableModels)[0]) => {
        try {
          onModelSelect?.(model.id);
          onClose();
          modelStore.initContext(model);
        } catch (e) {
          console.log(`Error: ${e}`);
        }
      },
      [onModelSelect, onClose],
    );

    const handlePalSelect = React.useCallback(
      async (pal: (typeof palStore.pals)[0] | undefined) => {
        await chatSessionStore.setActivePal(pal?.id);
        if (
          pal?.defaultModel &&
          modelStore.activeModel &&
          pal.defaultModel?.id !== modelStore.activeModelId
        ) {
          const palDefaultModel = modelStore.availableModels.find(
            m => m.id === pal.defaultModel?.id,
          );
          if (palDefaultModel) {
            Alert.alert(
              l10n.components.chatPalModelPickerSheet.confirmationTitle,
              l10n.components.chatPalModelPickerSheet.modelSwitchMessage.replace(
                '{{modelName}}',
                palDefaultModel.name,
              ),
              [
                {
                  text: l10n.components.chatPalModelPickerSheet.keepButton,
                  style: 'cancel',
                },
                {
                  text: l10n.components.chatPalModelPickerSheet.switchButton,
                  onPress: () => {
                    modelStore.initContext(palDefaultModel);
                  },
                },
              ],
            );
          }
        }
        onPalSelect?.(pal?.id);
        onClose();
      },
      [onPalSelect, onClose, l10n.components.chatPalModelPickerSheet],
    );

    const renderDisablePalItem = React.useCallback(() => {
      const noActivePal = !chatSessionStore.activePalId;
      if (noActivePal) {
        return null;
      }
      return (
        <Pressable
          key="disable-pal"
          style={styles.listItem}
          onPress={() => handlePalSelect(undefined)}>
          <CloseIcon stroke={theme.colors.onSurface} />
          <View style={styles.itemContent}>
            <Text style={styles.itemTitle}>
              {l10n.components.chatPalModelPickerSheet.noPal}
            </Text>
            <Text style={styles.itemSubtitle}>
              {l10n.components.chatPalModelPickerSheet.disablePal}
            </Text>
          </View>
        </Pressable>
      );
    }, [
      styles,
      theme.colors.onSurface,
      l10n.components.chatPalModelPickerSheet.noPal,
      l10n.components.chatPalModelPickerSheet.disablePal,
      handlePalSelect,
    ]);

    const renderModelItem = React.useCallback(
      (model: Model) => {
        const isActiveModel = model.id === modelStore.activeModelId;
        const modelSkills = getModelSkills(model)
          .flatMap(skill => skill.labelKey)
          .join(', ');
        return (
          <Pressable
            key={model.id}
            style={[styles.listItem, isActiveModel && styles.activeListItem]}
            onPress={() => handleModelSelect(model)}>
            <View style={styles.itemContent}>
              <Text
                style={[
                  styles.itemTitle,
                  isActiveModel && styles.activeItemTitle,
                ]}>
                {model.name}
              </Text>
              {modelSkills && <ObservedSkillsDisplay model={model} />}
            </View>
          </Pressable>
        );
      },
      [styles, handleModelSelect],
    );

    const getCapabilityText = React.useCallback(
      (pal: Pal): string => {
        if (pal.capabilities?.video) {
          return l10n.components.chatPalModelPickerSheet.videoType;
        }

        // TODO: Add support for other capabilities
        // Use assistant for now.
        return l10n.components.chatPalModelPickerSheet.assistantType;
      },
      [l10n.components.chatPalModelPickerSheet],
    );

    const renderPalItem = React.useCallback(
      (pal: (typeof palStore.pals)[0]) => {
        const isActivePal = pal.id === chatSessionStore.activePalId;
        return (
          <Pressable
            key={pal.id}
            style={[styles.listItem, isActivePal && styles.activeListItem]}
            onPress={() => handlePalSelect(pal)}>
            <View style={styles.itemContent}>
              <View style={styles.itemTextContent}>
                <Text
                  style={[
                    styles.itemTitle,
                    isActivePal && styles.activeItemTitle,
                  ]}>
                  {pal.name}
                </Text>
                <Text
                  style={[
                    styles.itemSubtitle,
                    isActivePal && styles.activeItemSubtitle,
                  ]}>
                  {getCapabilityText(pal)}
                </Text>
              </View>
              {isActivePal && pal.type === 'local' && onPalSettingsSelect && (
                <Pressable
                  style={styles.settingsButton}
                  onPress={e => {
                    e.stopPropagation();
                    onPalSettingsSelect(pal);
                  }}>
                  <SettingsIcon
                    width={16}
                    height={16}
                    stroke={
                      isActivePal
                        ? styles.activeItemTitle.color
                        : styles.itemSubtitle.color
                    }
                  />
                </Pressable>
              )}
            </View>
          </Pressable>
        );
      },
      [
        styles.listItem,
        styles.activeListItem,
        styles.itemContent,
        styles.itemTextContent,
        styles.settingsButton,
        styles.itemTitle,
        styles.activeItemTitle,
        styles.itemSubtitle,
        styles.activeItemSubtitle,
        getCapabilityText,
        handlePalSelect,
        onPalSettingsSelect,
      ],
    );

    const renderContent = React.useCallback(
      ({item}: {item: (typeof TABS)[0]}) => (
        <View style={{width: Dimensions.get('window').width}}>
          <BottomSheetScrollView
            contentContainerStyle={{paddingBottom: chatInputHeight + 66}}>
            {item.id === 'models'
              ? modelStore.availableModels.map(renderModelItem)
              : [renderDisablePalItem(), ...palStore.pals.map(renderPalItem)]}
          </BottomSheetScrollView>
        </View>
      ),
      [chatInputHeight, renderDisablePalItem, renderModelItem, renderPalItem],
    );

    const onViewableItemsChanged = React.useCallback(
      ({viewableItems}: {viewableItems: any[]}) => {
        if (viewableItems[0]) {
          setActiveTab(viewableItems[0].item.id);
        }
      },
      [],
    );

    const viewabilityConfig = React.useRef({
      itemVisiblePercentThreshold: 90,
      minimumViewTime: 100,
    }).current;

    // If the snapPoints not memoized, the sheet gets closed when the tab is changed for the first time.
    const snapPoints = React.useMemo(() => ['70%'], []);

    return (
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        onClose={onClose}
        enablePanDownToClose
        snapPoints={snapPoints} // Dynamic sizing is not working properly in all situations, like keyboard open/close android/ios ...
        enableDynamicSizing={false}
        backdropComponent={isVisible ? CustomBackdrop : undefined} // on android we need this check to ensure it doenst' block interaction
        backgroundStyle={{
          backgroundColor: theme.colors.background,
        }}
        // Dynamic sizing is not working properly in all situations, like keyboard open/close android/ios ...
        //maxDynamicContentSize={
        //  Dimensions.get('screen').height - insets.top - 16 - keyboardHeight
        //}
        handleIndicatorStyle={{
          backgroundColor: theme.colors.primary,
        }}
        // Add these props to better handle gestures
        enableContentPanningGesture={false}
        enableHandlePanningGesture>
        <BottomSheetView>
          <View style={styles.tabs}>
            {TABS.map((tab, index) => renderTab(tab.id, tab.label, index))}
          </View>
          <BottomSheetFlatList
            ref={flatListRef}
            data={TABS}
            renderItem={renderContent}
            bounces={false}
            showsVerticalScrollIndicator={false}
            keyExtractor={item => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />
        </BottomSheetView>
      </BottomSheet>
    );
  },
);
