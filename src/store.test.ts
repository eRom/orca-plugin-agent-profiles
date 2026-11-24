import { assert, test } from 'orca/testing'
import { MESSAGES } from './copy'
import {
  favoriteProfiles,
  formatEnvLines,
  isEnvReference,
  MAX_FAVORITES,
  setFavorite,
  parseEnvLines as parseEnvLinesIn,
  parseStore,
  removeProfile,
  removeProvider as removeProviderIn,
  upsertProvider,
  validateProfile as validateProfileIn,
  validateProvider as validateProviderIn,
  type Profile,
  type Provider,
  type Store
} from './store'
import { ARGON, DEEPSEEK, HARNESS, LUNA, OPUS, SAMPLE_STORE } from './test-fixtures'

// Les assertions historiques portent sur le français ; les cas anglais sont en fin de fichier.
const COPY = MESSAGES.fr
const validateProfile = (store: Store, draft: Profile) => validateProfileIn(store, draft, COPY)
const validateProvider = (store: Store, draft: Provider) => validateProviderIn(store, draft, COPY)
const removeProvider = (store: Store, providerId: string) => removeProviderIn(store, providerId, COPY)
const parseEnvLines = (text: string) => parseEnvLinesIn(text, COPY)

test('parses a v2 store and rejects a v1 one', () => {
  assert.deepEqual(parseStore(SAMPLE_STORE), SAMPLE_STORE)
  assert.deepEqual(parseStore(JSON.parse(JSON.stringify(SAMPLE_STORE))), SAMPLE_STORE)
  assert.equal(parseStore({ ...SAMPLE_STORE, version: 1 }), null)
})

test('parseStore refuses a store whose shape is wrong', () => {
  assert.equal(parseStore(null), null)
  assert.equal(parseStore({ ...SAMPLE_STORE, providers: [{ id: 'x' }] }), null)
  assert.equal(parseStore({ ...SAMPLE_STORE, profiles: [{ ...OPUS, extraArgs: 'nope' }] }), null)
  assert.equal(parseStore({ ...SAMPLE_STORE, profiles: [{ ...OPUS, agentId: undefined }] }), null)
})

test('keeps a profile whose agent the table does not know', () => {
  const ghost = { ...ARGON, id: 'ghost', agentId: 'retired-agent' }
  assert.deepEqual(parseStore({ ...SAMPLE_STORE, profiles: [ghost] })?.profiles, [ghost])
})

test('validates a profile against its agent', () => {
  assert.deepEqual(validateProfile(SAMPLE_STORE, { ...ARGON, id: 'x', name: 'Argon' }), { name: COPY.nameTaken })
  assert.deepEqual(validateProfile(SAMPLE_STORE, { ...LUNA, id: 'x', name: 'Argon' }), {})
  assert.deepEqual(validateProfile(SAMPLE_STORE, { ...LUNA, id: 'x', model: null }), { name: COPY.nameTaken, model: COPY.modelRequired })
  assert.deepEqual(validateProfile(SAMPLE_STORE, { ...HARNESS, id: 'x', name: 'H2', model: 'm' }), { model: COPY.modelNotAccepted })
  assert.deepEqual(validateProfile(SAMPLE_STORE, { ...LUNA, id: 'x', name: 'L2', effort: 'ultra' }), {})
  assert.deepEqual(validateProfile(SAMPLE_STORE, { ...ARGON, id: 'x', name: 'A2', effort: 'ultra' }), { effort: COPY.effortNotSupported })
  assert.deepEqual(validateProfile(SAMPLE_STORE, { ...LUNA, id: 'x', name: 'L3', providerId: 'ollama' }), { providerId: COPY.providerClaudeOnly })
  assert.deepEqual(validateProfile(SAMPLE_STORE, { ...OPUS, id: 'x', name: 'O2', providerId: 'gone' }), { providerId: COPY.providerNotFound })
  assert.deepEqual(validateProfile(SAMPLE_STORE, { ...DEEPSEEK, id: 'x', name: 'D2', model: 'deepseek-v4.1-flash:cloud' }), {
    model: COPY.modelTaken('DeepSeek 4.1 Flash')
  })
  assert.deepEqual(validateProfile(SAMPLE_STORE, { ...OPUS, id: 'x', name: 'Opus bis' }), {})
  assert.deepEqual(validateProfile(SAMPLE_STORE, { ...OPUS, id: 'x', agentId: 'nope' }), { agentId: COPY.agentUnknown })
})

