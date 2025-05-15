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
import {getLocalizedModelCapabilities, L10nContext} from '../../utils';
//import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {CloseIcon} from '../../assets/icons';
import {PalType} from '../PalsSheets/types';

type Tab = 'models' | 'pals';

interface ChatPalModelPickerSheetProps {
  isVisible: boolean;
  chatInputHeight: number;
  onClose: () => void;
  onModelSelect?: (modelId: string) => void;
  onPalSelect?: (palId: string | undefined) => void;
  keyboardHeight: number;
}

export const ChatPalModelPickerSheet = observer(
  ({
    isVisible,
    onClose,
    onModelSelect,
    onPalSelect,
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
          id: 'models' as Tab,
          label: l10n.components.chatPalModelPickerSheet.modelsTab,
        },
        {
          id: 'pals' as Tab,
          label: l10n.components.chatPalModelPickerSheet.palsTab,
        },
      ],
      [
        l10n.components.chatPalModelPickerSheet.modelsTab,
        l10n.components.chatPalModelPickerSheet.palsTab,
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
      (model: (typeof modelStore.availableModels)[0]) => {
        const isActiveModel = model.id === modelStore.activeModelId;
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
              <Text
                style={[
                  styles.itemSubtitle,
                  isActiveModel && styles.activeItemSubtitle,
                ]}>
                {getLocalizedModelCapabilities(model, l10n) ||
                  l10n.components.chatPalModelPickerSheet.noDescription}
              </Text>
            </View>
          </Pressable>
        );
      },
      [styles, l10n, handleModelSelect],
    );

    const palTypeText = React.useCallback(
      (palType: PalType): string => {
        switch (palType) {
          case PalType.ASSISTANT:
            return l10n.components.chatPalModelPickerSheet.assistantType;
          case PalType.ROLEPLAY:
            return l10n.components.chatPalModelPickerSheet.roleplayType;
          case PalType.CAMERA:
            return l10n.components.chatPalModelPickerSheet.cameraType;
          case PalType.VIDEO:
            return l10n.components.chatPalModelPickerSheet.videoType;
          default:
            return '';
        }
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
                {palTypeText(pal.palType)}
              </Text>
            </View>
          </Pressable>
        );
      },
      [
        styles.listItem,
        styles.activeListItem,
        styles.itemContent,
        styles.itemTitle,
        styles.activeItemTitle,
        styles.itemSubtitle,
        styles.activeItemSubtitle,
        palTypeText,
        handlePalSelect,
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
        backdropComponent={CustomBackdrop}
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
