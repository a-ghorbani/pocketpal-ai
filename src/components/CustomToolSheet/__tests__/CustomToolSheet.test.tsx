import React from 'react';

import {fireEvent, render, waitFor} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';
import {CUSTOM_TOOL_ERROR_CODES} from '../../../services/customTools/types';
import {customToolStore} from '../../../store';
import {CustomToolSheet} from '../CustomToolSheet';

const storeMock = customToolStore as unknown as {
  addTool: jest.Mock;
  updateTool: jest.Mock;
  setSecrets: jest.Mock;
  getSecretNames: jest.Mock;
};

const renderSheet = (props = {}) =>
  render(<CustomToolSheet isVisible onClose={jest.fn()} {...props} />, {
    withBottomSheetProvider: true,
  });

const fillMinimalTool = (
  utils: ReturnType<typeof renderSheet>,
  url = 'http://127.0.0.1:8765/time',
) => {
  fireEvent.changeText(utils.getByTestId('custom-tool-name'), 'get_time');
  fireEvent.changeText(
    utils.getByTestId('custom-tool-description'),
    'Read the clock',
  );
  fireEvent.changeText(utils.getByTestId('custom-tool-url'), url);
};

describe('CustomToolSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storeMock.getSecretNames.mockResolvedValue([]);
    storeMock.setSecrets.mockResolvedValue(true);
  });

  it('has copy for every validator code, so none can reach the screen raw', () => {
    const errors = l10n.en.components.customToolSheet.errors as Record<
      string,
      string
    >;
    for (const code of CUSTOM_TOOL_ERROR_CODES) {
      expect(typeof errors[code]).toBe('string');
      expect(errors[code].length).toBeGreaterThan(0);
    }
  });

  it('surfaces a rejection as copy rather than a raw code', async () => {
    storeMock.addTool.mockReturnValue({
      ok: false,
      issues: [{code: 'name_builtin', params: {name: 'calculate'}}],
    });

    const utils = renderSheet();
    fillMinimalTool(utils);
    fireEvent.press(utils.getByTestId('custom-tool-save'));

    await waitFor(() => {
      const shown = utils.getByTestId('custom-tool-error-name_builtin');
      expect(shown).toHaveTextContent(/calculate/);
      expect(shown).not.toHaveTextContent(/name_builtin/);
    });
  });

  it('warns for a host that is not loopback, and stays quiet for one that is', () => {
    const utils = renderSheet();

    fillMinimalTool(utils, 'http://192.168.1.10:8765/time');
    expect(utils.getByTestId('custom-tool-non-loopback')).toBeTruthy();

    fireEvent.changeText(
      utils.getByTestId('custom-tool-url'),
      'http://127.0.0.1:8765/time',
    );
    expect(utils.queryByTestId('custom-tool-non-loopback')).toBeNull();
  });

  it('never shows a stored secret value, only that one is set', async () => {
    storeMock.getSecretNames.mockResolvedValue(['API_KEY']);

    const utils = renderSheet({
      tool: {
        id: 'tool-1',
        name: 'get_weather',
        description: 'Weather',
        parameters: {type: 'object', properties: {}},
        request: {
          method: 'GET',
          url: 'https://api.example.com/weather',
          headers: {Authorization: 'Bearer {{secret.API_KEY}}'},
        },
        timeoutMs: 15000,
        requiresConfirmation: true,
      },
    });

    await waitFor(() => {
      expect(utils.getByTestId('custom-tool-secret-API_KEY')).toBeTruthy();
    });
    expect(utils.getByTestId('custom-tool-secret-API_KEY').props.value).toBe(
      '',
    );
    expect(utils.queryByText(/k-12345/)).toBeNull();
  });

  it('refuses to save a secret shorter than four characters', async () => {
    const utils = renderSheet();
    fillMinimalTool(utils);

    fireEvent.press(utils.getByTestId('custom-tool-header-add'));
    fireEvent.changeText(
      utils.getByTestId('custom-tool-header-key-0'),
      'Authorization',
    );
    fireEvent.changeText(
      utils.getByTestId('custom-tool-header-value-0'),
      'Bearer {{secret.K}}',
    );

    await waitFor(() => {
      expect(utils.getByTestId('custom-tool-secret-K')).toBeTruthy();
    });
    fireEvent.changeText(utils.getByTestId('custom-tool-secret-K'), 'abc');

    expect(utils.getByTestId('custom-tool-secret-too-short')).toBeTruthy();

    fireEvent.press(utils.getByTestId('custom-tool-save'));
    await waitFor(() => {
      expect(utils.getByTestId('custom-tool-local-error')).toBeTruthy();
    });
    expect(storeMock.addTool).not.toHaveBeenCalled();
    expect(storeMock.setSecrets).not.toHaveBeenCalled();
  });

  it('writes the definition then the secrets exactly once on a good save', async () => {
    storeMock.addTool.mockReturnValue({
      ok: true,
      value: {id: 'new-1', name: 'get_time'},
    });

    const utils = renderSheet();
    fillMinimalTool(utils);

    fireEvent.press(utils.getByTestId('custom-tool-header-add'));
    fireEvent.changeText(
      utils.getByTestId('custom-tool-header-key-0'),
      'Authorization',
    );
    fireEvent.changeText(
      utils.getByTestId('custom-tool-header-value-0'),
      'Bearer {{secret.K}}',
    );
    await waitFor(() => {
      expect(utils.getByTestId('custom-tool-secret-K')).toBeTruthy();
    });
    fireEvent.changeText(utils.getByTestId('custom-tool-secret-K'), 'abcd1234');

    fireEvent.press(utils.getByTestId('custom-tool-save'));

    await waitFor(() => {
      expect(storeMock.setSecrets).toHaveBeenCalledTimes(1);
    });
    expect(storeMock.addTool).toHaveBeenCalledTimes(1);
    expect(storeMock.setSecrets).toHaveBeenCalledWith('new-1', {K: 'abcd1234'});
  });
});
