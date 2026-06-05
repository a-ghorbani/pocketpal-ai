import React from 'react';
import {runInAction} from 'mobx';

import {fireEvent, render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {ModelOrigin} from '../../../utils/types';
import {l10n} from '../../../locales';
import {chatSessionStore, modelStore} from '../../../store';

import {BannerRow} from '../BannerRow';

const renderBanner = (
  props: Partial<React.ComponentProps<typeof BannerRow>> = {},
) =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <BannerRow
        messages={[]}
        htmlPreviewCount={0}
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

  it('renders the sticky full banner with the increase CTA when a larger n_ctx fits', () => {
    runInAction(() => {
      chatSessionStore.lastCompletionResult = {
        used: 4096,
        contextFull: true,
        isRemote: false,
      };
    });
    const {getByTestId, queryByTestId} = renderBanner();
    expect(getByTestId('context-full-banner')).toBeTruthy();
    expect(getByTestId('context-full-new-chat')).toBeTruthy();
    expect(getByTestId('context-full-increase')).toBeTruthy();
    // Sticky: no dismiss button on the full banner.
    expect(queryByTestId('context-banner-dismiss')).toBeNull();
  });

  it('hides the increase CTA when no larger n_ctx fits the device (9g)', () => {
    runInAction(() => {
      // Ceiling below any memory requirement → no candidate fits.
      modelStore.availableMemoryCeiling = 1;
      chatSessionStore.lastCompletionResult = {
        used: 4096,
        contextFull: true,
        isRemote: false,
      };
    });
    const {getByTestId, queryByTestId} = renderBanner();
    expect(getByTestId('context-full-banner')).toBeTruthy();
    expect(getByTestId('context-full-new-chat')).toBeTruthy();
    expect(queryByTestId('context-full-increase')).toBeNull();
  });

  it('passes the resolved next-fit target to onIncreaseContext', () => {
    const onIncreaseContext = jest.fn();
    runInAction(() => {
      chatSessionStore.lastCompletionResult = {
        used: 4096,
        contextFull: true,
        isRemote: false,
      };
    });
    const {getByTestId} = renderBanner({onIncreaseContext});
    fireEvent.press(getByTestId('context-full-increase'));
    expect(onIncreaseContext).toHaveBeenCalledTimes(1);
    expect(onIncreaseContext.mock.calls[0][0]).toBeGreaterThan(4096);
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
    const {getByTestId, getByText} = renderBanner();
    expect(getByTestId('context-remote-hedged-banner')).toBeTruthy();
    expect(getByText(l10n.en.chat.contextRemoteHedged)).toBeTruthy();

    fireEvent.press(getByTestId('context-banner-dismiss'));
    expect(chatSessionStore.setBannerDismissed).toHaveBeenCalledWith(
      'context-remote-hedged',
    );

    runInAction(() => {
      modelStore.models = [];
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
});