test('a profile name is free in another agent and for the profile being edited', () => {
  assert.deepEqual(validateProfile(SAMPLE_STORE, { ...LUNA, name: ' Luna ' }), {})
  assert.deepEqual(validateProfile(SAMPLE_STORE, { ...LUNA, id: 'x', name: ' Luna ' }), { name: COPY.nameTaken })
  assert.deepEqual(validateProfile(SAMPLE_STORE, { ...OPUS, id: 'x', name: ' ' }), { name: COPY.nameRequired })
})

test('the same model is allowed on a Claude profile without provider', () => {
  assert.deepEqual(validateProfile(SAMPLE_STORE, { ...OPUS, id: 'x', name: 'Opus ter', model: 'deepseek-v4.1-flash:cloud' }), {})
})

test('validateProvider checks name, URL scheme and token', () => {
  const base = SAMPLE_STORE.providers[0]!
  assert.deepEqual(validateProvider(SAMPLE_STORE, { ...base, baseUrl: 'localhost:11434' }), {
    baseUrl: "L'URL doit commencer par http:// ou https://."
  })
  assert.deepEqual(validateProvider(SAMPLE_STORE, { ...base, name: '', token: '' }), { name: 'Nom requis.', token: 'Jeton requis.' })
})

test('validateProvider refuses a base URL ending with /v1', () => {
  const base = SAMPLE_STORE.providers[0]!
  const expected = { baseUrl: 'Sans /v1 à la fin : Claude Code ajoute /v1/messages.' }
  assert.deepEqual(validateProvider(SAMPLE_STORE, { ...base, baseUrl: 'https://openrouter.ai/api/v1' }), expected)
  assert.deepEqual(validateProvider(SAMPLE_STORE, { ...base, baseUrl: 'https://openrouter.ai/api/v1/' }), expected)
  assert.deepEqual(validateProvider(SAMPLE_STORE, { ...base, baseUrl: 'https://openrouter.ai/api' }), {})
  // Seul un segment /v1 final est refusé, pas un hôte ou un chemin qui le contient.
  assert.deepEqual(validateProvider(SAMPLE_STORE, { ...base, baseUrl: 'https://v1.example.com/api' }), {})
})

test('a provider in use cannot be removed, an unused one can', () => {
  assert.deepEqual(removeProvider(SAMPLE_STORE, 'ollama'), { error: 'Utilisé par : DeepSeek 4.1 Flash.' })
  const unused = upsertProvider(SAMPLE_STORE, { id: 'lmstudio', name: 'LM Studio', baseUrl: 'http://localhost:1234', token: 'lm', extraEnv: {} })
  const result = removeProvider(unused, 'lmstudio')
  assert.ok('store' in result && !result.store.providers.some((p) => p.id === 'lmstudio'))
})

test('removing the last launched profile clears lastProfileId', () => {
  const store = { ...SAMPLE_STORE, lastProfileId: 'deepseek-flash' }
  assert.equal(removeProfile(store, 'deepseek-flash').lastProfileId, null)
})

test('a store written before favorites keeps every profile and reads no favorite', () => {
  const { favoriteIds: _, ...legacy } = { ...SAMPLE_STORE, lastProfileId: LUNA.id }
  const parsed = parseStore(JSON.parse(JSON.stringify(legacy)))
  assert.deepEqual(parsed?.profiles, SAMPLE_STORE.profiles)
  assert.deepEqual(parsed?.providers, SAMPLE_STORE.providers)
  assert.equal(parsed?.lastProfileId, LUNA.id)
  assert.deepEqual(parsed?.favoriteIds, [])
})

test('a malformed favorites list reads as empty and never costs the profiles', () => {
  assert.deepEqual(parseStore({ ...SAMPLE_STORE, favoriteIds: 'nope' })?.profiles, SAMPLE_STORE.profiles)
  assert.deepEqual(parseStore({ ...SAMPLE_STORE, favoriteIds: 'nope' })?.favoriteIds, [])
  assert.deepEqual(parseStore({ ...SAMPLE_STORE, favoriteIds: [1, LUNA.id, LUNA.id] })?.favoriteIds, [LUNA.id])
})

