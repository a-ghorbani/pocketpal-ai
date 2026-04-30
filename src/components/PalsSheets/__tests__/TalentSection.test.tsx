import React from 'react';
import {useForm, FormProvider} from 'react-hook-form';

import {fireEvent, render, waitFor} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';
import {L10nContext} from '../../../utils';
import {TalentSection} from '../TalentSection';
import type {PalFormData} from '../types';
import {
  talentRegistry,
  registerDefaultTalents,
  resetRegisteredFlag,
} from '../../../services/talents';

// Wrapper that provides FormProvider with react-hook-form context
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
      talents: [],
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

describe('TalentSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure talents are registered for each test
    talentRegistry.reset();
    resetRegisteredFlag();
    registerDefaultTalents();
  });

  afterAll(() => {
    talentRegistry.reset();
    resetRegisteredFlag();
  });

  describe('Rendering', () => {
    it('renders the talent section container', () => {
      const {getByTestId} = render(
        <FormWrapper>
          <TalentSection />
        </FormWrapper>,
      );

      expect(getByTestId('talent-section')).toBeTruthy();
    });

    it('renders all 3 talent switches (render_html, calculate, datetime)', () => {
      const {getByTestId} = render(
        <FormWrapper>
          <TalentSection />
        </FormWrapper>,
      );

      expect(getByTestId('talent-switch-render_html')).toBeTruthy();
      expect(getByTestId('talent-switch-calculate')).toBeTruthy();
      expect(getByTestId('talent-switch-datetime')).toBeTruthy();
    });

    it('renders talent item containers for each talent', () => {
      const {getByTestId} = render(
        <FormWrapper>
          <TalentSection />
        </FormWrapper>,
      );

      expect(getByTestId('talent-item-render_html')).toBeTruthy();
      expect(getByTestId('talent-item-calculate')).toBeTruthy();
      expect(getByTestId('talent-item-datetime')).toBeTruthy();
    });

    it('renders talent names as text', () => {
      const {getByText} = render(
        <FormWrapper>
          <TalentSection />
        </FormWrapper>,
      );

      expect(getByText('render_html')).toBeTruthy();
      expect(getByText('calculate')).toBeTruthy();
      expect(getByText('datetime')).toBeTruthy();
    });

    it('renders talent descriptions from l10n', () => {
      const {getByText} = render(
        <FormWrapper>
          <TalentSection />
        </FormWrapper>,
      );

      const descriptions = l10n.en.components.palSheet.talentDescriptions;
      expect(getByText(descriptions.render_html)).toBeTruthy();
      expect(getByText(descriptions.calculate)).toBeTruthy();
      expect(getByText(descriptions.datetime)).toBeTruthy();
    });

    it('renders the section divider with "Talents" label', () => {
      const {getByText} = render(
        <FormWrapper>
          <TalentSection />
        </FormWrapper>,
      );

      expect(getByText(l10n.en.components.palSheet.talents)).toBeTruthy();
    });
  });

  describe('Switch toggling', () => {
    it('toggling a switch on adds the talent name to form value', async () => {
      let getFormValues: () => PalFormData;

      const {getByTestId} = render(
        <FormWrapper
          onFormValues={getValues => {
            getFormValues = getValues;
          }}>
          <TalentSection />
        </FormWrapper>,
      );

      // All switches should start off
      expect(getFormValues!().talents).toEqual([]);

      // Toggle calculate on
      fireEvent(getByTestId('talent-switch-calculate'), 'valueChange', true);

      await waitFor(() => {
        expect(getFormValues!().talents).toContain('calculate');
      });
    });

    it('toggling a switch off removes the talent name from form value', async () => {
      let getFormValues: () => PalFormData;

      const {getByTestId} = render(
        <FormWrapper
          defaultValues={{talents: ['calculate', 'datetime']}}
          onFormValues={getValues => {
            getFormValues = getValues;
          }}>
          <TalentSection />
        </FormWrapper>,
      );

      // Verify initial state
      expect(getFormValues!().talents).toContain('calculate');
      expect(getFormValues!().talents).toContain('datetime');

      // Toggle calculate off
      fireEvent(getByTestId('talent-switch-calculate'), 'valueChange', false);

      await waitFor(() => {
        const talents = getFormValues!().talents;
        expect(talents).not.toContain('calculate');
        expect(talents).toContain('datetime');
      });
    });

    it('toggling multiple switches on accumulates talent names', async () => {
      let getFormValues: () => PalFormData;

      const {getByTestId} = render(
        <FormWrapper
          onFormValues={getValues => {
            getFormValues = getValues;
          }}>
          <TalentSection />
        </FormWrapper>,
      );

      fireEvent(getByTestId('talent-switch-render_html'), 'valueChange', true);

      await waitFor(() => {
        expect(getFormValues!().talents).toContain('render_html');
      });

      fireEvent(getByTestId('talent-switch-calculate'), 'valueChange', true);

      await waitFor(() => {
        const talents = getFormValues!().talents;
        expect(talents).toContain('render_html');
        expect(talents).toContain('calculate');
      });
    });
  });

  describe('Pre-selected talents', () => {
    it('pre-selected talents from form default values show as enabled', () => {
      const {getByTestId} = render(
        <FormWrapper defaultValues={{talents: ['calculate', 'datetime']}}>
          <TalentSection />
        </FormWrapper>,
      );

      // calculate and datetime should be on
      expect(getByTestId('talent-switch-calculate').props.value).toBe(true);
      expect(getByTestId('talent-switch-datetime').props.value).toBe(true);

      // render_html should be off
      expect(getByTestId('talent-switch-render_html').props.value).toBe(false);
    });

    it('all talents pre-selected shows all switches as enabled', () => {
      const {getByTestId} = render(
        <FormWrapper
          defaultValues={{
            talents: ['render_html', 'calculate', 'datetime'],
          }}>
          <TalentSection />
        </FormWrapper>,
      );

      expect(getByTestId('talent-switch-render_html').props.value).toBe(true);
      expect(getByTestId('talent-switch-calculate').props.value).toBe(true);
      expect(getByTestId('talent-switch-datetime').props.value).toBe(true);
    });

    it('no pre-selected talents shows all switches as disabled', () => {
      const {getByTestId} = render(
        <FormWrapper defaultValues={{talents: []}}>
          <TalentSection />
        </FormWrapper>,
      );

      expect(getByTestId('talent-switch-render_html').props.value).toBe(false);
      expect(getByTestId('talent-switch-calculate').props.value).toBe(false);
      expect(getByTestId('talent-switch-datetime').props.value).toBe(false);
    });
  });
});
