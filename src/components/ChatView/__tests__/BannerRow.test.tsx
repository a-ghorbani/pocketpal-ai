import React from 'react';
import {runInAction} from 'mobx';

import {fireEvent, render} from '../../../../jest/test-utils';
import {modelsList} from '../../../../jest/fixtures/models';

import {L10nContext} from '../../../utils';
import {ModelOrigin} from '../../../utils/types';
import {l10n} from '../../../locales';
import {chatSessionStore, modelStore, serverStore} from '../../../store';

import {BannerRow} from '../BannerRow';

const renderBanner = (
  props: Partial<React.ComponentProps<typeof BannerRow>> = {},
) =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <BannerRow
        messages={[]}
        htmlPreviewCount={0}
        canIncrease={true}
        onIncreaseContext={jest.fn()}
        onNewChat={jest.fn()}
        {...props}
      />
    </L10nContext.Provider>,
  );

describe('BannerRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      // Cases that swap in a remote model leave the list empty, so restore it:
      // the local window resolves against the active model, not the id alone.
      modelStore.models = modelsList;
      modelStore.activeModelId = 'model-1';
      (modelStore as any).activeContextSettings = {n_ctx: 4096};
      modelStore.availableMemoryCeiling = 5 * 1e9;
      chatSessionStore.lastCompletionResult = undefined;
      chatSessionStore.dismissedBannerVariants = new Set();
      chatSessionStore.consecutiveFullFailures = 0;
    });
  });

  afterEach(() => {
    runInAction(() => {
      (modelStore as any).activeContextSettings = undefined;
      chatSessionStore.lastCompletionResult = undefined;
    });
  });

  it('renders nothing for the none variant', () => {
    const {queryByTestId} = renderBanner();
    expect(queryByTestId('context-full-banner')).toBeNull();
    expect(queryByTestId('context-warning-banner')).toBeNull();
    expect(queryByTestId('soft-cap-warning')).toBeNull();
  });

  it('renders the warning banner at the 0.80 ratio with a working dismiss', () => {
    runInAction(() => {
      chatSessionStore.lastCompletionResult = {
        used: 3300,
        contextFull: false,
        isRemote: false,
      };
    });
    const {getByTestId, getByText} = renderBanner();
    expect(getByTestId('context-warning-banner')).toBeTruthy();
    expect(getByText(l10n.en.chat.contextWarning)).toBeTruthy();

    fireEvent.press(getByTestId('context-banner-dismiss'));
    expect(chatSessionStore.setBannerDismissed).toHaveBeenCalledWith(
      'context-warning',
    );
  });

  it('renders the sticky full banner with the increase CTA when an upgrade fits', () => {
    runInAction(() => {
      chatSessionStore.lastCompletionResult = {
        used: 4096,
        contextFull: true,
        isRemote: false,
      };
    });
    const {getByTestId} = renderBanner({canIncrease: true});
    expect(getByTestId('context-full-banner')).toBeTruthy();
    expect(getByTestId('context-full-new-chat')).toBeTruthy();
    expect(getByTestId('context-full-increase')).toBeTruthy();
    // The fullness meter renders on the full variant too (resolver emits ratio
    // on both nCtx-reading branches). It is decorative, so hidden from a11y.
    expect(
      getByTestId('banner-meter', {includeHiddenElements: true}),
    ).toBeTruthy();
    // The full banner is dismissable for the current draft (the dismissal
    // clears on the next finished turn).
    expect(getByTestId('context-banner-dismiss')).toBeTruthy();
  });

  it('hides the increase CTA when no larger context fits the device', () => {
    runInAction(() => {
      chatSessionStore.lastCompletionResult = {
        used: 4096,
        contextFull: true,
        isRemote: false,
      };
    });
    const {getByTestId, queryByTestId} = renderBanner({canIncrease: false});
    expect(getByTestId('context-full-banner')).toBeTruthy();
    expect(getByTestId('context-full-new-chat')).toBeTruthy();
    expect(queryByTestId('context-full-increase')).toBeNull();
  });

  it('opens the sheet (no precomputed target) when the increase CTA is tapped', () => {
    const onIncreaseContext = jest.fn();
    runInAction(() => {
      chatSessionStore.lastCompletionResult = {
        used: 4096,
        contextFull: true,
        isRemote: false,
      };
    });
    const {getByTestId} = renderBanner({onIncreaseContext, canIncrease: true});
    fireEvent.press(getByTestId('context-full-increase'));
    expect(onIncreaseContext).toHaveBeenCalledTimes(1);
    expect(onIncreaseContext.mock.calls[0]).toHaveLength(0);
  });

  it('shows the meter and percent on the warning banner', () => {
    runInAction(() => {
      chatSessionStore.lastCompletionResult = {
        used: 3300,
        contextFull: false,
        isRemote: false,
      };
    });
    const {getByTestId} = renderBanner();
    expect(
      getByTestId('banner-meter', {includeHiddenElements: true}),
    ).toBeTruthy();
    // 3300 / 4096 ≈ 80.6% → rounds to 81%.
    expect(getByTestId('banner-percent')).toHaveTextContent('81%');
  });

  it('stacks the warning banner in a column so the meter spans full width', () => {
    runInAction(() => {
      chatSessionStore.lastCompletionResult = {
        used: 3300,
        contextFull: false,
        isRemote: false,
      };
    });
    const {getByTestId} = renderBanner();
    // A row container would collapse the meter to ~0 width. The warning banner
    // must stack (default column) so the meter's percentage fill measures
    // against a full-width parent.
    const container = getByTestId('context-warning-banner');
    const flat = Array.isArray(container.props.style)
      ? Object.assign({}, ...container.props.style.filter(Boolean))
      : container.props.style;
    expect(flat.flexDirection).not.toBe('row');

    const meter = getByTestId('banner-meter', {includeHiddenElements: true});
    const meterFlat = Array.isArray(meter.props.style)
      ? Object.assign({}, ...meter.props.style.filter(Boolean))
      : meter.props.style;
    expect(meterFlat.alignSelf).toBe('stretch');
    expect(meterFlat.width).toBe('100%');
  });

  it('shows the escalated full copy after consecutive full failures', () => {
    runInAction(() => {
      chatSessionStore.consecutiveFullFailures = 2;
      chatSessionStore.lastCompletionResult = {
        used: 4096,
        contextFull: true,
        isRemote: false,
      };
    });
    const {getByText} = renderBanner();
    expect(getByText(l10n.en.chat.contextFullEscalated)).toBeTruthy();
  });

  it('keeps the remote copy (no increase clause) for a remote model at the escalated failure count', () => {
    runInAction(() => {
      modelStore.activeModelId = 'remote-1';
      modelStore.models = [
        {id: 'remote-1', origin: ModelOrigin.REMOTE, serverId: 'srv-1'} as any,
      ];
      (modelStore as any).activeContextSettings = undefined;
      serverStore.servers = [
        {
          id: 'srv-1',
          name: 'llama',
          url: 'http://localhost:8080',
          serverType: 'llama.cpp',
        } as any,
      ];
      serverStore.remoteCaps = {'remote-1': {contextLength: 4096}};
      // A remote session can reach >=2 consecutive full turns (the counter is
      // remote-agnostic), but must not re-surface the escalated increase advice.
      chatSessionStore.consecutiveFullFailures = 2;
      chatSessionStore.lastCompletionResult = {
        used: 4096,
        contextFull: true,
        isRemote: true,
        finishReason: 'length',
      };
    });
    const {getByText, queryByText} = renderBanner({canIncrease: false});
    expect(getByText(l10n.en.chat.contextFullRemote)).toBeTruthy();
    expect(queryByText(l10n.en.chat.contextFullEscalated)).toBeNull();

    runInAction(() => {
      modelStore.models = [];
      serverStore.servers = [];
      serverStore.remoteCaps = {};
    });
  });

  it('keeps the escalated copy for a local model at the escalated failure count', () => {
    runInAction(() => {
      chatSessionStore.consecutiveFullFailures = 2;
      chatSessionStore.lastCompletionResult = {
        used: 4096,
        contextFull: true,
        isRemote: false,
      };
    });
    const {getByText, queryByText} = renderBanner();
    expect(getByText(l10n.en.chat.contextFullEscalated)).toBeTruthy();
    expect(queryByText(l10n.en.chat.contextFullRemote)).toBeNull();
  });

  it('renders the remote hedged advisory for a remote model with no runtime n_ctx', () => {
    runInAction(() => {
      modelStore.activeModelId = 'remote-1';
      modelStore.models = [{id: 'remote-1', origin: ModelOrigin.REMOTE} as any];
      // Remote models never set activeContextSettings.n_ctx.
      (modelStore as any).activeContextSettings = undefined;
      chatSessionStore.lastCompletionResult = {
        used: 0,
        contextFull: false,
        isRemote: true,
        tokensPredicted: 600,
        content: 'this reply was cut off',
      };
    });
    const {getByTestId, queryByTestId, getByText} = renderBanner();
    expect(getByTestId('context-remote-hedged-banner')).toBeTruthy();
    expect(getByText(l10n.en.chat.contextRemoteHedged)).toBeTruthy();
    // No fullness meter on the remote-hedged branch: the resolver emits no
    // ratio there, so the meter cannot render (reinforces the remote no-meter
    // rule, not just relying on it).
    expect(queryByTestId('banner-meter')).toBeNull();

    fireEvent.press(getByTestId('context-banner-dismiss'));
    expect(chatSessionStore.setBannerDismissed).toHaveBeenCalledWith(
      'context-remote-hedged',
    );

    runInAction(() => {
      modelStore.models = [];
    });
  });

  it('resolves context-full for a remote model from the server-reported contextLength', () => {
    runInAction(() => {
      modelStore.activeModelId = 'remote-1';
      modelStore.models = [
        {id: 'remote-1', origin: ModelOrigin.REMOTE, serverId: 'srv-1'} as any,
      ];
      // Remote models never set activeContextSettings.n_ctx; the window must
      // come from the server's /props-reported contextLength (cross-store read).
      (modelStore as any).activeContextSettings = undefined;
      serverStore.servers = [
        {
          id: 'srv-1',
          name: 'llama',
          url: 'http://localhost:8080',
          serverType: 'llama.cpp',
        } as any,
      ];
      serverStore.remoteCaps = {'remote-1': {contextLength: 4096}};
      chatSessionStore.lastCompletionResult = {
        used: 4096,
        contextFull: true,
        isRemote: true,
        finishReason: 'length',
      };
    });
    const {getByTestId} = renderBanner();
    // effectiveNCtx must be derived from serverStore.contextLength for the
    // context-full branch (and its meter) to render at all for a remote model.
    expect(getByTestId('context-full-banner')).toBeTruthy();
    expect(
      getByTestId('banner-meter', {includeHiddenElements: true}),
    ).toBeTruthy();

    runInAction(() => {
      modelStore.models = [];
      serverStore.servers = [];
      serverStore.remoteCaps = {};
    });
  });

  it('ignores a window probed against another backend', () => {
    runInAction(() => {
      modelStore.activeModelId = 'remote-1';
      modelStore.models = [
        {id: 'remote-1', origin: ModelOrigin.REMOTE, serverId: 'srv-1'} as any,
      ];
      (modelStore as any).activeContextSettings = undefined;
      serverStore.servers = [
        {
          id: 'srv-1',
          name: 'llama',
          url: 'http://localhost:9090',
        } as any,
      ];
      // The session is still on :8080; the entry describes :9090, so there is
      // no window to measure against and the banners stay silent.
      modelStore.activeRemoteBinding = {
        modelId: 'remote-1',
        serverId: 'srv-1',
        remoteModelId: 'remote-1',
        url: 'http://localhost:8080',
      };
      serverStore.remoteCaps = {
        'remote-1': {contextLength: 4096, probedUrl: 'http://localhost:9090'},
      };
      chatSessionStore.lastCompletionResult = {
        used: 4096,
        contextFull: false,
        isRemote: true,
      };
    });
    const {queryByTestId} = renderBanner();
    expect(queryByTestId('context-full-banner')).toBeNull();
    expect(queryByTestId('context-warning-banner')).toBeNull();

    runInAction(() => {
      modelStore.models = [];
      modelStore.activeRemoteBinding = undefined;
      serverStore.servers = [];
      serverStore.remoteCaps = {};
    });
  });

  it('does not treat a per-model window of 0 as a full context', () => {
    runInAction(() => {
      modelStore.activeModelId = 'remote-1';
      modelStore.models = [
        {id: 'remote-1', origin: ModelOrigin.REMOTE, serverId: 'srv-1'} as any,
      ];
      (modelStore as any).activeContextSettings = undefined;
      serverStore.servers = [
        {
          id: 'srv-1',
          name: 'llama',
          url: 'http://localhost:8080',
          serverType: 'llama.cpp',
        } as any,
      ];
      // No writer produces this today; the gate is what keeps it that way.
      serverStore.remoteCaps = {'remote-1': {contextLength: 0}};
      chatSessionStore.lastCompletionResult = {
        used: 120,
        contextFull: false,
        isRemote: true,
      };
    });
    const {queryByTestId} = renderBanner();
    expect(queryByTestId('context-full-banner')).toBeNull();
    expect(queryByTestId('context-warning-banner')).toBeNull();

    runInAction(() => {
      modelStore.models = [];
      serverStore.servers = [];
      serverStore.remoteCaps = {};
    });
  });

  it('uses the remote context-full copy (no increase clause) for a remote model', () => {
    runInAction(() => {
      modelStore.activeModelId = 'remote-1';
      modelStore.models = [
        {id: 'remote-1', origin: ModelOrigin.REMOTE, serverId: 'srv-1'} as any,
      ];
      (modelStore as any).activeContextSettings = undefined;
      serverStore.servers = [
        {
          id: 'srv-1',
          name: 'llama',
          url: 'http://localhost:8080',
          serverType: 'llama.cpp',
        } as any,
      ];
      serverStore.remoteCaps = {'remote-1': {contextLength: 4096}};
      chatSessionStore.lastCompletionResult = {
        used: 4096,
        contextFull: true,
        isRemote: true,
        finishReason: 'length',
      };
    });
    const {getByText, queryByText} = renderBanner({canIncrease: false});
    // Remote copy drops "or increase the context size" — the increase CTA is
    // hidden for remote (no client-side control).
    expect(getByText(l10n.en.chat.contextFullRemote)).toBeTruthy();
    expect(queryByText(l10n.en.chat.contextFull)).toBeNull();

    runInAction(() => {
      modelStore.models = [];
      serverStore.servers = [];
      serverStore.remoteCaps = {};
    });
  });

  it('keeps the device context-full copy for a local model', () => {
    runInAction(() => {
      chatSessionStore.lastCompletionResult = {
        used: 4096,
        contextFull: true,
        isRemote: false,
      };
    });
    const {getByText, queryByText} = renderBanner({canIncrease: true});
    expect(getByText(l10n.en.chat.contextFull)).toBeTruthy();
    expect(queryByText(l10n.en.chat.contextFullRemote)).toBeNull();
  });

  it('measures against the session window, not the window the model declares', () => {
    runInAction(() => {
      modelStore.models = [
        {
          id: 'model-1',
          origin: ModelOrigin.PRESET,
          ggufMetadata: {context_length: 32768},
        } as any,
      ];
      (modelStore as any).activeContextSettings = {n_ctx: 4096};
      chatSessionStore.lastCompletionResult = {
        used: 3300,
        contextFull: false,
        isRemote: false,
      };
    });
    const {getByTestId} = renderBanner();
    // 3300 / 4096 ≈ 81%; against the declared 32768 it would be 10% and no
    // banner would render at all.
    expect(getByTestId('context-warning-banner')).toBeTruthy();
    expect(getByTestId('banner-percent')).toHaveTextContent('81%');
  });

  it('resolves the near-limit warning + meter percent for a remote model', () => {
    runInAction(() => {
      modelStore.activeModelId = 'remote-1';
      modelStore.models = [
        {id: 'remote-1', origin: ModelOrigin.REMOTE, serverId: 'srv-1'} as any,
      ];
      (modelStore as any).activeContextSettings = undefined;
      serverStore.servers = [
        {
          id: 'srv-1',
          name: 'llama',
          url: 'http://localhost:8080',
          serverType: 'llama.cpp',
        } as any,
      ];
      serverStore.remoteCaps = {'remote-1': {contextLength: 4096}};
      chatSessionStore.lastCompletionResult = {
        used: 3300,
        contextFull: false,
        isRemote: true,
      };
    });
    const {getByTestId} = renderBanner();
    expect(getByTestId('context-warning-banner')).toBeTruthy();
    // 3300 / 4096 ≈ 80.6% → the meter percent proves the ratio measured
    // against the server window, not the weak remote heuristic.
    expect(getByTestId('banner-percent')).toHaveTextContent('81%');

    runInAction(() => {
      modelStore.models = [];
      serverStore.servers = [];
      serverStore.remoteCaps = {};
    });
  });

  it('suppresses context-* banners when no model is loaded', () => {
    runInAction(() => {
      modelStore.activeModelId = undefined;
      chatSessionStore.lastCompletionResult = {
        used: 4096,
        contextFull: true,
        isRemote: false,
      };
    });
    const {queryByTestId} = renderBanner();
    expect(queryByTestId('context-full-banner')).toBeNull();
  });

  it('still shows the html-soft-cap sub-case independent of model state', () => {
    runInAction(() => {
      modelStore.activeModelId = undefined;
    });
    const {getByTestId, getByText} = renderBanner({htmlPreviewCount: 4});
    expect(getByTestId('soft-cap-warning')).toBeTruthy();
    expect(getByText(l10n.en.chat.softCapWarning)).toBeTruthy();
  });

  it('lets context-full win over html-soft-cap (precedence)', () => {
    runInAction(() => {
      chatSessionStore.lastCompletionResult = {
        used: 4096,
        contextFull: true,
        isRemote: false,
      };
    });
    const {getByTestId, queryByTestId} = renderBanner({htmlPreviewCount: 4});
    expect(getByTestId('context-full-banner')).toBeTruthy();
    expect(queryByTestId('soft-cap-warning')).toBeNull();
  });

  it('shows the fullness percentage beside the full banner meter', () => {
    runInAction(() => {
      chatSessionStore.lastCompletionResult = {
        used: 3900,
        contextFull: true,
        isRemote: false,
      };
    });
    const {getByTestId} = renderBanner();
    expect(getByTestId('context-full-banner')).toBeTruthy();
    // 3900 / 4096 ≈ 95%, the same ratio the meter is drawn from.
    expect(getByTestId('banner-percent')).toHaveTextContent('95%');
    expect(
      getByTestId('banner-meter', {includeHiddenElements: true}),
    ).toBeTruthy();
  });

  it('renders no banner at all when the turn reported no token count', () => {
    runInAction(() => {
      chatSessionStore.lastCompletionResult = {
        used: undefined,
        contextFull: true,
        isRemote: false,
      };
    });
    const {queryByTestId} = renderBanner();
    expect(queryByTestId('context-full-banner')).toBeNull();
    expect(queryByTestId('banner-percent')).toBeNull();
  });
});
