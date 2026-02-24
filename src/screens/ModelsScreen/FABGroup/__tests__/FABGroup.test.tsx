import React from 'react';

import {render} from '../../../../../jest/test-utils';
import {FABGroup} from '../FABGroup';

// FAB.Group from react-native-paper renders all action items in the tree but
// marks them as hidden (accessibilityElementsHidden) when closed.
// Use {includeHiddenElements: true} to query them, following the existing
// ModelsScreen.test.tsx pattern.

describe('FABGroup', () => {
  const mockOnAddHFModel = jest.fn();
  const mockOnAddLocalModel = jest.fn();
  const mockOnAddRemoteModel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the FAB group', () => {
    const {getByTestId} = render(
      <FABGroup
        onAddHFModel={mockOnAddHFModel}
        onAddLocalModel={mockOnAddLocalModel}
        onAddRemoteModel={mockOnAddRemoteModel}
      />,
      {withNavigation: true},
    );

    expect(getByTestId('fab-group')).toBeTruthy();
  });

  it('renders all three action buttons (HF, local, remote)', () => {
    const {getByTestId} = render(
      <FABGroup
        onAddHFModel={mockOnAddHFModel}
        onAddLocalModel={mockOnAddLocalModel}
        onAddRemoteModel={mockOnAddRemoteModel}
      />,
      {withNavigation: true},
    );

    // FAB actions are rendered but hidden when FAB is closed; query with
    // includeHiddenElements following the existing ModelsScreen test pattern
    expect(
      getByTestId('hf-fab', {includeHiddenElements: true}),
    ).toBeTruthy();
    expect(
      getByTestId('local-fab', {includeHiddenElements: true}),
    ).toBeTruthy();
    expect(
      getByTestId('remote-fab', {includeHiddenElements: true}),
    ).toBeTruthy();
  });

  it('renders accessibility labels for all actions', () => {
    const {getByLabelText} = render(
      <FABGroup
        onAddHFModel={mockOnAddHFModel}
        onAddLocalModel={mockOnAddLocalModel}
        onAddRemoteModel={mockOnAddRemoteModel}
      />,
      {withNavigation: true},
    );

    // Accessibility labels for screen readers
    expect(
      getByLabelText('Add from Hugging Face', {includeHiddenElements: true}),
    ).toBeTruthy();
    expect(
      getByLabelText('Add Local Model', {includeHiddenElements: true}),
    ).toBeTruthy();
    expect(
      getByLabelText('Add Remote Model', {includeHiddenElements: true}),
    ).toBeTruthy();
  });
});
