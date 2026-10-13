import React from 'react';
import {StyleSheet} from 'react-native';
import {act} from '@testing-library/react-native';
import {useCameraDevice, useCodeScanner} from 'react-native-vision-camera';

import {render, fireEvent} from '../../../../jest/test-utils';
import {themeFixtures} from '../../../../jest/fixtures/theme';
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

  const fireCameraError = (view: ReturnType<typeof render>, code: string) =>
    act(() => view.getByTestId('server-qr-camera').props.onError({code}));

  it.each([
    'code-scanner/not-compatible-with-outputs',
    'permission/camera-permission-denied',
    'device/no-device',
    'system/camera-module-not-found',
  ])('replaces the preview with a message on %s', code => {
    const onClose = jest.fn();
    const view = render(
      <ServerQRScanner onScanned={jest.fn()} onClose={onClose} />,
    );

    fireCameraError(view, code);

    expect(view.getByText(l10n.en.settings.scanQrUnavailable)).toBeTruthy();
    expect(view.queryByTestId('server-qr-camera')).toBeNull();
    fireEvent.press(view.getByTestId('server-qr-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the preview on unknown errors and clears the hint on the next scan', () => {
    const view = render(
      <ServerQRScanner onScanned={jest.fn()} onClose={jest.fn()} />,
    );

    fireCameraError(view, 'unknown/unknown');
    fireCameraError(view, 'unknown/unknown');
    fireCameraError(view, 'unknown/unknown');

    expect(view.getByTestId('server-qr-camera')).toBeTruthy();
    const {colors} = themeFixtures.lightTheme;
    expect(colors.onSurfaceVariant).not.toBe(colors.error);
    expect(
      StyleSheet.flatten(
        view.getByText(l10n.en.settings.scanQrNotReady).props.style,
      ).color,
    ).toBe(colors.onSurfaceVariant);

    scan('hello');

    expect(view.queryByText(l10n.en.settings.scanQrNotReady)).toBeNull();
    expect(view.getByText(l10n.en.settings.scanQrNotServer)).toBeTruthy();
    expect(view.getByTestId('server-qr-camera')).toBeTruthy();
  });

  it('shows the not-ready hint over the not-a-server hint', () => {
    const view = render(
      <ServerQRScanner onScanned={jest.fn()} onClose={jest.fn()} />,
    );

    scan('hello');
    fireCameraError(view, 'unknown/unknown');

    expect(view.getByText(l10n.en.settings.scanQrNotReady)).toBeTruthy();
    expect(view.queryByText(l10n.en.settings.scanQrNotServer)).toBeNull();
  });

  it('still accepts a server url after an unknown error', () => {
    const onScanned = jest.fn();
    const view = render(
      <ServerQRScanner onScanned={onScanned} onClose={jest.fn()} />,
    );

    fireCameraError(view, 'unknown/unknown');
    scan('http://h:1/');

    expect(onScanned).toHaveBeenCalledTimes(1);
    expect(onScanned).toHaveBeenCalledWith('http://h:1/');
  });

  it('still closes after an unknown error', () => {
    const onClose = jest.fn();
    const view = render(
      <ServerQRScanner onScanned={jest.fn()} onClose={onClose} />,
    );

    fireCameraError(view, 'unknown/unknown');
    fireEvent.press(view.getByTestId('server-qr-close'));

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
