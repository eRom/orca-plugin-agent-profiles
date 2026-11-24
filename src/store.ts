// Modèle de données du plugin : types, validation et analyse des lignes d'environnement.
// Fonctions pures, sans dépendance à l'hôte Orca.
import { agentById } from './agents'
import type { Messages } from './copy'

export const STORE_KEY = 'store.v2'

export type Provider = {
  id: string
  name: string
  baseUrl: string
  /** Une valeur `$NOM` (toute la valeur) se résout dans le shell du terminal, au lancement. */
  token: string
  extraEnv: Record<string, string>
}

export type Profile = {
  id: string
  /** Identifiant d'un agent de la table (`src/agents.ts`) ; un profil dont l'agent a disparu reste dans le store. */
  agentId: string
  name: string
  /** Chemin relatif à la racine du plugin : `avatars/x.png` ou `agent-icons/x.png`, ou null. */
  avatar: string | null
  /** Envoyé tel quel au flag de modèle de l'agent ; null laisse le choix d'Orca. */
  model: string | null
  /** Valeur du flag d'effort de l'agent ; null laisse le choix d'Orca. */
  effort: string | null
  /** Seul Claude route par un fournisseur. */
  providerId: string | null
  extraArgs: string[]
}

export type Store = {
  version: 2
  providers: Provider[]
  profiles: Profile[]
  lastProfileId: string | null
  /** Profils épinglés dans la barre d'état, dans l'ordre d'ajout ; absent d'un store antérieur aux favoris, lu vide. */
  favoriteIds: string[]
}

/** Emplacements de la barre d'état déclarés dans le manifeste (`favorite-1` à `favorite-5`). */
export const MAX_FAVORITES = 5

export type FieldErrors = Partial<
  Record<'name' | 'agentId' | 'model' | 'effort' | 'providerId' | 'baseUrl' | 'token' | 'extraEnv', string>
>

export const EMPTY_STORE: Store = { version: 2, providers: [], profiles: [], lastProfileId: null, favoriteIds: [] }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isString = (value: unknown): value is string => typeof value === 'string'

const isNullableString = (value: unknown): value is string | null => value === null || isString(value)

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every(isString)

const isProvider = (value: unknown): value is Provider =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.name) &&
  isString(value.baseUrl) &&
  isString(value.token) &&
  isStringRecord(value.extraEnv)

const isProfile = (value: unknown): value is Profile =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.agentId) &&
  isString(value.name) &&
  isNullableString(value.avatar) &&
  isNullableString(value.model) &&
  isNullableString(value.effort) &&
  isNullableString(value.providerId) &&
  Array.isArray(value.extraArgs) &&
  value.extraArgs.every(isString)

/** Vérifie la forme seule, jamais les références croisées ni l'agent : le hook refuse un profil orphelin au lancement. */
export function parseStore(value: unknown): Store | null {
  if (!isRecord(value) || value.version !== 2) return null
  if (!Array.isArray(value.providers) || !value.providers.every(isProvider)) return null
  if (!Array.isArray(value.profiles) || !value.profiles.every(isProfile)) return null
  if (value.lastProfileId !== null && !isString(value.lastProfileId)) return null
  // Champ ajouté sans changer de version : un store d'avant les favoris garde tous ses profils. Une liste mal formée
  // (édition à la main) se lit vide plutôt que de faire rejeter tout le store, et les doublons tombent.
  const favorites = Array.isArray(value.favoriteIds) ? [...new Set(value.favoriteIds.filter(isString))] : []
  return {
    version: 2,
    providers: value.providers,
    profiles: value.profiles,
    lastProfileId: value.lastProfileId,
    favoriteIds: favorites
  }
}

/** Profils favoris dans l'ordre de la barre d'état ; un id sans profil (store édité à la main) est ignoré. */
export function favoriteProfiles(store: Store): Profile[] {
  return store.favoriteIds.flatMap((id) => store.profiles.find((p) => p.id === id) ?? []).slice(0, MAX_FAVORITES)
}

/** Ajoute en fin de liste ou retire ; refuse un ajout au-delà des emplacements. Retirer un non-favori ne change rien. */
export function setFavorite(store: Store, profileId: string, favorite: boolean, m: Messages): { store: Store } | { error: string } {
  if (!store.profiles.some((p) => p.id === profileId)) return { error: m.profileNotFound }
  // Même objet rendu quand rien ne change : le worker n'écrit alors rien.
  if (store.favoriteIds.includes(profileId) === favorite) return { store }
  const others = store.favoriteIds.filter((id) => id !== profileId)
  if (!favorite) return { store: { ...store, favoriteIds: others } }
  if (favoriteProfiles(store).length >= MAX_FAVORITES) return { error: m.favoritesFull(MAX_FAVORITES) }
  return { store: { ...store, favoriteIds: [...others, profileId] } }
}

