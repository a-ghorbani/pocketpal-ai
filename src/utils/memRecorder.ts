import NativeHardwareInfo from '../specs/NativeHardwareInfo';

export async function startMemRecorder(): Promise<void> {
  try {
    const path = await NativeHardwareInfo.startMemoryRecorder(250);
    console.log('[memrec] recording to', path);
  } catch (e) {
    console.warn('[memrec] start failed', e);
  }
}

export function memMark(label: string): void {
  try {
    NativeHardwareInfo.markMemoryRecorder(label);
  } catch {}
}
