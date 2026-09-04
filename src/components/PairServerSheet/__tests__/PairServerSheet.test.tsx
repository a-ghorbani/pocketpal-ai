/**
 * PairServerSheet — scan, verdict, duplicate and camera-less entry.
 *
 * The verdict half is what matters: Add is enabled for both authorisation
 * states of a `usable` server and for no other outcome, and the three
 * credential sentences never claim a check that did not happen.
 *
 * Probes are driven by promises the test resolves by hand. A stub that
 * resolves on its own settles inside the same drain as the event under test,
 * which erases the in-flight window several of these assertions live in.
 */

import React from 'react';
import {runInAction} from 'mobx';
import {StyleSheet, TextInput as RNTextInput} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';

import {render, fireEvent, waitFor, act} from '../../../../jest/test-utils';
import {serverStore} from '../../../store';
import * as openai from '../../../api/openai';
import type {PairingProbeResult} from '../../../api/openai';
import {Sheet} from '../../Sheet';
import {PairServerSheet} from '../PairServerSheet';

const mockUseCameraDevice = useCameraDevice as jest.Mock;
const mockUseCameraPermission = useCameraPermission as jest.Mock;
const mockUseCodeScanner = useCodeScanner as jest.Mock;

const focusMock = (RNTextInput as any).prototype.focus as jest.Mock;

const QR_PAYLOAD = 'http://192.168.1.5:9931/';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return {promise, resolve};
};

/** Let a probe answer, and let the render it causes flush. */
const settle = async (
  probe: Deferred<PairingProbeResult>,
  result: PairingProbeResult,
) => {
  await act(async () => {
    probe.resolve(result);
    await Promise.resolve();
    await Promise.resolve();
  });
};

/** The pressable node behind `testID`, of the several a Button renders. */
const control = (root: any, testID: string) =>
  root.UNSAFE_root.findAll(
    (n: any) =>
      n.props?.testID === testID && typeof n.props?.onPress === 'function',
  )[0];

const pressButton = async (root: any, testID: string) => {
  const target = control(root, testID);
  expect(target).toBeTruthy();
  await act(async () => {
    fireEvent.press(target);
    await Promise.resolve();
  });
};

const keyField = (root: any) =>
  root.UNSAFE_root.findAll((n: any) => n.props?.testID === 'pair-server-key');

