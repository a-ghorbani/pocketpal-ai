import {MMProjRegex} from '../../utils/multimodalPatterns';
import {
  Classifier,
  CpuHeuristicRule,
  DeviceFamilyRule,
  DeviceRules,
  RamBand,
  RuleCandidate,
  RuleMmproj,
  Tier,
  TierMatrixEntry,
} from './types';

// Parse-guard: turns the raw wire JSON into a typed DeviceRules or throws on a
// structurally invalid file. Unknown/extra fields are ignored. A candidate
// missing a required field, or with an unsafe path segment, is skipped; an
// old-schema or empty tier parses to an empty model list (does not throw).

const TIERS: Tier[] = ['low', 'mid', 'high', 'flagship'];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// The download URL is derived from a hard-coded huggingface.co template, so this
// host check is defense-in-depth only — the real boundary is isSafePathSegment
// on the path parts. huggingface.co is the only host the app's HF token is sent
// to (DownloadManager host-gates the Bearer header).
const isHuggingFaceUrl = (url: unknown): url is string => {
  if (typeof url !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.host === 'huggingface.co';
  } catch {
    return false;
  }
};

// A wire-supplied path part (author, repo, filename) flows into both the derived
// download URL and the local model path, so reject anything that is not a plain
// segment (no path separators, no parent-dir traversal).
const isSafePathSegment = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  !v.includes('/') &&
  !v.includes('\\') &&
  // With separators already disallowed, only an exact "."/".." segment can
  // traverse — reject those, but allow a literal ".." inside a longer name.
  v !== '.' &&
  v !== '..';

const asString = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : undefined;

const asNumber = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const asStringMap = (v: unknown): Record<string, string> | undefined => {
  if (!isObject(v)) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    const s = asString(val);
    if (s !== undefined) {
      out[k] = s;
    }
  }
  return out;
};

const parseRamBands = (v: unknown): RamBand[] => {
  if (!Array.isArray(v)) {
    throw new Error('classifier.ram_bands missing or not an array');
  }
  return v.map(raw => {
    if (!isObject(raw) || typeof raw.id !== 'string') {
      throw new Error('invalid ram_band entry');
    }
    const maxBytes =
      raw.max_bytes === null ? null : (asNumber(raw.max_bytes) ?? null);
    return {id: raw.id, maxBytes};
  });
};

const parseTierMatrix = (v: unknown): TierMatrixEntry[] => {
  if (!Array.isArray(v)) {
    throw new Error('classifier.tier_matrix missing or not an array');
  }
  const out: TierMatrixEntry[] = [];
  for (const raw of v) {
    if (
      !isObject(raw) ||
      typeof raw.ram_band !== 'string' ||
      typeof raw.soc_class !== 'string' ||
      typeof raw.tier !== 'string' ||
      !TIERS.includes(raw.tier as Tier)
    ) {
      continue;
    }
    out.push({
      ramBand: raw.ram_band,
      socClass: raw.soc_class,
      tier: raw.tier as Tier,
    });
  }
  return out;
};

const parseDeviceFamily = (v: unknown): DeviceFamilyRule[] | undefined => {
  if (!isObject(v) || !Array.isArray(v.rules)) {
    return undefined;
  }
  const out: DeviceFamilyRule[] = [];
  for (const raw of v.rules) {
    if (
      !isObject(raw) ||
      !isObject(raw.match) ||
      typeof raw.class !== 'string'
    ) {
      continue;
    }
    out.push({
      match: {
        idPrefix: asString(raw.match.id_prefix),
        idMajorMin: asNumber(raw.match.id_major_min),
        minRamBytes: asNumber(raw.match.min_ram_bytes),
      },
      class: raw.class,
    });
  }
  return out;
};

const parseCpuHeuristic = (v: unknown): CpuHeuristicRule[] | undefined => {
  if (!isObject(v) || !Array.isArray(v.rules)) {
    return undefined;
  }
  const out: CpuHeuristicRule[] = [];
  for (const raw of v.rules) {
    if (
      !isObject(raw) ||
      !isObject(raw.match) ||
      typeof raw.class !== 'string'
    ) {
      continue;
    }
    const featuresAny = Array.isArray(raw.match.features_any)
      ? (raw.match.features_any.filter(f => typeof f === 'string') as string[])
      : undefined;
    const featuresAll = Array.isArray(raw.match.features_all)
      ? (raw.match.features_all.filter(f => typeof f === 'string') as string[])
      : undefined;
    out.push({
      match: {
        featuresAny,
        featuresAll,
        maxFreqMhzMin: asNumber(raw.match.max_freq_mhz_min),
      },
      class: raw.class,
    });
  }
  return out;
};

const parseClassifier = (v: unknown): Classifier => {
  if (!isObject(v)) {
    throw new Error('classifier missing');
  }
  return {
    ramBands: parseRamBands(v.ram_bands),
    tierMatrix: parseTierMatrix(v.tier_matrix),
    deviceIdToChip: asStringMap(v.device_id_to_chip),
    chipToClass: asStringMap(v.chip_to_class),
    deviceFamilyFallback: parseDeviceFamily(v.device_family_fallback),
    socModelToClass: asStringMap(v.soc_model_to_class),
    hardwareToClass: asStringMap(v.hardware_to_class),
    cpuHeuristic: parseCpuHeuristic(v.cpu_heuristic),
  };
};

