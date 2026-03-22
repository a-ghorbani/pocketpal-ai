import React, {useState, useCallback, useMemo, useEffect} from 'react';
import {BackHandler, StyleSheet, TouchableOpacity, View} from 'react-native';

import {observer} from 'mobx-react';
import debounce from 'lodash/debounce';
import {Portal} from 'react-native-paper';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {SearchView} from './SearchView';
import {DetailsView} from './DetailsView';

import {hfStore} from '../../../store';

import {HuggingFaceModel} from '../../../utils/types';
import {Sheet} from '../../../components';
import {CloseIcon} from '../../../assets/icons';
import {useTheme} from '../../../hooks';

interface HFModelSearchProps {
  visible: boolean;
  onDismiss: () => void;
}

const DEBOUNCE_DELAY = 500;

export const HFModelSearch: React.FC<HFModelSearchProps> = observer(
  ({visible, onDismiss}) => {
    const [detailsVisible, setDetailsVisible] = useState(false);
    const [selectedModel, setSelectedModel] = useState<HuggingFaceModel | null>(
      null,
    );
    const insets = useSafeAreaInsets();
    const theme = useTheme();

    const debouncedSearch = useMemo(
      () =>
        debounce(async (query: string) => {
          hfStore.setSearchQuery(query);
          await hfStore.fetchModels();
        }, DEBOUNCE_DELAY),
      [],
    );

    // Clear state when closed.
    useEffect(() => {
      if (!visible) {
        debouncedSearch.cancel();
        setSelectedModel(null);
        setDetailsVisible(false);
      }
    }, [debouncedSearch, visible]);

    // Update search query without triggering immediate search.
    const handleSearchChange = useCallback(
      (query: string) => {
        debouncedSearch(query);
      },
      [debouncedSearch],
    );

    useEffect(() => {
      if (visible) {
        handleSearchChange(hfStore.searchQuery);
      }
    }, [handleSearchChange, visible]);

    const handleModelSelect = async (model: HuggingFaceModel) => {
      setSelectedModel(model);
      setDetailsVisible(true);
      await hfStore.fetchModelData(model.id);
      const updatedModel = hfStore.getModelById(model.id);
      if (updatedModel) {
        setSelectedModel({...updatedModel});
      }
    };

    const handleSheetDismiss = useCallback(() => {
      console.log('Search sheet dismissed, clearing error/loading state');
      debouncedSearch.cancel();
      hfStore.resetLoading();
      hfStore.clearError();
      onDismiss();
    }, [debouncedSearch, onDismiss]);

    // Android back button should close the sheet.
    useEffect(() => {
      if (!visible) {
        return;
      }
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleSheetDismiss();
        return true;
      });
      return () => sub.remove();
    }, [handleSheetDismiss, visible]);

    return (
      <>
        {visible && (
          <Portal>
            <View style={styles.forceCloseOverlay} pointerEvents="box-none">
              <TouchableOpacity
                style={[
                  styles.forceCloseButton,
                  {
                    top: Math.max(insets.top + 20, 36),
                    backgroundColor: theme.colors.background,
                  },
                ]}
                onPress={handleSheetDismiss}
                hitSlop={{top: 20, bottom: 20, left: 20, right: 20}}
                testID="hf-search-force-close-button"
                accessibilityLabel="Force close Hugging Face search"
                accessibilityRole="button">
                <CloseIcon stroke={theme.colors.primary} />
              </TouchableOpacity>
            </View>
          </Portal>
        )}
        <Sheet
          isVisible={visible}
          snapPoints={['92%']}
          enableDynamicSizing={false}
          enablePanDownToClose
          enableContentPanningGesture={false}
          onClose={handleSheetDismiss}
          showCloseButton>
          <SearchView
            testID="hf-model-search-view"
            onModelSelect={handleModelSelect}
            onChangeSearchQuery={handleSearchChange}
          />
        </Sheet>
        <Sheet
          isVisible={detailsVisible}
          snapPoints={['90%']}
          enableDynamicSizing={false}
          enablePanDownToClose
          enableContentPanningGesture={false}
          onClose={() => setDetailsVisible(false)}
          showCloseButton={false}>
          {selectedModel && <DetailsView hfModel={selectedModel} />}
        </Sheet>
      </>
    );
  },
);

const styles = StyleSheet.create({
  forceCloseOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  forceCloseButton: {
    position: 'absolute',
    left: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    elevation: 10000,
  },
});
