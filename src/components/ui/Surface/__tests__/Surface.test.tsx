import React from 'react';
import {StyleSheet, Text} from 'react-native';

import {Surface} from '../Surface';
import {runSnapshotMatrix} from '../../__tests__/helpers/snapshotMatrix';
import {render as renderWithTheme} from '../../../../../jest/test-utils';

describe('Surface', () => {
  it('forwards testID, additive style, and renders children', () => {
    const {getByTestId, getByText} = renderWithTheme(
      <Surface testID="surf" style={{margin: 8}}>
        <Text>hello</Text>
      </Surface>,
    );
    expect(getByText('hello')).toBeTruthy();
    const el = getByTestId('surf');
    const flat = StyleSheet.flatten(el.props.style);
    expect(flat.margin).toBe(8);
  });

  it('defaults elevation to 1 to match Paper Surface', () => {
    const {getByTestId} = renderWithTheme(
      <Surface testID="surf">
        <Text>x</Text>
      </Surface>,
    );
    const flat = StyleSheet.flatten(getByTestId('surf').props.style);
    expect(flat.elevation).toBe(1);
  });

  it('passes explicit elevation through', () => {
    const {getByTestId} = renderWithTheme(
      <Surface testID="surf" elevation={0}>
        <Text>x</Text>
      </Surface>,
    );
    const flat = StyleSheet.flatten(getByTestId('surf').props.style);
    expect(flat.elevation).toBe(0);
  });

  it('defaults radius to none — no implicit corners', () => {
    const {getByTestId} = renderWithTheme(
      <Surface testID="surf">
        <Text>x</Text>
      </Surface>,
    );
    const flat = StyleSheet.flatten(getByTestId('surf').props.style);
    expect(flat.borderRadius).toBeUndefined();
  });

  it('applies explicit radius token', () => {
    const {getByTestId} = renderWithTheme(
      <Surface testID="surf" radius="l">
        <Text>x</Text>
      </Surface>,
    );
    const flat = StyleSheet.flatten(getByTestId('surf').props.style);
    expect(flat.borderRadius).toBe(20);
  });

  it('does not synthesise iOS shadow props — consumer-owned per pocketpal pattern', () => {
    const {getByTestId} = renderWithTheme(
      <Surface testID="surf" elevation={3}>
        <Text>x</Text>
      </Surface>,
    );
    const flat = StyleSheet.flatten(getByTestId('surf').props.style);
    expect(flat.shadowColor).toBeUndefined();
    expect(flat.shadowOpacity).toBeUndefined();
    expect(flat.shadowOffset).toBeUndefined();
    expect(flat.shadowRadius).toBeUndefined();
  });

  it('exposes a default accessibilityRole of none', () => {
    const {getByTestId} = renderWithTheme(
      <Surface testID="surf">
        <Text>x</Text>
      </Surface>,
    );
    expect(getByTestId('surf').props.accessibilityRole).toBe('none');
  });
});

runSnapshotMatrix(
  'Surface',
  ({variant: _v, size: _s, state}) => (
    <Surface
      testID="surf"
      style={state === 'disabled' ? {opacity: 0.5} : undefined}>
      <Text>surface body</Text>
    </Surface>
  ),
  {
    variants: ['default'] as const,
    sizes: ['default'] as const,
    langs: ['fa'] as const,
  },
);
