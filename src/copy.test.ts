import { assert, test } from 'orca/testing'
import { LOCALES, localeOf, MESSAGES, messagesFor, type Messages } from './copy'

/** Chemins de toutes les entrées, objets imbriqués compris (`efforts.high`). */
function paths(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, entry]) =>
    typeof entry === 'object' && entry !== null ? paths(entry, `${prefix}${key}.`) : [`${prefix}${key}:${typeof entry}`]
  )
}

test('both dictionaries have exactly the same keys, functions included', () => {
  const [reference, ...others] = LOCALES.map((locale) => paths(MESSAGES[locale]).sort())
  assert.ok(reference && reference.length > 0)
  for (const other of others) assert.deepEqual(other, reference)
})

/** Appelle chaque fonction du dictionnaire avec des arguments d'exemple. */
function everyText(messages: Messages): string[] {
  const sample = (entry: unknown): string[] => {
    if (typeof entry === 'string') return [entry]
    // Un nom pour les libellés, un nombre pour les compteurs : chaque fonction n'en prend qu'un.
    if (typeof entry === 'function') return ['Name', 0, 1, 3].map((arg) => String((entry as (arg: unknown) => string)(arg)))
    if (typeof entry === 'object' && entry !== null) return Object.values(entry).flatMap(sample)
    return []
  }
  return sample(messages)
}

test('no text is empty and none carries an em dash, in any language', () => {
  for (const locale of LOCALES) {
    for (const text of everyText(MESSAGES[locale])) {
      assert.ok(text.trim() !== '', `${locale}: empty text`)
      assert.ok(!text.includes('—'), `${locale}: em dash in "${text}"`)
    }
  }
})

test('the profile count is pluralised correctly in each language', () => {
  assert.deepEqual([0, 1, 2, 12].map(MESSAGES.en.profileCount), ['No profiles', '1 profile', '2 profiles', '12 profiles'])
  assert.deepEqual([0, 1, 2, 12].map(MESSAGES.fr.profileCount), ['Aucun profil', '1 profil', '2 profils', '12 profils'])
})

test('French variants pick French, every other language picks English', () => {
  for (const tag of ['fr', 'fr-FR', 'fr-CA', 'fr_BE', 'FR-fr']) assert.equal(localeOf(tag), 'fr', tag)
  for (const tag of ['en', 'en-US', 'de-DE', 'es-ES', 'zh-Hans', 'frisian', '']) assert.equal(localeOf(tag), 'en', tag)
  assert.equal(messagesFor('fr-FR'), MESSAGES.fr)
  assert.equal(messagesFor('ja-JP'), MESSAGES.en)
})
