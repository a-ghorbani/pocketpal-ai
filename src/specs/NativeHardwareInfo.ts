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

export interface MemoryProfile {
  /** iOS: phys_footprint via task_info. Bytes. */
  phys_footprint?: number;
  /** Android: PSS total via Debug.getPss(). Bytes. */
  pss_total?: number;
  /** Android only: native heap allocated. Bytes. */
  native_heap_allocated?: number;
  /** Available memory from OS. Bytes. */
  available_memory: number;
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
   * Get detailed memory profile with platform-specific metrics.
   * - iOS: phys_footprint + available_memory
   * - Android: pss_total + native_heap_allocated + available_memory
   */
  getMemoryProfile(): Promise<MemoryProfile>;
  /**
   * Collect memory metrics and write a snapshot entry to disk.
   * Appends to Documents/memory-snapshots.json (iOS) or filesDir/memory-snapshots.json (Android).
   */
  writeMemorySnapshot(label: string): Promise<{label: string; status: string}>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('HardwareInfo');
