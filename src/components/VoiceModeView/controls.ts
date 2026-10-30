import {createContext, useContext} from 'react';

export interface VoiceModeControls {
  tapCloud(): void;
  toggleMute(): void;
  end(): void;
}

const noop = () => {};

/** The running voice session's actions, provided by the chat screen. */
export const VoiceModeControlsContext = createContext<VoiceModeControls>({
  tapCloud: noop,
  toggleMute: noop,
  end: noop,
});

export const useVoiceModeControls = () => useContext(VoiceModeControlsContext);
