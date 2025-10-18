/**
 * @format
 */

import 'react-native';
import React from 'react';
import App from '../App';
jest.useFakeTimers(); // Mock all timers

// Note: import explicitly to use the types shipped with jest.
import {it} from '@jest/globals';

import {render} from '@testing-library/react-native';

it('renders correctly', () => {
  const result = render(<App />);
  expect(result).toBeDefined();
});
