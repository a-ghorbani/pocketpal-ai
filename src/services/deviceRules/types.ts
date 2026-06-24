// Parsed wire shape of `rules.<platform>.json` plus the device signals the
// classifier consumes. Each tier entry is a thin, flat candidate; the app
// synthesizes the minimal `{hfModel, modelFile}` pair `hfAsModel` reads at
// stub-build time and defers HF-derivable data (oid/lfs/templates) to download.

export type Tier = 'low' | 'mid' | 'high' | 'flagship';

export type SocClass = string; // 'budget'|'mid'|'flagship' (Android) | 'entry'|'mid'|'flagship' (iOS)

export interface RamBand {
  id: string;
  maxBytes: number | null; // null = top (unbounded) band
}

export interface TierMatrixEntry {
  ramBand: string;
  socClass: SocClass;
  tier: Tier;
}

export interface DeviceFamilyRule {
  match: {
    idPrefix?: string;
    idMajorMin?: number;
    minRamBytes?: number;
  };
  class: SocClass;
}

export interface CpuHeuristicRule {
  match: {
    featuresAny?: string[];
    featuresAll?: string[];
    maxFreqMhzMin?: number;
  };
  class: SocClass;
}

export interface Classifier {
  ramBands: RamBand[];
  tierMatrix: TierMatrixEntry[];
  // iOS
  deviceIdToChip?: Record<string, string>;
  chipToClass?: Record<string, SocClass>;
  deviceFamilyFallback?: DeviceFamilyRule[];
  // Android
  socModelToClass?: Record<string, SocClass>;
  hardwareToClass?: Record<string, SocClass>;
  cpuHeuristic?: CpuHeuristicRule[];
}

// Explicit projector reference for a multimodal candidate. The mmproj quant is
// fixed by the authored hf_filename; the app does no quant-match discovery.
export interface RuleMmproj {
  hfRepo: string;
  hfFilename: string;
  sizeBytes: number;
  modalities?: string[]; // forward-compat hint; engine reports actual support at load
}

// Explicit speculative-decoding draft reference for a candidate. Unlike mmproj,
// the draft is usually a DIFFERENT repo, so it is parsed via its own path (not
// hfAsModel sibling pairing) and gets its own download stub.
export interface RuleDraft {
  hfRepo: string;
  hfFilename: string;
  sizeBytes: number;
}

// One flat candidate from the wire `tiers[T].candidates[]` array (parsed into
// the internal `tiers[T].models[]`). The app builds a minimal {hfModel,
// modelFile} pair from it and feeds the unchanged hfAsModel; HF-derivable data
// resolves at download. Informational fields (quant/obs_tg/sha256/native_low_bit)
// are dropped at parse.
export interface RuleCandidate {
  model: string; // stable identity key, not used as the Model id
  displayName?: string; // optional UI name; falls back to the derived name
  hfRepo: string; // "author/repo"
  hfFilename: string;
  params?: number;
  sizeBytes?: number;
  minRamGb?: number;
  multimodal?: boolean;
  mmproj?: RuleMmproj; // present iff multimodal
  draft?: RuleDraft; // optional speculative-decoding draft model (cross-repo)
}

export interface DeviceRules {
  schemaVersion: string;
  platform: string;
  rulesVersion: string;
  classifier: Classifier;
  tiers: Record<Tier, {models: RuleCandidate[]}>;
}

export interface DeviceSignals {
  ramBytes: number;
  machine?: string; // iOS utsname.machine (RNDeviceInfo.getDeviceId)
  socModel?: string; // Android Build.SOC_MODEL
  hardware?: string; // Android Build.HARDWARE
  cpuFeatures?: string[]; // i8mm / sve2 / dotprod
  maxFreqMhz?: number; // Android big-core max freq
}