const addButton = (root: any) => control(root, 'pair-server-add');

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
  ): PairingProbeResult => ({
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

  const refused: PairingProbeResult = {
    outcome: 'unauthorized',
    status: 401,
    source: 'gate',
  };

  /** Queue the next probe's answer, under the test's control. */
  const nextProbe = () => {
    const probe = deferred<PairingProbeResult>();
    probeSpy.mockReturnValueOnce(probe.promise);
    return probe;
  };

  const renderSheet = (props: Record<string, any> = {}) =>
    render(<PairServerSheet isVisible onDismiss={jest.fn()} {...props} />, {
      withNavigation: true,
    });

  describe('the verdict, and what Add does with it', () => {
    it('enables Add for a usable server and shows its model count', async () => {
      const probe = nextProbe();
      const root = renderSheet();

      await scan(QR_PAYLOAD);
      expect(addButton(root).props.disabled).toBe(false);
      await settle(probe, usable(3, 'authorised'));

      expect(root.getByTestId('pair-server-models').props.children).toContain(
        '3',
      );
      expect(addButton(root).props.disabled).toBe(false);
    });

    it('counts one model in the singular', async () => {
      const probe = nextProbe();
      const root = renderSheet();

      await scan(QR_PAYLOAD);
      await settle(probe, usable(1, 'authorised'));

      expect(root.getByTestId('pair-server-models').props.children).toBe(
        '1 model available',
      );
    });

    it('shows the address being trusted, unobscured by the keyboard', async () => {
      const probe = nextProbe();
      const root = renderSheet({request: {url: QR_PAYLOAD}});

      expect(root.getByTestId('pair-server-url-label').props.children).toBe(
        QR_PAYLOAD,
      );
      expect(root.getByTestId('pair-server-trust')).toBeTruthy();
      expect(keyField(root).some((n: any) => n.props.autoFocus === true)).toBe(
        false,
      );
      expect(focusMock).not.toHaveBeenCalled();

      await settle(probe, usable(1));
    });

    it('focuses the key field so a refused key can be corrected', async () => {
      const probe = nextProbe();
      const root = renderSheet();

      await scan(QR_PAYLOAD);
      await settle(probe, refused);

      expect(root.getByTestId('pair-server-verdict')).toBeTruthy();
      expect(focusMock).toHaveBeenCalled();
    });

    it('adds the server on the first press of Add', async () => {
      const probe = nextProbe();
      const onPaired = jest.fn();
      const root = renderSheet({
        request: {url: QR_PAYLOAD, apiKey: 'sk-x'},
        onPaired,
      });
      await settle(probe, usable(2, 'authorised'));

      // The press that reaches Add blurs the key field first.
      await act(async () => {
        fireEvent(root.getByTestId('pair-server-key'), 'blur');
      });
      await act(async () => {
        fireEvent.press(root.getByTestId('pair-server-add'));
        await Promise.resolve();
      });

      expect(serverStore.addServer).toHaveBeenCalledTimes(1);
      expect(onPaired).toHaveBeenCalledWith('mock-server-id');
      expect(probeSpy).toHaveBeenCalledTimes(1);
    });

    it('adds the server on the first press of Add after a key is typed', async () => {
      const opening = nextProbe();
      const onPaired = jest.fn();
      const root = renderSheet({request: {url: QR_PAYLOAD}, onPaired});
      await settle(opening, usable(2));

      await act(async () => {
        fireEvent.changeText(root.getByTestId('pair-server-key'), 'sk-typed');
      });

      const recheck = nextProbe();
      // The press blurs the field it is leaving, then lands on Add.
      await act(async () => {
        fireEvent(root.getByTestId('pair-server-key'), 'blur');
      });
      await act(async () => {
        fireEvent.press(root.getByTestId('pair-server-add'));
        await Promise.resolve();
      });

      expect(probeSpy).toHaveBeenLastCalledWith(QR_PAYLOAD, {
        apiKey: 'sk-typed',
      });
      expect(serverStore.addServer).not.toHaveBeenCalled();

      await settle(recheck, usable(2, 'authorised'));

      expect(serverStore.addServer).toHaveBeenCalledTimes(1);
      expect(serverStore.setApiKey).toHaveBeenCalledWith(
        'mock-server-id',
        'sk-typed',
      );
      expect(onPaired).toHaveBeenCalledWith('mock-server-id');
    });

    it('saves nothing when the re-check with the typed key is refused', async () => {
      const opening = nextProbe();
      const root = renderSheet({request: {url: QR_PAYLOAD}});
      await settle(opening, usable(2));

      await act(async () => {
        fireEvent.changeText(root.getByTestId('pair-server-key'), 'sk-wrong');
      });
      const recheck = nextProbe();
      await pressButton(root, 'pair-server-add');
      await settle(recheck, refused);

      expect(serverStore.addServer).not.toHaveBeenCalled();
      expect(root.getByTestId('pair-server-verdict')).toBeTruthy();
      expect(addButton(root).props.disabled).toBe(true);
    });

    it('lets the newest probe decide, whatever order the two settle in', async () => {
      const slow = nextProbe();
      const root = renderSheet({request: {url: QR_PAYLOAD}});

      await act(async () => {
        fireEvent.changeText(root.getByTestId('pair-server-key'), 'sk-a');
      });
      const fresh = nextProbe();
      await pressButton(root, 'pair-server-add');

      await settle(fresh, refused);
      await settle(slow, usable(5));

      expect(root.queryByTestId('pair-server-models')).toBeNull();
      expect(root.getByTestId('pair-server-verdict')).toBeTruthy();
      expect(addButton(root).props.disabled).toBe(true);
      expect(serverStore.addServer).not.toHaveBeenCalled();
    });

    it('enables Add for a usable server with no models, which is not an error', async () => {
      const probe = nextProbe();
      const root = renderSheet();

      await scan(QR_PAYLOAD);
      await settle(probe, usable(0));

      expect(root.getByTestId('pair-server-models')).toBeTruthy();
      expect(addButton(root).props.disabled).toBe(false);
    });

    it.each([
      ['unauthorized', refused],
      ['unreadable', {outcome: 'unreadable' as const, status: 200}],
      ['server-error', {outcome: 'server-error' as const, status: 502}],
      ['unreachable', {outcome: 'unreachable' as const}],
    ])(
      'blocks Add on a %s verdict and writes nothing',
      async (_label, result) => {
        const probe = nextProbe();
        const root = renderSheet();

        await scan(QR_PAYLOAD);
        await settle(probe, result as PairingProbeResult);

        expect(root.getByTestId('pair-server-verdict')).toBeTruthy();
        expect(addButton(root).props.disabled).toBe(true);
        expect(serverStore.addServer).not.toHaveBeenCalled();
      },
    );

    it('keeps an empty list distinguishable from an unreadable response', async () => {
      const emptyProbe = nextProbe();
      const empty = renderSheet();
      await scan(QR_PAYLOAD);
      await settle(emptyProbe, usable(0));

      const unreadableProbe = nextProbe();
      const unreadable = renderSheet();
      await scan(QR_PAYLOAD);
      await settle(unreadableProbe, {outcome: 'unreadable', status: 200});

      expect(empty.getByTestId('pair-server-models')).toBeTruthy();
      expect(unreadable.getByTestId('pair-server-verdict')).toBeTruthy();
      expect(addButton(empty).props.disabled).toBe(false);
      expect(addButton(unreadable).props.disabled).toBe(true);
    });
  });

  describe('the three credential states', () => {
    const credentialText = async (
      result: PairingProbeResult,
      request?: Record<string, any>,
    ) => {
      const probe = nextProbe();
      const root = renderSheet(request ? {request} : {});
      if (!request) {
        await scan(QR_PAYLOAD);
      }
      await settle(probe, result);
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

    it('makes no claim about a key the last probe never ran with', async () => {
      const probe = nextProbe();
      const root = renderSheet({request: {url: QR_PAYLOAD}});
      await settle(probe, usable(1));

      await act(async () => {
        fireEvent.changeText(root.getByTestId('pair-server-key'), 'sk-new');
      });

      expect(root.queryByTestId('pair-server-credentials')).toBeNull();
      expect(root.queryByTestId('pair-server-models')).toBeNull();
      expect(addButton(root).props.disabled).toBe(false);
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

  describe('moving between the two ways in', () => {
    it('reaches manual entry from the scanner and back again', async () => {
      const root = renderSheet();

      expect(root.getByTestId('pair-server-camera')).toBeTruthy();
      await pressButton(root, 'pair-server-manual');

      expect(root.getByTestId('pair-server-url')).toBeTruthy();
      expect(root.queryByTestId('pair-server-camera')).toBeNull();

      await pressButton(root, 'pair-server-scan');
      expect(root.getByTestId('pair-server-camera')).toBeTruthy();
    });

    it('leaves a stale code behind instead of stranding the user on it', async () => {
      const probe = nextProbe();
      const root = renderSheet();

      await scan(QR_PAYLOAD);
      await settle(probe, {outcome: 'unreachable'});

      await pressButton(root, 'pair-server-back');

      expect(root.getByTestId('pair-server-camera')).toBeTruthy();
      expect(root.queryByTestId('pair-server-verdict')).toBeNull();
    });

    it('returns a hand-typed address to the form it was typed in', async () => {
      mockUseCameraDevice.mockReturnValue(undefined);
      const probe = nextProbe();
      const root = renderSheet();

      await act(async () => {
        fireEvent.changeText(
          root.getByTestId('pair-server-url'),
          'http://192.168.1.5:9931',
        );
      });
      await pressButton(root, 'pair-server-continue');
      await settle(probe, {outcome: 'unreachable'});

      await pressButton(root, 'pair-server-back');

      expect(root.getByTestId('pair-server-url').props.value).toBe(
        'http://192.168.1.5:9931/',
      );
    });

    it('keeps hand-typed entry when camera access is granted mid-edit', async () => {
      grantCamera(false);
      const root = renderSheet();

      await waitFor(() => {
        expect(root.getByTestId('pair-server-camera-denied')).toBeTruthy();
      });
      await act(async () => {
        fireEvent.changeText(
          root.getByTestId('pair-server-url'),
          'http://192.168.1.5:9931',
        );
        fireEvent.changeText(root.getByTestId('pair-server-name'), 'Studio');
      });

      grantCamera(true);
      await act(async () => {
        root.rerender(<PairServerSheet isVisible onDismiss={jest.fn()} />);
      });

      expect(root.getByTestId('pair-server-url').props.value).toBe(
        'http://192.168.1.5:9931',
      );
      expect(root.getByTestId('pair-server-name').props.value).toBe('Studio');
      expect(root.queryByTestId('pair-server-camera')).toBeNull();
    });
  });

  describe('camera availability', () => {
    it('blames nothing for hand entry the user chose with the camera working', async () => {
      const root = renderSheet();

      await pressButton(root, 'pair-server-manual');

      expect(root.queryByTestId('pair-server-camera-denied')).toBeNull();
      expect(root.queryByTestId('pair-server-no-camera')).toBeNull();
      expect(control(root, 'pair-server-scan')).toBeTruthy();
    });

    it('explains the missing scanner when access was refused', async () => {
      grantCamera(false);
      const root = renderSheet();

      await waitFor(() => {
        expect(root.getByTestId('pair-server-camera-denied')).toBeTruthy();
      });
      expect(control(root, 'pair-server-scan')).toBeFalsy();
    });

    it('asks for camera access when the sheet opens without it', async () => {
      grantCamera(false);
      renderSheet();

      await waitFor(() => {
        expect(requestPermission).toHaveBeenCalled();
      });
    });

    it('never asks for the camera on a link that opens straight at the confirm step', async () => {
      grantCamera(false);
      const probe = nextProbe();
      const root = renderSheet({request: {url: QR_PAYLOAD}});
      await settle(probe, usable(1));

      expect(requestPermission).not.toHaveBeenCalled();
      expect(root.queryByTestId('pair-server-camera')).toBeNull();
    });

    it('never mounts the camera without access, and pairs by hand instead', async () => {
      grantCamera(false);
      const probe = nextProbe();
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
      await settle(probe, usable(2));
      await pressButton(root, 'pair-server-add');

      expect(onPaired).toHaveBeenCalledWith('mock-server-id');
    });

    it('opens on manual entry and still completes a pairing', async () => {
      mockUseCameraDevice.mockReturnValue(undefined);
      const probe = nextProbe();
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
      await settle(probe, usable(2));
      await pressButton(root, 'pair-server-add');

      // The sheet hands the parsed url straight to the store, which owns the
      // single canonicalisation site (covered in ServerStore's own tests).
      expect(serverStore.addServer).toHaveBeenCalledWith(
        expect.objectContaining({url: 'http://192.168.1.5:9931/v1'}),
      );
      expect(onPaired).toHaveBeenCalledWith('mock-server-id');
    });
  });

  describe('reaching the buttons with the keyboard up', () => {
    // The sheet pans rather than resizes, so only the keyboard-aware scroll
    // view moves a control clear of the keyboard.
    // react-test-renderer reports a memo() component as its inner function.
    const scrollViewTypes = [Sheet.ScrollView, (Sheet.ScrollView as any).type];

    const scrollsWithTheBody = (root: any, testID: string) => {
      let node = control(root, testID);
      expect(node).toBeTruthy();
      while (node) {
        if (scrollViewTypes.includes(node.type)) {
          return true;
        }
        node = node.parent;
      }
      return false;
    };

    it("scrolls the manual form's Add with the fields it submits", async () => {
      const root = renderSheet();
      await pressButton(root, 'pair-server-manual');

      expect(scrollsWithTheBody(root, 'pair-server-continue')).toBe(true);
    });

    it("scrolls the confirm step's Add with the key field", async () => {
      const probe = nextProbe();
      const root = renderSheet({request: {url: QR_PAYLOAD}});
      await settle(probe, usable(1));

      expect(scrollsWithTheBody(root, 'pair-server-add')).toBe(true);
      expect(scrollsWithTheBody(root, 'pair-server-back')).toBe(true);
    });
  });

  describe('passing the safe-area inset down to the action row', () => {
    const NAV_BAR = 48;

    beforeEach(() => {
      (useSafeAreaInsets as jest.Mock).mockReturnValue({
        top: 0,
        right: 0,
        bottom: NAV_BAR,
        left: 0,
      });
    });

    afterEach(() => {
      (useSafeAreaInsets as jest.Mock).mockReturnValue({
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      });
    });

    /**
     * The largest bottom padding *declared* by an ancestor of `testID`. This is
     * the inset being wired through, not the control's clearance on screen —
     * the sheet clips its scroll tail, so clearance is only measurable on device.
     */
    const declaredBottomInset = (root: any, testID: string) => {
      let node = control(root, testID);
      expect(node).toBeTruthy();
      let lift = 0;
      while (node) {
        for (const style of [
          node.props?.style,
          node.props?.contentContainerStyle,
        ]) {
          const flat = StyleSheet.flatten(style) as
            | {paddingBottom?: number}
            | undefined;
          if (typeof flat?.paddingBottom === 'number') {
            lift = Math.max(lift, flat.paddingBottom);
          }
        }
        node = node.parent;
      }
      return lift;
    };

    it("declares the inset under the scanner's way into manual entry", async () => {
      const root = renderSheet();

      expect(root.getByTestId('pair-server-camera')).toBeTruthy();
      expect(
        declaredBottomInset(root, 'pair-server-manual'),
      ).toBeGreaterThanOrEqual(NAV_BAR);
    });

    it("declares the inset under the manual form's Add", async () => {
      const root = renderSheet();
      await pressButton(root, 'pair-server-manual');

      expect(
        declaredBottomInset(root, 'pair-server-continue'),
      ).toBeGreaterThanOrEqual(NAV_BAR);
    });

    it("declares the inset under the duplicate prompt's Use", async () => {
      runInAction(() => {
        serverStore.servers = [
          {id: 's1', name: 'Studio', url: 'http://192.168.1.5:9931'},
        ];
      });
      const root = renderSheet();
      await scan(QR_PAYLOAD);

      expect(
        declaredBottomInset(root, 'pair-server-use'),
      ).toBeGreaterThanOrEqual(NAV_BAR);
    });

    it("declares the inset under the confirm step's Add", async () => {
      const probe = nextProbe();
      const root = renderSheet({request: {url: QR_PAYLOAD}});
      await settle(probe, usable(1));

      expect(
        declaredBottomInset(root, 'pair-server-add'),
      ).toBeGreaterThanOrEqual(NAV_BAR);
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
