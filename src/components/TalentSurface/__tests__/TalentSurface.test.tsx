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

  // The four-priority dispatch (WHAT §4a): error > talent UI > chip > none.

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

  it('#5 multi-tool turn renders blocks in step.toolCalls array order (I2)', () => {
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
});
