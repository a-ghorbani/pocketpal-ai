import {renderHook} from '@testing-library/react-native';

import {useVoiceModeControls} from '../controls';

describe('useVoiceModeControls', () => {
  it('outside a voice session, the controls do nothing', () => {
    const {result} = renderHook(() => useVoiceModeControls());

    expect(() => {
      result.current.tapCloud();
      result.current.toggleMute();
      result.current.end();
    }).not.toThrow();
  });
});
