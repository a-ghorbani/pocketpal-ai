import React from 'react';

import {fireEvent, render} from '../../../../jest/test-utils';
import {ToolConfirmationSheet} from '../ToolConfirmationSheet';

const SECRET = 'k-12345';

describe('ToolConfirmationSheet', () => {
  const baseProps = {
    isVisible: true,
    toolName: 'add_note',
    argsJson: JSON.stringify({id: 'n1', text: 'hello'}, null, 2),
    detail: 'POST http://127.0.0.1:8765/notes/{{id}}',
    onApprove: jest.fn(),
    onDecline: jest.fn(),
  };

  const renderSheet = (props = {}) =>
    render(<ToolConfirmationSheet {...baseProps} {...props} />, {
      withBottomSheetProvider: true,
    });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the tool name, the request line and the pretty arguments', () => {
    const {getByTestId} = renderSheet();

    expect(getByTestId('tool-confirmation-sheet')).toBeTruthy();
    expect(getByTestId('tool-confirmation-detail')).toHaveTextContent(
      'POST http://127.0.0.1:8765/notes/{{id}}',
    );
    expect(getByTestId('tool-confirmation-arguments')).toHaveTextContent(
      /"id": "n1"/,
    );
  });

  it('leaves placeholders unresolved and shows no credential', () => {
    const {queryByText, getByTestId} = renderSheet();

    expect(getByTestId('tool-confirmation-detail')).toHaveTextContent(
      /\{\{id\}\}/,
    );
    expect(queryByText(new RegExp(SECRET))).toBeNull();
    expect(queryByText(/Authorization/i)).toBeNull();
  });

  it('renders without a request line when the engine declares none', () => {
    const {queryByTestId} = renderSheet({detail: null});
    expect(queryByTestId('tool-confirmation-detail')).toBeNull();
  });

  it('reports approve and decline separately', () => {
    const {getByTestId} = renderSheet();

    fireEvent.press(getByTestId('tool-confirmation-approve'));
    expect(baseProps.onApprove).toHaveBeenCalledTimes(1);
    expect(baseProps.onDecline).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('tool-confirmation-decline'));
    expect(baseProps.onDecline).toHaveBeenCalledTimes(1);
  });
});
