import React from 'react';
import {Text} from 'react-native';
import {fireEvent} from '@testing-library/react-native';
import {render} from '../../../../jest/test-utils';
import {ResponseBubble} from '../ResponseBubble';

// Mock LayoutAnimation
jest.mock('react-native/Libraries/LayoutAnimation/LayoutAnimation', () => ({
  configureNext: jest.fn(),
  Types: {
    easeInEaseOut: 'easeInEaseOut',
    spring: 'spring',
  },
  Properties: {
    opacity: 'opacity',
  },
}));

describe('ResponseBubble', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Content Display', () => {
    it('should display children content to the user', () => {
      const {getByText} = render(
        <ResponseBubble>
          <Text>Hello, this is a response</Text>
        </ResponseBubble>,
      );

      expect(getByText('Hello, this is a response')).toBeTruthy();
    });

    it('should update displayed content when children change', () => {
      const {rerender, getByText, queryByText} = render(
        <ResponseBubble>
          <Text>Initial message</Text>
        </ResponseBubble>,
      );

      expect(getByText('Initial message')).toBeTruthy();

      rerender(
        <ResponseBubble>
          <Text>Updated message</Text>
        </ResponseBubble>,
      );

      expect(getByText('Updated message')).toBeTruthy();
      expect(queryByText('Initial message')).toBeNull();
    });

    it('should handle empty content gracefully', () => {
      const {queryByTestId} = render(<ResponseBubble />);
      // Should render without crashing
      expect(queryByTestId('masked-view')).toBeNull(); // Starts expanded
    });
  });

  describe('Expand/Collapse Behavior', () => {
    it('should start in expanded state showing full content', () => {
      const {queryByTestId} = render(
        <ResponseBubble>
          <Text>Content</Text>
        </ResponseBubble>,
      );

      // MaskedView is only used in partial state
      expect(queryByTestId('masked-view')).toBeNull();
    });

    it('should toggle to partial state when user taps the bubble', () => {
      const {getByText, queryByTestId} = render(
        <ResponseBubble>
          <Text>Content</Text>
        </ResponseBubble>,
      );

      // Initially expanded (no mask)
      expect(queryByTestId('masked-view')).toBeNull();

      // Tap to collapse
      fireEvent.press(getByText('Content'));

      // Now in partial state (with mask)
      expect(queryByTestId('masked-view')).toBeTruthy();
    });

    it('should toggle back to expanded when tapped again', () => {
      const {getByText, queryByTestId} = render(
        <ResponseBubble>
          <Text>Content</Text>
        </ResponseBubble>,
      );

      // Tap to collapse
      fireEvent.press(getByText('Content'));
      expect(queryByTestId('masked-view')).toBeTruthy();

      // Tap to expand
      fireEvent.press(getByText('Content'));
      expect(queryByTestId('masked-view')).toBeNull();
    });
  });
});
