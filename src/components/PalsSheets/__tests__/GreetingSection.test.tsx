import React from 'react';
import {useForm, FormProvider} from 'react-hook-form';

import {fireEvent, render, waitFor} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';
import {L10nContext} from '../../../utils';
import {GreetingSection} from '../GreetingSection';
import type {PalFormData} from '../types';

const FormWrapper = ({
  defaultValues,
  children,
  onFormValues,
}: {
  defaultValues?: Partial<PalFormData>;
  children: React.ReactNode;
  onFormValues?: (getValues: () => PalFormData) => void;
}) => {
  const methods = useForm<PalFormData>({
    defaultValues: {
      name: '',
      useAIPrompt: false,
      systemPrompt: '',
      isSystemPromptChanged: false,
      greetingText: '',
      suggestedPrompts: [],
      ...defaultValues,
    },
  });

  React.useEffect(() => {
    if (onFormValues) {
      onFormValues(methods.getValues as () => PalFormData);
    }
  }, [methods, onFormValues]);

  return (
    <L10nContext.Provider value={l10n.en}>
      <FormProvider {...methods}>{children}</FormProvider>
    </L10nContext.Provider>
  );
};

describe('GreetingSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the greeting section container', () => {
      const {getByTestId} = render(
        <FormWrapper>
          <GreetingSection />
        </FormWrapper>,
      );

      expect(getByTestId('greeting-section')).toBeTruthy();
    });

    it('renders the greeting text input', () => {
      const {getByTestId} = render(
        <FormWrapper>
          <GreetingSection />
        </FormWrapper>,
      );

      expect(getByTestId('form-field-greetingText')).toBeTruthy();
    });

    it('renders the add-prompt button', () => {
      const {getByTestId} = render(
        <FormWrapper>
          <GreetingSection />
        </FormWrapper>,
      );

      expect(getByTestId('suggested-prompt-add-button')).toBeTruthy();
    });

    it('renders the section labels from l10n', () => {
      const {getByText} = render(
        <FormWrapper>
          <GreetingSection />
        </FormWrapper>,
      );

      const labels = l10n.en.components.palSheet.greeting;
      expect(getByText(labels.sectionLabel)).toBeTruthy();
      expect(getByText(labels.textLabel)).toBeTruthy();
      expect(getByText(labels.suggestedPromptsLabel)).toBeTruthy();
    });
  });

  describe('Initial state from default values', () => {
    it('pre-seeds greetingText into the input', () => {
      const {getByTestId} = render(
        <FormWrapper defaultValues={{greetingText: 'Hello there'}}>
          <GreetingSection />
        </FormWrapper>,
      );

      expect(getByTestId('form-field-greetingText').props.value).toBe(
        'Hello there',
      );
    });

    it('pre-seeds suggestedPrompts as N rows with correct values', () => {
      const {getByTestId} = render(
        <FormWrapper
          defaultValues={{suggestedPrompts: ['First prompt', 'Second prompt']}}>
          <GreetingSection />
        </FormWrapper>,
      );

      expect(getByTestId('suggested-prompt-input-0').props.value).toBe(
        'First prompt',
      );
      expect(getByTestId('suggested-prompt-input-1').props.value).toBe(
        'Second prompt',
      );
      expect(getByTestId('suggested-prompt-remove-0')).toBeTruthy();
      expect(getByTestId('suggested-prompt-remove-1')).toBeTruthy();
    });

    it('renders no prompt rows when suggestedPrompts is empty', () => {
      const {queryByTestId} = render(
        <FormWrapper defaultValues={{suggestedPrompts: []}}>
          <GreetingSection />
        </FormWrapper>,
      );

      expect(queryByTestId('suggested-prompt-input-0')).toBeNull();
    });
  });

  describe('User interactions', () => {
    it('typing in greetingText updates form state', async () => {
      let getFormValues: () => PalFormData;

      const {getByTestId} = render(
        <FormWrapper
          onFormValues={getValues => {
            getFormValues = getValues;
          }}>
          <GreetingSection />
        </FormWrapper>,
      );

      fireEvent.changeText(
        getByTestId('form-field-greetingText'),
        'Hi from a friendly pal',
      );

      await waitFor(() => {
        expect(getFormValues!().greetingText).toBe('Hi from a friendly pal');
      });
    });

    it('tapping add-prompt appends an empty row', async () => {
      let getFormValues: () => PalFormData;

      const {getByTestId} = render(
        <FormWrapper
          onFormValues={getValues => {
            getFormValues = getValues;
          }}>
          <GreetingSection />
        </FormWrapper>,
      );

      expect(getFormValues!().suggestedPrompts).toEqual([]);

      fireEvent.press(getByTestId('suggested-prompt-add-button'));

      await waitFor(() => {
        expect(getFormValues!().suggestedPrompts).toEqual(['']);
      });
    });

    it('editing a prompt row updates that index in form state', async () => {
      let getFormValues: () => PalFormData;

      const {getByTestId} = render(
        <FormWrapper
          defaultValues={{suggestedPrompts: ['original']}}
          onFormValues={getValues => {
            getFormValues = getValues;
          }}>
          <GreetingSection />
        </FormWrapper>,
      );

      fireEvent.changeText(
        getByTestId('suggested-prompt-input-0'),
        'edited prompt',
      );

      await waitFor(() => {
        expect(getFormValues!().suggestedPrompts).toEqual(['edited prompt']);
      });
    });

    it('removing a prompt row drops that row and re-indexes the rest', async () => {
      let getFormValues: () => PalFormData;

      const {getByTestId, queryByTestId} = render(
        <FormWrapper
          defaultValues={{suggestedPrompts: ['a', 'b', 'c']}}
          onFormValues={getValues => {
            getFormValues = getValues;
          }}>
          <GreetingSection />
        </FormWrapper>,
      );

      // Remove index 1 ('b')
      fireEvent.press(getByTestId('suggested-prompt-remove-1'));

      await waitFor(() => {
        expect(getFormValues!().suggestedPrompts).toEqual(['a', 'c']);
      });

      // After removal, only two rows remain: 0='a', 1='c'
      expect(getByTestId('suggested-prompt-input-0').props.value).toBe('a');
      expect(getByTestId('suggested-prompt-input-1').props.value).toBe('c');
      expect(queryByTestId('suggested-prompt-input-2')).toBeNull();
    });

    it('does not trim or filter on typing — whitespace stays in form state', async () => {
      let getFormValues: () => PalFormData;

      const {getByTestId} = render(
        <FormWrapper
          defaultValues={{suggestedPrompts: ['']}}
          onFormValues={getValues => {
            getFormValues = getValues;
          }}>
          <GreetingSection />
        </FormWrapper>,
      );

      fireEvent.changeText(getByTestId('suggested-prompt-input-0'), '  ');

      await waitFor(() => {
        expect(getFormValues!().suggestedPrompts).toEqual(['  ']);
      });
    });
  });
});
