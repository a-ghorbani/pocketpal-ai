/**
 * PairServerSheet — scan, verdict, duplicate and camera-less entry.
 *
 * The verdict half is what matters: Add is enabled for both authorisation
 * states of a `usable` server and for no other outcome, and the three
 * credential sentences never claim a check that did not happen.
 */

import React from 'react';
import {runInAction} from 'mobx';
import {
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';

import {render, fireEvent, waitFor, act} from '../../../../jest/test-utils';
import {serverStore} from '../../../store';
import * as openai from '../../../api/openai';
import {PairServerSheet} from '../PairServerSheet';

const mockUseCameraDevice = useCameraDevice as jest.Mock;
const mockUseCameraPermission = useCameraPermission as jest.Mock;
const mockUseCodeScanner = useCodeScanner as jest.Mock;

const QR_PAYLOAD = 'http://192.168.1.5:9931/';

const pressButton = async (root: any, testID: string) => {
  const targets = root.UNSAFE_root.findAll(
    (n: any) =>
      n.props?.testID === testID && typeof n.props?.onPress === 'function',
  );
  expect(targets.length).toBeGreaterThan(0);
  await act(async () => {
    fireEvent.press(targets[0]);
    await Promise.resolve();
  });
};

const keyFieldHasAutoFocus = (root: any) =>
  root.UNSAFE_root.findAll(
    (n: any) => n.props?.testID === 'pair-server-key',
  ).some((n: any) => n.props.autoFocus === true);

const addButton = (root: any) =>
  root.UNSAFE_root.findAll(
    (n: any) =>
      n.props?.testID === 'pair-server-add' &&
      typeof n.props?.onPress === 'function',
  )[0];

/** Deliver a scanned code through whatever handler the sheet registered. */
const scan = async (value: string) => {
  const {onCodeScanned} = mockUseCodeScanner.mock.calls.at(-1)![0];
  await act(async () => {
    onCodeScanned([{value}]);
    await Promise.resolve();
  });
};

describe('PairServerSheet', () => {
  let probeSpy: jest.SpyInstance;
  let requestPermission: jest.Mock;

  /** vision-camera reports only granted/not-granted; everything else is manual. */
  const grantCamera = (granted: boolean) => {
    requestPermission = jest.fn().mockResolvedValue(granted);
    mockUseCameraPermission.mockReturnValue({
      hasPermission: granted,
      requestPermission,
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    grantCamera(true);
    mockUseCameraDevice.mockReturnValue({id: 'back'});
    mockUseCodeScanner.mockImplementation(() => ({}));
    probeSpy = jest.spyOn(openai, 'probePairingTarget');
    runInAction(() => {
      serverStore.servers = [];
    });
  });

  afterEach(() => {
    probeSpy.mockRestore();
  });

  const usable = (
    count: number,
    authorisation: 'authorised' | 'unconfirmed' = 'unconfirmed',
  ) => ({
    outcome: 'usable' as const,
    models: Array.from({length: count}, (_, i) => ({
      id: `m${i}`,
      object: 'model',
      owned_by: 'llamacpp',
    })),
    headers: {},
    serverType: 'llama.cpp',
    authorisation,
  });

  const renderSheet = (props: Record<string, any> = {}) =>
    render(<PairServerSheet isVisible onDismiss={jest.fn()} {...props} />, {
      withNavigation: true,
    });

  describe('the verdict, and what Add does with it', () => {
    it('enables Add for a usable server and shows its model count', async () => {
      probeSpy.mockResolvedValue(usable(3, 'authorised'));
      const root = renderSheet();

      await scan(QR_PAYLOAD);

      await waitFor(() => {
        expect(root.getByTestId('pair-server-models')).toBeTruthy();
      });
      expect(root.getByTestId('pair-server-models').props.children).toContain(
        '3',
      );
      expect(addButton(root).props.disabled).toBe(false);
    });

    it('counts one model in the singular', async () => {
      probeSpy.mockResolvedValue(usable(1, 'authorised'));
      const root = renderSheet();

      await scan(QR_PAYLOAD);

      await waitFor(() => {
        expect(root.getByTestId('pair-server-models')).toBeTruthy();
      });
      expect(root.getByTestId('pair-server-models').props.children).toBe(
        '1 model available',
      );
    });

    it('focuses the key field so a refused key can be corrected', async () => {
      probeSpy.mockResolvedValue({
        outcome: 'unauthorized',
        status: 401,
        source: 'gate',
      });
      const root = renderSheet();

      await scan(QR_PAYLOAD);

      await waitFor(() => {
        expect(root.getByTestId('pair-server-verdict')).toBeTruthy();
      });
      expect(keyFieldHasAutoFocus(root)).toBe(true);
    });

    it('enables Add for a usable server with no models, which is not an error', async () => {
      probeSpy.mockResolvedValue(usable(0));
      const root = renderSheet();

      await scan(QR_PAYLOAD);

      await waitFor(() => {
        expect(root.getByTestId('pair-server-models')).toBeTruthy();
      });
      expect(addButton(root).props.disabled).toBe(false);
    });

    it.each([
      [
        'unauthorized',
        {
          outcome: 'unauthorized' as const,
          status: 401,
          source: 'gate' as const,
        },
      ],
      ['unreadable', {outcome: 'unreadable' as const, status: 200}],
      ['server-error', {outcome: 'server-error' as const, status: 502}],
      ['unreachable', {outcome: 'unreachable' as const}],
    ])(
      'blocks Add on a %s verdict and writes nothing',
      async (_label, result) => {
        probeSpy.mockResolvedValue(result);
        const root = renderSheet();

        await scan(QR_PAYLOAD);

        await waitFor(() => {
          expect(root.getByTestId('pair-server-verdict')).toBeTruthy();
        });
        expect(addButton(root).props.disabled).toBe(true);
        expect(serverStore.addServer).not.toHaveBeenCalled();
      },
    );

    it('keeps an empty list distinguishable from an unreadable response', async () => {
      probeSpy.mockResolvedValue(usable(0));
      const empty = renderSheet();
      await scan(QR_PAYLOAD);
      await waitFor(() => {
        expect(empty.getByTestId('pair-server-models')).toBeTruthy();
      });

      probeSpy.mockResolvedValue({outcome: 'unreadable', status: 200});
      const unreadable = renderSheet();
      await scan(QR_PAYLOAD);
      await waitFor(() => {
        expect(unreadable.getByTestId('pair-server-verdict')).toBeTruthy();
      });

      expect(addButton(empty).props.disabled).toBe(false);
      expect(addButton(unreadable).props.disabled).toBe(true);
    });
  });

  describe('the three credential states', () => {
    const credentialText = async (
      result: any,
      request?: Record<string, any>,
    ) => {
      probeSpy.mockResolvedValue(result);
      const root = renderSheet(request ? {request} : {});
      if (!request) {
        await scan(QR_PAYLOAD);
      }
      await waitFor(() => {
        expect(root.getByTestId('pair-server-credentials')).toBeTruthy();
      });
      return root.getByTestId('pair-server-credentials').props.children;
    };

    it('says the key was accepted only when the control refused it', async () => {
      const text = await credentialText(usable(1, 'authorised'), {
        url: QR_PAYLOAD,
        apiKey: 'sk-x',
      });
      expect(text).toMatch(/accepted/i);
    });

    it('says the key could not be verified when a key is held but unconfirmed', async () => {
      const text = await credentialText(usable(1, 'unconfirmed'), {
        url: QR_PAYLOAD,
        apiKey: 'sk-x',
      });
      expect(text).toMatch(/couldn't be verified/i);
    });

    it('does not invent a key that was never entered', async () => {
      const text = await credentialText(usable(1, 'unconfirmed'));
      expect(text).toMatch(/no api key supplied/i);
      expect(text).not.toMatch(/verified/i);
    });
  });

  describe('duplicates', () => {
    it('offers the saved server and writes nothing when the url matches canonically', async () => {
      runInAction(() => {
        serverStore.servers = [
          {id: 's1', name: 'Studio', url: 'http://192.168.1.5:9931'},
        ];
      });
      const onPaired = jest.fn();
      const root = renderSheet({onPaired});

      // The saved url differs from the scanned one only by a trailing slash.
      await scan(QR_PAYLOAD);

      await waitFor(() => {
        expect(root.getByTestId('pair-server-duplicate')).toBeTruthy();
      });
      expect(probeSpy).not.toHaveBeenCalled();

      await pressButton(root, 'pair-server-use');

      expect(onPaired).toHaveBeenCalledWith('s1');
      expect(serverStore.addServer).not.toHaveBeenCalled();
      expect(serverStore.updateServer).not.toHaveBeenCalled();
      expect(serverStore.setApiKey).not.toHaveBeenCalled();
    });
  });

  describe('camera availability', () => {
    it('asks for camera access when the sheet opens without it', async () => {
      grantCamera(false);
      renderSheet();

      await waitFor(() => {
        expect(requestPermission).toHaveBeenCalled();
      });
    });

    it('never mounts the camera without access, and pairs by hand instead', async () => {
      grantCamera(false);
      probeSpy.mockResolvedValue(usable(2));
      const onPaired = jest.fn();
      const root = renderSheet({onPaired});

      await waitFor(() => {
        expect(root.getByTestId('pair-server-camera-denied')).toBeTruthy();
      });
      expect(root.queryByTestId('pair-server-camera')).toBeNull();
      expect(root.queryByTestId('pair-server-no-camera')).toBeNull();

      await act(async () => {
        fireEvent.changeText(
          root.getByTestId('pair-server-url'),
          'http://192.168.1.5:9931',
        );
      });
      await pressButton(root, 'pair-server-continue');

      await waitFor(() => {
        expect(root.getByTestId('pair-server-models')).toBeTruthy();
      });
      await pressButton(root, 'pair-server-add');

      expect(onPaired).toHaveBeenCalledWith('mock-server-id');
    });

    it('opens on manual entry and still completes a pairing', async () => {
      mockUseCameraDevice.mockReturnValue(undefined);
      probeSpy.mockResolvedValue(usable(2));
      const onPaired = jest.fn();
      const root = renderSheet({onPaired});

      expect(root.getByTestId('pair-server-no-camera')).toBeTruthy();
      expect(root.queryByTestId('pair-server-camera-denied')).toBeNull();

      await act(async () => {
        fireEvent.changeText(
          root.getByTestId('pair-server-url'),
          'http://192.168.1.5:9931/v1',
        );
      });
      await pressButton(root, 'pair-server-continue');

      await waitFor(() => {
        expect(root.getByTestId('pair-server-models')).toBeTruthy();
      });
      await pressButton(root, 'pair-server-add');

      // The sheet hands the parsed url straight to the store, which owns the
      // single canonicalisation site (covered in ServerStore's own tests).
      expect(serverStore.addServer).toHaveBeenCalledWith(
        expect.objectContaining({url: 'http://192.168.1.5:9931/v1'}),
      );
      expect(onPaired).toHaveBeenCalledWith('mock-server-id');
    });
  });

  it('ignores a code that is not a server address and keeps scanning', async () => {
    const root = renderSheet();

    await scan('WIFI:S:home;T:WPA;P:secret;;');

    expect(probeSpy).not.toHaveBeenCalled();
    expect(root.queryByTestId('pair-server-models')).toBeNull();
    expect(serverStore.addServer).not.toHaveBeenCalled();
  });
});
