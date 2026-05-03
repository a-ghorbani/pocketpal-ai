import * as React from 'react';
import {Text} from 'react-native';

import {render} from '../../../../jest/test-utils';

import {TalentSurface} from '../TalentSurface';
import {talentUIRegistry} from '../../../services/talents/TalentUIRegistry';
import {AgentStep} from '../../../utils/types';

describe('TalentSurface', () => {
  beforeEach(() => {
    talentUIRegistry.reset();
  });

  it('#3 renders registered renderResult for each step.toolCall whose outcome is present', () => {
    talentUIRegistry.register({
      name: 'calculate',
      renderResult: result => (
        <Text testID="calc-result">calc:{result.summary}</Text>
      ),
    });
    const step: AgentStep = {
      toolCalls: [{id: 'c0', function: {name: 'calculate', arguments: '{}'}}],
      toolOutcomes: [
        {
          callId: 'c0',
          toolName: 'calculate',
          result: {type: 'text', summary: '42'},
          responseContent: '42',
        },
      ],
    };
    const {getByTestId} = render(<TalentSurface step={step} />);
    expect(getByTestId('calc-result')).toBeTruthy();
  });

  it('#4 active run with pendingTalentNames=[] + isGeneratingToolCall=true → renders generic "preparing tool" copy', () => {
    const {getByTestId} = render(
      <TalentSurface
        step={undefined}
        isActiveRun
        pendingTalentNames={[]}
        isGeneratingToolCall
      />,
    );
    expect(getByTestId('talent-call-pending')).toBeTruthy();
  });

  it('#5 active run with pendingTalentNames=["calculate"] → renders the talent-specific renderPending', () => {
    talentUIRegistry.register({
      name: 'calculate',
      renderPending: () => <Text testID="calc-pending">pending-calc</Text>,
    });
    const {getByTestId} = render(
      <TalentSurface
        step={undefined}
        isActiveRun
        pendingTalentNames={['calculate']}
        isGeneratingToolCall
      />,
    );
    expect(getByTestId('calc-pending')).toBeTruthy();
  });

  it('persisted step (not active) with no toolOutcome and no renderPending → null', () => {
    talentUIRegistry.register({
      name: 'calculate',
      renderPending: () => <Text testID="pending">pending</Text>,
    });
    const step: AgentStep = {
      toolCalls: [{id: 'c0', function: {name: 'calculate', arguments: '{}'}}],
    };
    const {queryByTestId} = render(<TalentSurface step={step} />);
    expect(queryByTestId('pending')).toBeNull();
  });

  it('persisted step on active run shows pending UI for unresolved tool calls', () => {
    talentUIRegistry.register({
      name: 'calculate',
      renderPending: () => <Text testID="active-pending">active-pending</Text>,
    });
    const step: AgentStep = {
      toolCalls: [{id: 'c0', function: {name: 'calculate', arguments: '{}'}}],
    };
    const {getByTestId} = render(
      <TalentSurface step={step} isActiveRun />,
    );
    expect(getByTestId('active-pending')).toBeTruthy();
  });

  it('renders nothing when there are no toolCalls and no active-run hints', () => {
    const {queryByTestId} = render(<TalentSurface />);
    expect(queryByTestId('talent-call-pending')).toBeNull();
  });

  it('skips tool calls whose talent is not registered', () => {
    const step: AgentStep = {
      toolCalls: [
        {id: 'c0', function: {name: 'unregistered_talent', arguments: '{}'}},
      ],
      toolOutcomes: [
        {
          callId: 'c0',
          toolName: 'unregistered_talent',
          result: {type: 'text', summary: 'x'},
          responseContent: 'x',
        },
      ],
    };
    const {queryByTestId} = render(<TalentSurface step={step} />);
    // No registered renderer fires; no generic pending UI either.
    expect(queryByTestId('talent-call-pending')).toBeNull();
  });

  it('renders pending UI when no toolCalls but pendingTalentNames is set', () => {
    talentUIRegistry.register({
      name: 'render_html',
      renderPending: () => <Text testID="html-pending">rendering…</Text>,
    });
    const {getByTestId} = render(
      <TalentSurface
        step={undefined}
        isActiveRun
        pendingTalentNames={['render_html']}
      />,
    );
    expect(getByTestId('html-pending')).toBeTruthy();
  });

  it('renders nothing for non-active run with empty pendingTalentNames (legacy persisted no-tool path)', () => {
    const {queryByTestId} = render(
      <TalentSurface step={undefined} isActiveRun={false} pendingTalentNames={['x']} />,
    );
    expect(queryByTestId('talent-call-pending')).toBeNull();
  });
});