test('unpinning a profile that is not a favorite returns the same store', () => {
  const unchanged = setFavorite(SAMPLE_STORE, LUNA.id, false, COPY)
  assert.ok('store' in unchanged && unchanged.store === SAMPLE_STORE)
})

test('favorites keep their pinning order, refuse a sixth and drop a deleted profile', () => {
  let store: Store = SAMPLE_STORE
  for (const id of [LUNA.id, OPUS.id, ARGON.id, DEEPSEEK.id, HARNESS.id]) {
    const next = setFavorite(store, id, true, COPY)
    assert.ok('store' in next)
    store = next.store
  }
  assert.deepEqual(favoriteProfiles(store).map((p) => p.id), [LUNA.id, OPUS.id, ARGON.id, DEEPSEEK.id, HARNESS.id])
  const sixth = { ...OPUS, id: 'sixth', name: 'Sixth' }
  assert.deepEqual(setFavorite({ ...store, profiles: [...store.profiles, sixth] }, 'sixth', true, COPY), { error: COPY.favoritesFull(MAX_FAVORITES) })
  // Re-épingler un favori ne le déplace pas ; le retirer libère sa place.
  const again = setFavorite(store, OPUS.id, true, COPY)
  assert.ok('store' in again && again.store.favoriteIds.join() === store.favoriteIds.join())
  const unpinned = setFavorite(store, OPUS.id, false, COPY)
  assert.ok('store' in unpinned && !unpinned.store.favoriteIds.includes(OPUS.id))
  assert.deepEqual(removeProfile(store, ARGON.id).favoriteIds, [LUNA.id, OPUS.id, DEEPSEEK.id, HARNESS.id])
  assert.deepEqual(setFavorite(store, 'gone', true, COPY), { error: COPY.profileNotFound })
})

test('a favorite id without its profile takes no slot', () => {
  const store: Store = { ...SAMPLE_STORE, favoriteIds: ['ghost', LUNA.id] }
  assert.deepEqual(favoriteProfiles(store).map((p) => p.id), [LUNA.id])
})

test('only a whole $NAME value is an environment reference', () => {
  assert.equal(isEnvReference('$OPENROUTER_API_KEY'), true)
  assert.equal(isEnvReference('$open-router'), false)
  assert.equal(isEnvReference('ollama'), false)
})

test('environment lines parse, report the bad line, and round-trip', () => {
  assert.deepEqual(parseEnvLines('A=1\nB=$KEY\n\n'), { env: { A: '1', B: '$KEY' } })
  assert.deepEqual(parseEnvLines('A=1\nNOEQUALS'), { error: 'Ligne 2 : forme attendue NOM=valeur.' })
  assert.deepEqual(parseEnvLines('1A=x'), { error: 'Ligne 1 : forme attendue NOM=valeur.' })
  assert.deepEqual(parseEnvLines(formatEnvLines({ A: '1', B: 'x=y' })), { env: { A: '1', B: 'x=y' } })
})

test('validations speak the language they are given, and only that one', () => {
  const draft: Provider = { ...SAMPLE_STORE.providers[0]!, name: '', baseUrl: 'localhost:11434', token: '' }
  assert.deepEqual(validateProviderIn(SAMPLE_STORE, draft, MESSAGES.en), {
    name: 'Name is required.',
    baseUrl: 'The URL must start with http:// or https://.',
    token: 'Token is required.'
  })
  assert.deepEqual(validateProfileIn(SAMPLE_STORE, { ...ARGON, id: 'x', name: 'Argon' }, MESSAGES.en), {
    name: 'Name already used for this agent.'
  })
  assert.deepEqual(removeProviderIn(SAMPLE_STORE, 'ollama', MESSAGES.en), { error: 'Still used by: DeepSeek 4.1 Flash.' })
  assert.deepEqual(parseEnvLinesIn('A=1\nNOEQUALS', MESSAGES.en), { error: 'Line 2: expected NAME=value.' })
})
