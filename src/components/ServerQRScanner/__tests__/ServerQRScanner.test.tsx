import React from 'react';
import {act} from '@testing-library/react-native';
import {useCameraDevice, useCodeScanner} from 'react-native-vision-camera';

import {render, fireEvent} from '../../../../jest/test-utils';
import {
  URL_IMPLEMENTATIONS,
  expectUrlImplementationActive,
  useUrlImplementation,
} from '../../../../jest/urlImplementations';
import {l10n} from '../../../locales';
import {ServerQRScanner} from '../ServerQRScanner';

const scan = (...values: Array<string | undefined>) => {
  const {onCodeScanned} = (useCodeScanner as jest.Mock).mock.calls.at(-1)[0];
  act(() => onCodeScanned(values.map(value => ({type: 'qr', value}))));
};

describe('ServerQRScanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('scans qr codes only', () => {
    render(<ServerQRScanner onScanned={jest.fn()} onClose={jest.fn()} />);

    expect(useCodeScanner).toHaveBeenCalledWith(
      expect.objectContaining({codeTypes: ['qr']}),
    );
  });

  it('passes the server url on verbatim, keeping its trailing slash', () => {
    const onScanned = jest.fn();
    render(<ServerQRScanner onScanned={onScanned} onClose={jest.fn()} />);

    scan('http://192.168.1.5:9931/');

    expect(onScanned).toHaveBeenCalledWith('http://192.168.1.5:9931/');
  });

  it('shows a hint and keeps scanning for payloads that are not server urls', () => {
    const onScanned = jest.fn();
    const {getByTestId, queryByText, getByText} = render(
      <ServerQRScanner onScanned={onScanned} onClose={jest.fn()} />,
    );
    expect(queryByText(l10n.en.settings.scanQrNotServer)).toBeNull();

    scan('WIFI:S:home;T:WPA;P:x;;');
    scan('ftp://h/');

    expect(getByText(l10n.en.settings.scanQrNotServer)).toBeTruthy();
    expect(getByTestId('server-qr-camera')).toBeTruthy();
    expect(onScanned).not.toHaveBeenCalled();
  });

  it('accepts the first server url in a frame, once per mount', () => {
    const onScanned = jest.fn();
    render(<ServerQRScanner onScanned={onScanned} onClose={jest.fn()} />);

    scan('hello', 'http://h:1/', 'http://h:2/');
    scan('hello', 'http://h:1/', 'http://h:2/');

    expect(onScanned).toHaveBeenCalledTimes(1);
    expect(onScanned).toHaveBeenCalledWith('http://h:1/');
  });

  it('trims surrounding whitespace before judging a payload', () => {
    const onScanned = jest.fn();
    render(<ServerQRScanner onScanned={onScanned} onClose={jest.fn()} />);

    scan(undefined, '  https://host:8080/ \n');

    expect(onScanned).toHaveBeenCalledWith('https://host:8080/');
  });

  it('shows the no-camera message and a close button without a device', () => {
    (useCameraDevice as jest.Mock).mockReturnValueOnce(undefined);
    const onClose = jest.fn();
    const {getByText, getByTestId, queryByTestId} = render(
      <ServerQRScanner onScanned={jest.fn()} onClose={onClose} />,
    );

    expect(getByText(l10n.en.camera.noDevice)).toBeTruthy();
    expect(queryByTestId('server-qr-camera')).toBeNull();
    fireEvent.press(getByTestId('server-qr-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('replaces the preview with a message when the camera fails', () => {
    const onClose = jest.fn();
    const {getByText, getByTestId, queryByTestId} = render(
      <ServerQRScanner onScanned={jest.fn()} onClose={onClose} />,
    );

    act(() =>
      getByTestId('server-qr-camera').props.onError({
        code: 'code-scanner/cannot-load-model',
      }),
    );

    expect(getByText(l10n.en.settings.scanQrUnavailable)).toBeTruthy();
    expect(queryByTestId('server-qr-camera')).toBeNull();
    fireEvent.press(getByTestId('server-qr-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the camera view', () => {
    const onClose = jest.fn();
    const {getByTestId} = render(
      <ServerQRScanner onScanned={jest.fn()} onClose={onClose} />,
    );

    fireEvent.press(getByTestId('server-qr-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('accepts a server url after rejecting an earlier payload', () => {
    const onScanned = jest.fn();
    render(<ServerQRScanner onScanned={onScanned} onClose={jest.fn()} />);

    scan('WIFI:S:home;T:WPA;P:x;;');
    scan('http://h:9931/');

    expect(onScanned).toHaveBeenCalledTimes(1);
    expect(onScanned).toHaveBeenCalledWith('http://h:9931/');
  });

  it('accepts again after a remount', () => {
    const onScanned = jest.fn();
    const first = render(
      <ServerQRScanner onScanned={onScanned} onClose={jest.fn()} />,
    );
    scan('http://h:1/');
    first.unmount();

    render(<ServerQRScanner onScanned={onScanned} onClose={jest.fn()} />);
    scan('http://h:2/');

    expect(onScanned.mock.calls).toEqual([['http://h:1/'], ['http://h:2/']]);
  });

  describe.each(URL_IMPLEMENTATIONS)('payloads under the %s', (_name, impl) => {
    useUrlImplementation(impl);

    it.each([
      'http://192.168.1.5:9931/',
      'http://h:8080',
      'https://my-server.local/v1',
      'http://[::1]:8080/',
    ])('accepts %s', payload => {
      expectUrlImplementationActive(impl);
      const onScanned = jest.fn();
      render(<ServerQRScanner onScanned={onScanned} onClose={jest.fn()} />);

      scan(payload);

      expect(onScanned).toHaveBeenCalledWith(payload);
    });

    it.each([
      'hello',
      'ftp://h/',
      'WIFI:S:home;T:WPA;P:x;;',
      'mailto:a@b.c',
      'file:///etc/hosts',
      'http://',
      '192.168.1.5:9931',
      '',
    ])('rejects %p', payload => {
      expectUrlImplementationActive(impl);
      const onScanned = jest.fn();
      const {getByText} = render(
        <ServerQRScanner onScanned={onScanned} onClose={jest.fn()} />,
      );

      scan(payload);

      expect(onScanned).not.toHaveBeenCalled();
      expect(getByText(l10n.en.settings.scanQrNotServer)).toBeTruthy();
    });
  });
});
