export type CreatorField =
  | 'title'
  | 'description'
  | 'system_prompt'
  | 'model_reference'
  | 'model_settings'
  | 'pact'
  | 'greeting'
  | 'categories'
  | 'tags'
  | 'thumbnail_url'
  | 'creator'
  | 'protection_level';

export type CreatorContent = Partial<Record<CreatorField, unknown>>;

type RawPal = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const names = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(item => (isRecord(item) ? item.name : item))
    : value;

const projectPact = (value: unknown): unknown => {
  if (!isRecord(value) || !Array.isArray(value.talents)) {
    return value;
  }
  return {
    talents: value.talents.map(talent =>
      isRecord(talent)
        ? {name: talent.name, required: talent.required}
        : talent,
    ),
  };
};

const projectGreeting = (value: unknown): unknown =>
  isRecord(value)
    ? {text: value.text, suggested_prompts: value.suggested_prompts}
    : value;

const projectCreator = (raw: RawPal): unknown => {
  const creator = isRecord(raw.creator) ? raw.creator : {};
  return {
    id: raw.creator_id ?? creator.id,
    display_name: creator.display_name,
    avatar_url: creator.avatar_url,
  };
};

const PROJECT: Record<CreatorField, (raw: RawPal) => unknown> = {
  title: raw => raw.title,
  description: raw => raw.description,
  system_prompt: raw => raw.system_prompt,
  model_reference: raw => raw.model_reference,
  model_settings: raw => raw.model_settings,
  pact: raw => projectPact(raw.pact),
  greeting: raw => projectGreeting(raw.greeting),
  categories: raw => names(raw.categories),
  tags: raw => names(raw.tags),
  thumbnail_url: raw => raw.thumbnail_url,
  creator: projectCreator,
  protection_level: raw => raw.protection_level,
};

export const CREATOR_FIELDS = Object.keys(PROJECT) as CreatorField[];

export const projectCreatorContent = (raw: RawPal): CreatorContent =>
  Object.fromEntries(CREATOR_FIELDS.map(field => [field, PROJECT[field](raw)]));

export const normalise = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.length > 0
      ? value.map(item => normalise(item) ?? null)
      : undefined;
  }
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .map(key => [key, normalise(value[key])] as const)
      .filter(([, item]) => item !== undefined);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }
  return value;
};

const sameValue = (a: unknown, b: unknown): boolean =>
  JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));

export const changedCreatorFields = (
  applied: CreatorContent | undefined,
  next: CreatorContent,
): ReadonlySet<CreatorField> =>
  new Set(
    CREATOR_FIELDS.filter(
      field => !applied || !sameValue(applied[field], next[field]),
    ),
  );
