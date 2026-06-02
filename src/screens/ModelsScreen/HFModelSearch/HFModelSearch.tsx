import React, {useState, useCallback, useMemo, useEffect} from 'react';

import {observer} from 'mobx-react';
import debounce from 'lodash/debounce';

import {SearchView} from './SearchView';
import {DetailsView} from './DetailsView';

import {hfStore} from '../../../store';

import {HuggingFaceModel} from '../../../utils/types';
import {Sheet} from '../../../components';

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
    const latestModelSelection = React.useRef(0);

    // Clear state when closed
    useEffect(() => {
      if (!visible) {
        setSelectedModel(null);
        setDetailsVisible(false);
      }
    }, [visible]);

    const debouncedSearch = useMemo(
      () =>
        debounce(async (query: string) => {
          await hfStore.fetchModels();
        }, DEBOUNCE_DELAY),
      [], // Empty dependencies since we don't want to recreate this
    );

    useEffect(() => {
      if (!visible) {
        return;
      }
      debouncedSearch.cancel();
      setSelectedModel(null);
      setDetailsVisible(false);
    }, [debouncedSearch, hfStore.selectedSource, visible]);

    // Update search query without triggering immediate search
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

    useEffect(
      () => () => {
        debouncedSearch.cancel();
      },
      [debouncedSearch],
    );

    const handleModelSelect = async (model: HuggingFaceModel) => {
      const selectionId = latestModelSelection.current + 1;
      latestModelSelection.current = selectionId;
      setSelectedModel(model);
      setDetailsVisible(true);
      await hfStore.fetchModelData(model.id);
      if (selectionId !== latestModelSelection.current) {
        return;
      }
      const updatedModel = hfStore.getModelById(model.id);
      if (updatedModel) {
        setSelectedModel({...updatedModel});
      }
    };

    const handleSheetDismiss = () => {
      console.log('Search sheet dismissed, clearing error state');
      // Clear error state when the sheet is closed
      hfStore.clearError();
      onDismiss();
    };

    return (
      <>
        <Sheet
          isVisible={visible}
          snapPoints={['92%']}
          enableDynamicSizing={false}
          enablePanDownToClose
          enableContentPanningGesture={false} // Prevent gesture conflicts with FlatList scroll (Android)
          onClose={handleSheetDismiss}
          showCloseButton={true}>
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
          enableContentPanningGesture={false} // Prevent gesture conflicts with FlatList scroll (Android)
          onClose={() => setDetailsVisible(false)}
          showCloseButton={false}>
          {selectedModel && <DetailsView hfModel={selectedModel} />}
        </Sheet>
      </>
    );
  },
);
