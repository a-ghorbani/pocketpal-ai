import * as React from 'react';
import {Text} from 'react-native';

import {render} from '../../../../jest/test-utils';

import {TalentSurface} from '../TalentSurface';
import {talentUIRegistry} from '../../../services/talents/TalentUIRegistry';
import {AgentStep} from '../../../utils/types';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => {
  const {Text: PaperText} = require('react-native-paper');
  return props => <PaperText>{props.name}</PaperText>;
});

describe('TalentSurface', () => {
  beforeEach(() => {
    talentUIRegistry.reset();
  });

  // Four-priority dispatch: error > talent UI > chip > none.

  it('#1 talent UI: outcome present + non-error + UI registered → renderResult fires', () => {
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

  it('#2 unregistered tool with non-error outcome → ToolUsedChip', () => {
    const step: AgentStep = {
      toolCalls: [{id: 'c0', function: {name: 'datetime', arguments: '{}'}}],
      toolOutcomes: [
        {
          callId: 'c0',
          toolName: 'datetime',
          result: {type: 'text', summary: '8:28 AM'},
          responseContent: '8:28 AM',
        },
      ],
    };
    const {getByTestId, getByText} = render(<TalentSurface step={step} />);
    expect(getByTestId('tool-used-chip')).toBeTruthy();
    expect(getByText('used datetime')).toBeTruthy();
  });

  it('#3 error outcome → ToolErrorBlock (subtle, low-prominence)', () => {
    const step: AgentStep = {
      toolCalls: [{id: 'c0', function: {name: 'render_html', arguments: '{}'}}],
      toolOutcomes: [
        {
          callId: 'c0',
          toolName: 'render_html',
          result: {
            type: 'error',
            summary: 'failed',
            errorMessage: 'invalid markup',
          },
          responseContent: 'failed',
        },
      ],
    };
    const {getByTestId, getByText} = render(<TalentSurface step={step} />);
    expect(getByTestId('tool-error-block')).toBeTruthy();
    expect(getByText('render_html failed')).toBeTruthy();
    expect(getByText('invalid markup')).toBeTruthy();
  });

  it('#3b error outcome wins over registered talent UI (priority order)', () => {
    talentUIRegistry.register({
      name: 'render_html',
      renderResult: () => <Text testID="html-result">should NOT fire</Text>,
    });
    const step: AgentStep = {
      toolCalls: [{id: 'c0', function: {name: 'render_html', arguments: '{}'}}],
      toolOutcomes: [
        {
          callId: 'c0',
          toolName: 'render_html',
          result: {
            type: 'error',
            summary: 'oops',
            errorMessage: 'not great',
          },
          responseContent: 'oops',
        },
      ],
    };
    const {getByTestId, queryByTestId} = render(<TalentSurface step={step} />);
    expect(getByTestId('tool-error-block')).toBeTruthy();
    expect(queryByTestId('html-result')).toBeNull();
  });

  it('#4 no outcome yet (in-flight) → renders nothing (PendingIndicator covers UX)', () => {
    talentUIRegistry.register({
      name: 'calculate',
      renderResult: () => <Text testID="should-not-fire">x</Text>,
    });
    const step: AgentStep = {
      toolCalls: [{id: 'c0', function: {name: 'calculate', arguments: '{}'}}],
    };
    const {queryByTestId} = render(<TalentSurface step={step} />);
    expect(queryByTestId('should-not-fire')).toBeNull();
    expect(queryByTestId('tool-used-chip')).toBeNull();
    expect(queryByTestId('tool-error-block')).toBeNull();
  });

  it('#5 multi-tool turn renders blocks in step.toolCalls array order', () => {
    talentUIRegistry.register({
      name: 'render_html',
      renderResult: r => (
        <Text testID={`preview-${r.summary}`}>preview-{r.summary}</Text>
      ),
    });
    const step: AgentStep = {
      toolCalls: [
        {id: 'c1', function: {name: 'render_html', arguments: '{}'}},
        {id: 'c2', function: {name: 'render_html', arguments: '{}'}},
      ],
      toolOutcomes: [
        {
          callId: 'c1',
          toolName: 'render_html',
          result: {type: 'html', html: '<p>1</p>', summary: 'one'},
          responseContent: 'one',
        },
        {
          callId: 'c2',
          toolName: 'render_html',
          result: {type: 'html', html: '<p>2</p>', summary: 'two'},
          responseContent: 'two',
        },
      ],
    };
    const {getByTestId} = render(<TalentSurface step={step} />);
    expect(getByTestId('preview-one')).toBeTruthy();
    expect(getByTestId('preview-two')).toBeTruthy();
  });

  it('renders nothing when step is undefined or has no toolCalls', () => {
    const {queryByTestId} = render(<TalentSurface />);
    expect(queryByTestId('tool-used-chip')).toBeNull();
    expect(queryByTestId('tool-error-block')).toBeNull();
  });

  it('falls back to ToolUsedChip when renderResult returns null (e.g. unsupported result.type)', () => {
    // RenderHtmlTalentUI returns null when result.type !== 'html'; the
    // dispatcher should fall through to the chip.
    talentUIRegistry.register({
      name: 'render_html',
      renderResult: result =>
        result.type === 'html' ? <Text testID="ui">{result.html}</Text> : null,
    });
    const step: AgentStep = {
      toolCalls: [{id: 'c0', function: {name: 'render_html', arguments: '{}'}}],
      toolOutcomes: [
        // Wrong type for this UI — renderResult returns null.
        {
          callId: 'c0',
          toolName: 'render_html',
          result: {type: 'text', summary: 'plain'},
          responseContent: 'plain',
        },
      ],
    };
    const {queryByTestId, getByTestId, getByText} = render(
      <TalentSurface step={step} />,
    );
    expect(queryByTestId('ui')).toBeNull();
    expect(getByTestId('tool-used-chip')).toBeTruthy();
    expect(getByText('used render_html')).toBeTruthy();
  });

  // ---------- Multi-tool partial completion ----------

  it('multi-tool partial completion: talent block + error block render together in array order', () => {
    // step₀ has [A, B]; A succeeds (talent UI registered), B fails
    // (error result). Blocks emit in step.toolCalls array order. Both
    // must appear simultaneously after step_finished — ChatView's
    // pending indicator stops covering them once outcomes land.
    talentUIRegistry.register({
      name: 'render_html',
      renderResult: result =>
        result.type === 'html' ? (
          <Text testID={`html-${result.summary}`}>html-{result.summary}</Text>
        ) : null,
    });
    const step: AgentStep = {
      toolCalls: [
        {id: 'c1', function: {name: 'render_html', arguments: '{}'}},
        {id: 'c2', function: {name: 'render_html', arguments: '{}'}},
      ],
      toolOutcomes: [
        {
          callId: 'c1',
          toolName: 'render_html',
          result: {type: 'html', html: '<p>ok</p>', summary: 'ok'},
          responseContent: 'ok',
        },
        {
          callId: 'c2',
          toolName: 'render_html',
          result: {
            type: 'error',
            summary: 'failed',
            errorMessage: 'invalid markup',
          },
          responseContent: 'failed',
        },
      ],
    };
    const {getByTestId, getByText} = render(<TalentSurface step={step} />);
    // Talent UI for the successful call.
    expect(getByTestId('html-ok')).toBeTruthy();
    // Error block for the failed call.
    expect(getByTestId('tool-error-block')).toBeTruthy();
    expect(getByText('render_html failed')).toBeTruthy();
  });

  // ---------- Persistence load with deleted talent ----------

  describe('persistence load with deleted talent', () => {
    it('persisted turn references render_html but registry has no entry → ToolUsedChip renders, no row drop, no crash', () => {
      // Simulate the post-load state: TalentUIRegistry was reset
      // (e.g. talent removed from the build, or registry init lost a
      // race with the chat reload). The persisted step still has a
      // valid html outcome; the UI must gracefully fall back to the
      // subtle "used X" chip — no crash, no missing row.
      // Note: registry was reset() in the outer beforeEach.
      const step: AgentStep = {
        toolCalls: [
          {id: 'c0', function: {name: 'render_html', arguments: '{}'}},
        ],
        toolOutcomes: [
          {
            callId: 'c0',
            toolName: 'render_html',
            // Real (non-error) result — the rich UI would normally
            // render this, but the UI is gone after reload.
            result: {
              type: 'html',
              html: '<p>preview</p>',
              summary: 'preview',
            },
            responseContent: 'preview',
          },
        ],
      };
      const {getByTestId, getByText, queryByTestId} = render(
        <TalentSurface step={step} />,
      );
      // Tool-used chip surfaces the call so the tool's name is visible
      // even though the rich UI is gone.
      expect(getByTestId('tool-used-chip')).toBeTruthy();
      expect(getByText('used render_html')).toBeTruthy();
      // No error block — outcome is non-error.
      expect(queryByTestId('tool-error-block')).toBeNull();
    });

    it('persisted error outcome with deleted talent UI → still renders ToolErrorBlock (error wins over missing UI)', () => {
      // Even with no registered UI, an error outcome remains an
      // error. Priority order (error > talent UI > chip) says the
      // error block wins regardless of registry state.
      const step: AgentStep = {
        toolCalls: [
          {id: 'c0', function: {name: 'render_html', arguments: '{}'}},
        ],
        toolOutcomes: [
          {
            callId: 'c0',
            toolName: 'render_html',
            result: {
              type: 'error',
              summary: 'oops',
              errorMessage: 'something broke',
            },
            responseContent: 'oops',
          },
        ],
      };
      const {getByTestId, queryByTestId} = render(
        <TalentSurface step={step} />,
      );
      expect(getByTestId('tool-error-block')).toBeTruthy();
      // Chip is suppressed by the error-takes-priority rule.
      expect(queryByTestId('tool-used-chip')).toBeNull();
    });
  });

  // ---------- Per-call metrics flow ----------
  //
  // Generation metrics are attached to step.toolCalls[i].metrics by
  // the runner. TalentSurface forwards them to the chip (inline
  // suffix) or renders a sibling ToolMetricsFooter beneath the
  // talent UI's result. Both paths must degrade gracefully when
  // metrics are absent (older persisted calls).
  describe('per-call metrics', () => {
    it('renders ToolMetricsFooter beneath a talent UI when metrics are present', () => {
      talentUIRegistry.register({
        name: 'render_html',
        renderResult: () => <Text testID="html-preview">preview</Text>,
      });
      const step: AgentStep = {
        toolCalls: [
          {
            id: 'c0',
            function: {name: 'render_html', arguments: '{}'},
            metrics: {tokens: 1500, durationMs: 35000},
          },
        ],
        toolOutcomes: [
          {
            callId: 'c0',
            toolName: 'render_html',
            result: {
              type: 'html',
              html: '<p>x</p>',
              summary: 'preview',
            },
            responseContent: 'preview',
          },
        ],
      };
      const {getByTestId, getByText} = render(<TalentSurface step={step} />);
      expect(getByTestId('html-preview')).toBeTruthy();
      expect(getByTestId('tool-metrics-footer')).toBeTruthy();
      expect(getByText(/1.500 tokens.+35s/)).toBeTruthy();
    });

    it('omits the footer when metrics are absent (older persisted call)', () => {
      talentUIRegistry.register({
        name: 'render_html',
        renderResult: () => <Text testID="html-preview">preview</Text>,
      });
      const step: AgentStep = {
        toolCalls: [
          {id: 'c0', function: {name: 'render_html', arguments: '{}'}},
        ],
        toolOutcomes: [
          {
            callId: 'c0',
            toolName: 'render_html',
            result: {
              type: 'html',
              html: '<p>x</p>',
              summary: 'preview',
            },
            responseContent: 'preview',
          },
        ],
      };
      const {getByTestId, queryByTestId} = render(
        <TalentSurface step={step} />,
      );
      expect(getByTestId('html-preview')).toBeTruthy();
      expect(queryByTestId('tool-metrics-footer')).toBeNull();
    });

    it('passes metrics through to ToolUsedChip for unregistered talents', () => {
      const step: AgentStep = {
        toolCalls: [
          {
            id: 'c0',
            function: {name: 'datetime', arguments: '{}'},
            metrics: {tokens: 7, durationMs: 1200},
          },
        ],
        toolOutcomes: [
          {
            callId: 'c0',
            toolName: 'datetime',
            result: {type: 'text', summary: '8:28 AM'},
            responseContent: '8:28 AM',
          },
        ],
      };
      const {getByText} = render(<TalentSurface step={step} />);
      expect(getByText(/used datetime.+7 tokens.+1s/)).toBeTruthy();
    });
  });
});
