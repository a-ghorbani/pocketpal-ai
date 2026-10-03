import NativeVoiceChatLauncher from '../specs/NativeVoiceChatLauncher';

export const setVoiceChatLauncherEnabled = (enabled: boolean) => {
  NativeVoiceChatLauncher?.setEnabled(enabled).catch(error => {
    console.error('Failed to update the voice chat launcher:', error);
  });
};
