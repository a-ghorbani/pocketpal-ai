import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface CPUProcessor {
  processor?: string;
  'model name'?: string;
  'cpu MHz'?: string;
  vendor_id?: string;
}

export interface CPUInfo {
  cores: number;
  processors?: CPUProcessor[];
  features?: string[];
  hasFp16?: boolean;
  hasDotProd?: boolean;
  hasSve?: boolean;
  hasI8mm?: boolean;
  socModel?: string;
}

export interface GPUInfo {
  renderer: string;
  vendor: string;
  version: string;
  hasAdreno: boolean;
  hasMali: boolean;
  hasPowerVR: boolean;
  supportsOpenCL: boolean;
  gpuType: string;
}

export interface Spec extends TurboModule {
  getCPUInfo(): Promise<CPUInfo>;
  getGPUInfo(): Promise<GPUInfo>;
  getChipset?(): Promise<string>; // Android only
  /**
   * Get available memory in bytes from the operating system.
   * - Android: Uses ActivityManager.getMemoryInfo() to get availMem
   * - iOS: Uses os_proc_available_memory()
   * @returns Promise<number> Available memory in bytes
   */
  getAvailableMemory(): Promise<number>;
  /**
   * Collect memory metrics and write a snapshot entry to disk.
   * Appends to Documents/memory-snapshots.json (iOS) or externalFilesDir/memory-snapshots.json (Android).
   */
  writeMemorySnapshot(label: string): Promise<{label: string; status: string}>;
  /**
   * Hint the native allocator to release fully-free pages back to the
   * kernel. Best-effort: resolves with `purged: false` on platforms
   * without an underlying mechanism (iOS, Android < API 28).
   * `rss_kb_before`/`after` are sampled from /proc/self/status so
   * callers can record actual reclaim per call.
   */
  purgeNativeAllocator(): Promise<{
    purged: boolean;
    rss_kb_before: number;
    rss_kb_after: number;
  }>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('HardwareInfo');
