import React from 'react';
import {observer} from 'mobx-react-lite';
import {Selector, SelectorOption} from '../Selector';
import {modelStore} from '../../store';
import {Model} from '../../utils/types';

interface ModelSelectorProps {
  value?: Model;
  onChange: (value: Model) => void;
  label: string;
  sublabel?: string;
  placeholder?: string;
  error?: boolean;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  filter?: (model: Model) => boolean;
  testID?: string;
}

export const ModelSelector = observer(
  ({
    value,
    onChange,
    label,
    sublabel,
    placeholder = 'Select model',
    error,
    helperText,
    required,
    disabled,
    filter,
    testID,
  }: ModelSelectorProps) => {
    // Convert models to selector options
    const options: SelectorOption<string>[] = modelStore.availableModels
      .filter(model => (filter ? filter(model) : true))
      .map(model => ({
        label: model.name,
        value: model.id,
      }));

    const handleModelChange = (modelId: string) => {
      const selectedModel = modelStore.availableModels.find(
        model => model.id === modelId,
      );
      if (selectedModel) {
        onChange(selectedModel);
      }
    };

    return (
      <Selector
        options={options}
        value={value?.id || ''}
        onChange={handleModelChange}
        label={label}
        sublabel={sublabel}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        error={error}
        helperText={helperText}
        testID={testID}
      />
    );
  },
);