// Deterministic public download URL. Shared with stub-build so parse and the
// consumer agree on the exact shape; the host is hard-coded here.
export const deriveUrl = (repo: string, filename: string): string =>
  `https://huggingface.co/${repo}/resolve/main/${filename}`;

// Split "author/repo" and return the two parts only if there are exactly two
// non-empty ones. Anything else (zero or ≥2 slashes, empty part) → null.
const splitRepo = (repo: unknown): [string, string] | null => {
  if (typeof repo !== 'string') {
    return null;
  }
  const parts = repo.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return [parts[0], parts[1]];
};

// Validate every path segment of a repo/filename pair before it is used to
// derive a download URL or a local path. Returns the validated repo on success.
const guardRepoFilename = (repo: unknown, filename: unknown): string | null => {
  const split = splitRepo(repo);
  if (!split) {
    return null;
  }
  const [author, repoName] = split;
  if (
    !isSafePathSegment(author) ||
    !isSafePathSegment(repoName) ||
    !isSafePathSegment(filename)
  ) {
    return null;
  }
  // The preset list is GGUF-only; reject any other file type so a stray entry
  // can't surface an undownloadable/non-loadable model (mmproj adds a stricter
  // projector-name check on top of this).
  if (!/\.gguf$/i.test(filename as string)) {
    return null;
  }
  // Defense-in-depth: the derived URL host is hard-coded, so this never fails.
  if (!isHuggingFaceUrl(deriveUrl(repo as string, filename as string))) {
    return null;
  }
  return repo as string;
};

const parseMmproj = (v: unknown, candidateRepo: string): RuleMmproj | null => {
  if (!isObject(v)) {
    return null;
  }
  const sizeBytes = asNumber(v.size_bytes);
  if (sizeBytes === undefined) {
    return null;
  }
  if (!guardRepoFilename(v.hf_repo, v.hf_filename)) {
    return null;
  }
  // Cross-repo projectors are not supported: the synthesized projector id is
  // built from the LLM repo while its download url derives from the mmproj repo,
  // so a mismatch would split the two silently. Drop such a candidate.
  if (v.hf_repo !== candidateRepo) {
    return null;
  }
  // The projector filename must match the mmproj pattern, otherwise vision
  // detection (isVisionRepo/getMmprojFiles) would not recognize it and the
  // model would degrade to a plain LLM with no projector. guardRepoFilename
  // above has already proven hf_filename is a safe string.
  if (!MMProjRegex.test(v.hf_filename as string)) {
    return null;
  }
  const modalities = Array.isArray(v.modalities)
    ? (v.modalities.filter(m => typeof m === 'string') as string[])
    : undefined;
  return {
    hfRepo: v.hf_repo as string,
    hfFilename: v.hf_filename as string,
    sizeBytes,
    modalities,
  };
};

const parseCandidate = (v: unknown): RuleCandidate | null => {
  if (!isObject(v) || typeof v.model !== 'string') {
    return null;
  }
  if (!guardRepoFilename(v.hf_repo, v.hf_filename)) {
    return null;
  }
  // size_bytes is required: without it the resolved model has size 0, and
  // hasEnoughSpace() returns false — an undownloadable card. Drop the candidate
  // (mmproj enforces the same for the projector).
  const sizeBytes = asNumber(v.size_bytes);
  if (sizeBytes === undefined) {
    return null;
  }
  const multimodal = v.multimodal === true;
  let mmproj: RuleMmproj | undefined;
  if (multimodal) {
    // A multimodal candidate with an invalid projector reference is dropped
    // entirely — never ship a vision model with an unvalidated projector path.
    const parsed = parseMmproj(v.mmproj, v.hf_repo as string);
    if (!parsed) {
      return null;
    }
    mmproj = parsed;
  }
  return {
    model: v.model,
    displayName: asString(v.display_name),
    hfRepo: v.hf_repo as string,
    hfFilename: v.hf_filename as string,
    params: asNumber(v.params),
    sizeBytes,
    minRamGb: asNumber(v.min_ram_gb),
    multimodal: multimodal || undefined,
    mmproj,
  };
};

const parseTiers = (v: unknown): DeviceRules['tiers'] => {
  if (!isObject(v)) {
    throw new Error('tiers missing');
  }
  const tiers = {} as DeviceRules['tiers'];
  for (const tier of TIERS) {
    const raw = v[tier];
    const models =
      isObject(raw) && Array.isArray(raw.candidates)
        ? raw.candidates
            .map(parseCandidate)
            .filter((c): c is RuleCandidate => c !== null)
        : [];
    tiers[tier] = {models};
  }
  return tiers;
};

export function parseDeviceRules(raw: unknown): DeviceRules {
  if (!isObject(raw)) {
    throw new Error('rules root is not an object');
  }
  const platform = asString(raw.platform);
  const rulesVersion = asString(raw.rules_version);
  const schemaVersion = asString(raw.schema_version);
  if (!platform || !rulesVersion || !schemaVersion) {
    throw new Error('rules missing platform / rules_version / schema_version');
  }
  return {
    platform,
    rulesVersion,
    schemaVersion,
    classifier: parseClassifier(raw.classifier),
    tiers: parseTiers(raw.tiers),
  };
}
