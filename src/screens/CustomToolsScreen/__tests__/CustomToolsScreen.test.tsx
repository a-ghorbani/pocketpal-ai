import React from 'react';
import {Alert} from 'react-native';

import {runInAction} from 'mobx';
import {pick} from '@react-native-documents/picker';
import * as RNFS from '@dr.pogodin/react-native-fs';
import Clipboard from '@react-native-clipboard/clipboard';

import {fireEvent, render, waitFor} from '../../../../jest/test-utils';
import {customToolStore} from '../../../store';
import type {CustomToolDefinition} from '../../../services/customTools/types';
import {CustomToolsScreen} from '../CustomToolsScreen';

jest.mock('@dr.pogodin/react-native-fs', () => ({readFile: jest.fn()}));

const storeMock = customToolStore as unknown as {
  tools: CustomToolDefinition[];
  exportTools: jest.Mock;
  importTools: jest.Mock;
  removeTool: jest.Mock;
};

const readFileMock = RNFS.readFile as unknown as jest.Mock;
const pickMock = pick as unknown as jest.Mock;

const tool = (
  overrides: Partial<CustomToolDefinition> = {},
): CustomToolDefinition => ({
  id: 'tool-1',
  name: 'get_time',
  description: 'Read the clock',
  parameters: {type: 'object', properties: {}},
  request: {method: 'GET', url: 'http://127.0.0.1:8765/time'},
  timeoutMs: 15000,
  requiresConfirmation: true,
  ...overrides,
});

const setTools = (tools: CustomToolDefinition[]) =>
  runInAction(() => {
    storeMock.tools = tools;
  });

describe('CustomToolsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setTools([]);
  });

  it('points at the setup guide when there is nothing yet', () => {
    const {getByTestId} = render(<CustomToolsScreen />);
    expect(getByTestId('custom-tools-empty')).toHaveTextContent(
      /docs\/custom-tools\/README\.md/,
    );
  });

  it('lists a tool with its method and host', () => {
    setTools([tool()]);
    const {getByTestId} = render(<CustomToolsScreen />);

    expect(getByTestId('custom-tool-row-tool-1')).toHaveTextContent(/get_time/);
    expect(getByTestId('custom-tool-row-tool-1')).toHaveTextContent(
      /GET 127\.0\.0\.1:8765/,
    );
  });

  it('badges a tool whose name a built-in now claims, so the user can rename it', () => {
    setTools([tool({name: 'calculate'})]);
    const {getByTestId} = render(<CustomToolsScreen />);
    expect(getByTestId('custom-tool-badge-name-conflict-tool-1')).toBeTruthy();
  });

  it('badges an off-device host and a tool that asks for no confirmation', () => {
    setTools([
      tool({
        request: {method: 'GET', url: 'https://api.example.com/weather'},
        requiresConfirmation: false,
      }),
    ]);
    const {getByTestId} = render(<CustomToolsScreen />);

    expect(getByTestId('custom-tool-badge-non-loopback-tool-1')).toBeTruthy();
    expect(
      getByTestId('custom-tool-badge-no-confirmation-tool-1'),
    ).toBeTruthy();
  });

  it('copies an export to the clipboard and says how many went', () => {
    setTools([tool()]);
    storeMock.exportTools.mockReturnValue({
      version: 1,
      tools: [{name: 'get_time'}],
    });

    const {getByTestId} = render(<CustomToolsScreen />);
    fireEvent.press(getByTestId('custom-tools-export'));

    expect(Clipboard.setString).toHaveBeenCalledWith(
      expect.stringContaining('get_time'),
    );
    expect(getByTestId('custom-tools-notice')).toHaveTextContent(/1/);
  });

  it('says there is nothing to export when the list is empty', () => {
    storeMock.exportTools.mockReturnValue({version: 1, tools: []});

    const {getByTestId} = render(<CustomToolsScreen />);
    fireEvent.press(getByTestId('custom-tools-export'));

    expect(Clipboard.setString).not.toHaveBeenCalled();
    expect(getByTestId('custom-tools-notice')).toBeTruthy();
  });

  it('imports the picked file and reports what was skipped', async () => {
    pickMock.mockResolvedValue([{uri: 'file:///tmp/tools.json'}]);
    readFileMock.mockResolvedValue('{"version":1,"tools":[]}');
    storeMock.importTools.mockReturnValue({
      imported: [tool()],
      rejected: [{name: 'calculate', issues: [{code: 'name_builtin'}]}],
    });

    const {getByTestId} = render(<CustomToolsScreen />);
    fireEvent.press(getByTestId('custom-tools-import'));

    await waitFor(() => {
      expect(storeMock.importTools).toHaveBeenCalled();
    });
    expect(readFileMock).toHaveBeenCalledWith('file:///tmp/tools.json', 'utf8');
    expect(getByTestId('custom-tools-notice')).toHaveTextContent(/1/);
  });

  it('reports a file it cannot read instead of throwing', async () => {
    pickMock.mockResolvedValue([{uri: 'file:///tmp/tools.json'}]);
    readFileMock.mockRejectedValue(new Error('nope'));

    const {getByTestId} = render(<CustomToolsScreen />);
    fireEvent.press(getByTestId('custom-tools-import'));

    await waitFor(() => {
      expect(getByTestId('custom-tools-notice')).toBeTruthy();
    });
    expect(storeMock.importTools).not.toHaveBeenCalled();
  });

  it('asks before deleting, and deletes only on confirmation', () => {
    setTools([tool()]);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const {getByTestId} = render(<CustomToolsScreen />);
    fireEvent.press(getByTestId('custom-tool-delete-tool-1'));

    expect(alertSpy).toHaveBeenCalled();
    expect(storeMock.removeTool).not.toHaveBeenCalled();

    const buttons = alertSpy.mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    buttons.find(button => button.onPress)?.onPress?.();
    expect(storeMock.removeTool).toHaveBeenCalledWith('tool-1');

    alertSpy.mockRestore();
  });
});
