import React from 'react';

import {render, act} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';

import {PendingIndicator} from '../PendingIndicator';

describe('PendingIndicator', () => {
  it('renders the dot-row container with the documented testID', () => {
    const {getByTestId} = render(<PendingIndicator />);
    expect(getByTestId('pending-indicator')).toBeTruthy();
  });

  it('renders no suffix when no tool call is in progress', () => {
    const {queryByTestId} = render(<PendingIndicator />);
    expect(queryByTestId('pending-indicator-suffix')).toBeNull();
  });

  it('shows the friendly label as soon as a tool call starts (no token threshold for label)', () => {
    const {getByTestId} = render(
      <PendingIndicator
        pendingTalentNames={['render_html']}
        pendingToolTokens={0}
      />,
    );
    const suffix = getByTestId('pending-indicator-suffix');
    expect(suffix.props.children).toBe(
      l10n.en.components.pendingIndicator.buildingPage,
    );
  });

  it('hides the token count below threshold but keeps the label', () => {
    const {getByTestId} = render(
      <PendingIndicator
        pendingTalentNames={['render_html']}
        pendingToolTokens={3}
      />,
    );
    const suffix = getByTestId('pending-indicator-suffix');
    expect(suffix.props.children).not.toMatch(/tokens/);
    expect(suffix.props.children).toMatch(/Building page/);
  });

  it('shows label + token count once the count crosses the threshold', () => {
    const {getByTestId} = render(
      <PendingIndicator
        pendingTalentNames={['render_html']}
        pendingToolTokens={120}
      />,
    );
    expect(getByTestId('pending-indicator-suffix').props.children).toBe(
      `${l10n.en.components.pendingIndicator.buildingPage} · 120 tokens`,
    );
  });

  it('uses the per-talent label for calculate', () => {
    const {getByTestId} = render(
      <PendingIndicator pendingTalentNames={['calculate']} />,
    );
    expect(getByTestId('pending-indicator-suffix').props.children).toBe(
      l10n.en.components.pendingIndicator.calculating,
    );
  });

  it('uses the per-talent label for datetime', () => {
    const {getByTestId} = render(
      <PendingIndicator pendingTalentNames={['datetime']} />,
    );
    expect(getByTestId('pending-indicator-suffix').props.children).toBe(
      l10n.en.components.pendingIndicator.lookingUpTime,
    );
  });

  it('falls back to the generic label for unknown talents', () => {
    const {getByTestId} = render(
      <PendingIndicator pendingTalentNames={['mystery_tool']} />,
    );
    expect(getByTestId('pending-indicator-suffix').props.children).toBe(
      l10n.en.components.pendingIndicator.preparingTool,
    );
  });

  it('overrides everything with "Stopping…" when isStopping is true', () => {
    // The user has tapped Stop and we're waiting for native llama.rn
    // to finish its current llama_decode chunk. Even if a tool-call
    // was in flight (label, token count, elapsed) the indicator must
    // surface ONLY the stopping signal so the user knows their tap
    // landed and the silent gap isn't a hung UI.
    const {getByTestId} = render(
      <PendingIndicator
        pendingTalentNames={['render_html']}
        pendingToolTokens={150}
        isStopping
      />,
    );
    const suffix = getByTestId('pending-indicator-suffix');
    expect(suffix.props.children).toBe(
      l10n.en.components.pendingIndicator.stopping,
    );
    // No leftover token count or elapsed text from the previous mode.
    expect(suffix.props.children).not.toMatch(/tokens/);
  });

  it('appends elapsed seconds after one second has passed', () => {
    jest.useFakeTimers();
    const {getByTestId, rerender} = render(
      <PendingIndicator
        pendingTalentNames={['render_html']}
        pendingToolTokens={120}
      />,
    );
    // Initial render: no elapsed segment yet.
    expect(getByTestId('pending-indicator-suffix').props.children).not.toMatch(
      /\ds$/,
    );
    act(() => {
      jest.advanceTimersByTime(2500);
    });
    rerender(
      <PendingIndicator
        pendingTalentNames={['render_html']}
        pendingToolTokens={120}
      />,
    );
    expect(getByTestId('pending-indicator-suffix').props.children).toMatch(
      /· 2s$/,
    );
    jest.useRealTimers();
  });
});
