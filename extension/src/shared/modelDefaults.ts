import browser from 'webextension-polyfill'

export interface ModelDefault {
  id: string
  name: string
  modelIds: string[]
  updatedAt: number
}

export const MAX_MODEL_DEFAULTS = 5

const STORAGE_KEY = 'modelDefaults'
const LAST_USED_KEY = 'lastModelDefaultId'

function normalizeDefault(value: unknown): ModelDefault | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ModelDefault>
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.name !== 'string' ||
    !Array.isArray(candidate.modelIds)
  ) {
    return null
  }
  const modelIds = candidate.modelIds.filter((id): id is string => typeof id === 'string')
  const name = candidate.name.trim()
  if (!name || modelIds.length === 0) return null
  return {
    id: candidate.id,
    name,
    modelIds,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
  }
}

export async function listModelDefaults(): Promise<ModelDefault[]> {
  const result = await browser.storage.local.get(STORAGE_KEY)
  const raw = result[STORAGE_KEY]
  if (!Array.isArray(raw)) return []
  return raw
    .map(normalizeDefault)
    .filter((entry): entry is ModelDefault => entry != null)
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, MAX_MODEL_DEFAULTS)
}

async function persistDefaults(defaults: ModelDefault[]): Promise<ModelDefault[]> {
  const next = defaults.slice(0, MAX_MODEL_DEFAULTS)
  await browser.storage.local.set({ [STORAGE_KEY]: next })
  return next
}

export type SaveModelDefaultResult =
  | { status: 'saved'; defaults: ModelDefault[]; saved: ModelDefault }
  | { status: 'limit'; defaults: ModelDefault[] }
  | { status: 'invalid'; defaults: ModelDefault[] }

/**
 * Create a new named default, or update an existing one that shares the same
 * (case-insensitive) name. Enforces the {@link MAX_MODEL_DEFAULTS} limit for new
 * entries.
 */
export async function saveModelDefault(params: {
  name: string
  modelIds: string[]
}): Promise<SaveModelDefaultResult> {
  const name = params.name.trim()
  const modelIds = [...new Set(params.modelIds.filter((id) => typeof id === 'string'))]
  const existing = await listModelDefaults()

  if (!name || modelIds.length === 0) {
    return { status: 'invalid', defaults: existing }
  }

  const lowerName = name.toLowerCase()
  const matchIndex = existing.findIndex((entry) => entry.name.toLowerCase() === lowerName)

  if (matchIndex >= 0) {
    const saved: ModelDefault = {
      ...existing[matchIndex],
      name,
      modelIds,
      updatedAt: Date.now(),
    }
    const next = existing.map((entry, index) => (index === matchIndex ? saved : entry))
    const defaults = await persistDefaults(next)
    return { status: 'saved', defaults, saved }
  }

  if (existing.length >= MAX_MODEL_DEFAULTS) {
    return { status: 'limit', defaults: existing }
  }

  const saved: ModelDefault = {
    id: crypto.randomUUID(),
    name,
    modelIds,
    updatedAt: Date.now(),
  }
  const defaults = await persistDefaults([...existing, saved])
  return { status: 'saved', defaults, saved }
}

export async function deleteModelDefault(id: string): Promise<ModelDefault[]> {
  const existing = await listModelDefaults()
  const next = existing.filter((entry) => entry.id !== id)
  const persisted = await persistDefaults(next)
  const lastUsed = await getLastModelDefaultId()
  if (lastUsed === id) {
    await setLastModelDefaultId(null)
  }
  return persisted
}

/**
 * The id of the default that new tabs should open with. Updated whenever a
 * default is selected or (re)saved. Reading it never mutates other tabs.
 */
export async function getLastModelDefaultId(): Promise<string | null> {
  const result = await browser.storage.local.get(LAST_USED_KEY)
  const value = result[LAST_USED_KEY]
  return typeof value === 'string' ? value : null
}

export async function setLastModelDefaultId(id: string | null): Promise<void> {
  if (id) {
    await browser.storage.local.set({ [LAST_USED_KEY]: id })
  } else {
    await browser.storage.local.remove(LAST_USED_KEY)
  }
}