export function newId(prefix: 'profile' | 'provider'): string {
  const random = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0')
  return `${prefix}-${Date.now().toString(36)}-${random}`
}

/** Une valeur est une référence d'environnement seulement si elle est un `$NOM` entier. */
export function isEnvReference(value: string): boolean {
  return /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(value)
}

const withoutContextSuffix = (model: string): string => model.replace(/\[1m\]$/i, '')

export function sameModel(a: string, b: string): boolean {
  return withoutContextSuffix(a) === withoutContextSuffix(b)
}

/** Une erreur au plus par champ. Un agent inconnu arrête la validation : sa grammaire manque pour juger le reste. */
export function validateProfile(store: Store, draft: Profile, m: Messages): FieldErrors {
  const errors: FieldErrors = {}
  const name = draft.name.trim()
  if (name === '') errors.name = m.nameRequired
  else if (store.profiles.some((p) => p.id !== draft.id && p.agentId === draft.agentId && p.name.trim() === name)) {
    errors.name = m.nameTaken
  }
  const spec = agentById(draft.agentId)
  if (!spec) {
    errors.agentId = m.agentUnknown
    return errors
  }
  const model = draft.model?.trim() ?? ''
  if (spec.model) {
    if (model === '') errors.model = m.modelRequired
  } else if (draft.model !== null) {
    errors.model = m.modelNotAccepted
  }
  // Le modèle identifie le profil quand Claude le reçoit par le flag `--model` (repli du hook) :
  // seuls les profils Claude à fournisseur doivent être distincts entre eux.
  if (!errors.model && spec.supportsProvider && draft.providerId !== null) {
    const taken = store.profiles.find(
      (p) => p.id !== draft.id && p.agentId === spec.id && p.providerId !== null && p.model !== null && sameModel(p.model, model)
    )
    if (taken) errors.model = m.modelTaken(taken.name)
  }
  if (draft.effort !== null && !spec.effort?.values.includes(draft.effort)) errors.effort = m.effortNotSupported
  if (draft.providerId !== null) {
    if (!spec.supportsProvider) errors.providerId = m.providerClaudeOnly
    else if (!store.providers.some((p) => p.id === draft.providerId)) errors.providerId = m.providerNotFound
  }
  return errors
}

export function validateProvider(_store: Store, draft: Provider, m: Messages): FieldErrors {
  const errors: FieldErrors = {}
  if (draft.name.trim() === '') errors.name = m.nameRequired
  const baseUrl = draft.baseUrl.trim()
  if (baseUrl === '') errors.baseUrl = m.baseUrlRequired
  else if (!/^https?:\/\//i.test(baseUrl)) errors.baseUrl = m.baseUrlScheme
  else if (/\/v1\/?$/i.test(baseUrl)) errors.baseUrl = m.baseUrlNoV1
  if (draft.token.trim() === '') errors.token = m.tokenRequired
  return errors
}

const upsertById = <T extends { id: string }>(items: T[], item: T): T[] =>
  items.some((i) => i.id === item.id) ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item]

export function upsertProfile(store: Store, profile: Profile): Store {
  return { ...store, profiles: upsertById(store.profiles, profile) }
}

export function removeProfile(store: Store, profileId: string): Store {
  return {
    ...store,
    profiles: store.profiles.filter((p) => p.id !== profileId),
    lastProfileId: store.lastProfileId === profileId ? null : store.lastProfileId,
    favoriteIds: store.favoriteIds.filter((id) => id !== profileId)
  }
}

export function upsertProvider(store: Store, provider: Provider): Store {
  return { ...store, providers: upsertById(store.providers, provider) }
}

export function removeProvider(store: Store, providerId: string, m: Messages): { store: Store } | { error: string } {
  const users = store.profiles.filter((p) => p.providerId === providerId)
  if (users.length > 0) return { error: m.providerInUse(users.map((p) => p.name).join(', ')) }
  return { store: { ...store, providers: store.providers.filter((p) => p.id !== providerId) } }
}

/** Une ligne `NOM=valeur` par variable ; la valeur est tout ce qui suit le premier `=`. */
export function parseEnvLines(text: string, m: Messages): { env: Record<string, string> } | { error: string } {
  const env: Record<string, string> = {}
  const lines = text.split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') continue
    const separator = line.indexOf('=')
    const name = separator === -1 ? '' : line.slice(0, separator)
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return { error: m.envLine(index + 1) }
    env[name] = line.slice(separator + 1)
  }
  return { env }
}

export function formatEnvLines(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')
}
