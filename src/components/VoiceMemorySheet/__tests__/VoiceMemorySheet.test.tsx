import React from 'react';

import {fireEvent, render} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';
import type {VoiceMemoryFit} from '../../../services/voice';

import {VoiceMemorySheet} from '../VoiceMemorySheet';

jest.mock('../../Sheet', () => {
  const {Text, View} = require('react-native');
  const Sheet: any = ({children, isVisible, title}: any) =>
    isVisible ? (
      <View>
        <Text>{title}</Text>
        {children}
      </View>
    ) : null;
  Sheet.ScrollView = ({children, testID}: any) => (
    <View testID={testID}>{children}</View>
  );
  return {Sheet};
});

const strings = l10n.en.voiceMode;
const breakdown = {
  rows: [
    {kind: 'chat' as const, bytes: 2.9e9},
    {kind: 'stt' as const, bytes: 0.33e9},
    {kind: 'tts' as const, bytes: 0.5e9},
  ],
  neededBytes: 3.73e9,
  totalBytes: 7.4e9,
};
const onContinue = jest.fn();
const onChooseSmallerModel = jest.fn();

const renderSheet = (fit: VoiceMemoryFit | null) =>
  render(
    <VoiceMemorySheet
      fit={fit}
      chatModelName="Gemma"
      voiceName="Supertonic"
      onClose={jest.fn()}
      onContinue={onContinue}
      onChooseSmallerModel={onChooseSmallerModel}
    />,
  );

describe('VoiceMemorySheet', () => {
  it('when tight, shows the three models, needed vs total RAM and both actions', () => {
    const {getByText, getByTestId} = renderSheet({
      status: 'tight',
      sttTier: 'base',
      breakdown,
    });

    expect(getByText(strings.memoryTightTitle)).toBeTruthy();
    expect(getByText(strings.memoryTightBody)).toBeTruthy();
    expect(getByText('Chat model · Gemma')).toBeTruthy();
    expect(getByText('Speech recognition · Whisper Base')).toBeTruthy();
    expect(getByText('Voice · Supertonic')).toBeTruthy();
    expect(getByTestId('voice-memory-needed')).toHaveTextContent(
      /3\.7 GB of 8 GB on this phone/,
    );

    fireEvent.press(getByTestId('voice-memory-continue'));
    fireEvent.press(getByTestId('voice-memory-smaller-model'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onChooseSmallerModel).toHaveBeenCalledTimes(1);
  });

  it("when it won't fit, offers no Continue anyway", () => {
    const {getByText, queryByText, queryByTestId, getByTestId} = renderSheet({
      status: 'wont_fit',
      sttTier: 'base',
      breakdown: {...breakdown, neededBytes: 9e9},
    });

    expect(getByText(strings.memoryWontFitTitle)).toBeTruthy();
    expect(getByText(strings.memoryWontFitBody)).toBeTruthy();
    expect(queryByText(strings.memoryTightBody)).toBeNull();
    expect(getByTestId('voice-memory-needed')).toHaveTextContent(
      /9 GB of 8 GB on this phone/,
    );
    expect(queryByTestId('voice-memory-continue')).toBeNull();
    expect(getByTestId('voice-memory-smaller-model')).toBeTruthy();
  });

  it("when it won't fit but needs no more than the shown total, shows only the needed figure", () => {
    const {getByTestId} = renderSheet({
      status: 'wont_fit',
      sttTier: 'base',
      breakdown: {...breakdown, neededBytes: 7.6e9},
    });
    expect(getByTestId('voice-memory-needed')).toHaveTextContent(
      /^Needed7\.6 GB$/,
    );
  });

  it('when tight but needing more than the shown total, shows only the needed figure', () => {
    const {getByTestId} = renderSheet({
      status: 'tight',
      sttTier: 'base',
      breakdown: {...breakdown, neededBytes: 12.05e9, totalBytes: 12.1e9},
    });
    expect(getByTestId('voice-memory-needed')).toHaveTextContent(
      /^Needed12\.1 GB$/,
    );
  });

  it('shows only the rows the fit counts', () => {
    const {queryByText, getByTestId, getByText} = renderSheet({
      status: 'tight',
      sttTier: 'base',
      breakdown: {
        rows: [
          {kind: 'stt', bytes: 0.4e9},
          {kind: 'tts', bytes: 0.6e9},
        ],
        neededBytes: 1e9,
        totalBytes: 4e9,
      },
    });

    expect(queryByText('Chat model · Gemma')).toBeNull();
    expect(getByText('Speech recognition · Whisper Base')).toBeTruthy();
    expect(getByTestId('voice-memory-tts')).toHaveTextContent(/600 MB/);
    expect(getByTestId('voice-memory-needed')).toHaveTextContent(
      /1 GB of 4 GB on this phone/,
    );
  });

  it('shows only the needed figure when total RAM is unknown', () => {
    const {getByTestId} = renderSheet({
      status: 'tight',
      sttTier: 'base',
      breakdown: {...breakdown, totalBytes: Infinity},
    });
    expect(getByTestId('voice-memory-needed')).toHaveTextContent(
      /^Needed3\.7 GB$/,
    );
  });

  it('names the Whisper tier the fit counted', () => {
    const {getByText} = renderSheet({
      status: 'tight',
      sttTier: 'small',
      breakdown,
    });
    expect(getByText('Speech recognition · Whisper Small')).toBeTruthy();
  });

  it('is hidden without a fit to show', () => {
    const {queryByTestId} = renderSheet(null);
    expect(queryByTestId('voice-memory-sheet')).toBeNull();
  });
});
