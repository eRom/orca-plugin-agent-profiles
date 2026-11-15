// Variantes d'icônes par thème : la table du module pur doit coller au disque, et le choix suit le thème.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { assert, test } from 'orca/testing'
import { pluginDirectory } from './avatars'
import { type ColorScheme, ICON_VARIANTS, themedIcon } from './icons'

const SCHEMES: ColorScheme[] = ['light', 'dark']

test('every declared variant exists on disk, and so does its base icon', () => {
  const root = pluginDirectory('agent-icons')
  for (const scheme of SCHEMES) {
    for (const file of ICON_VARIANTS[scheme]) {
      assert.ok(existsSync(join(root, file)), `base agent-icons/${file}`)
      assert.ok(existsSync(join(root, `on-${scheme}`, file)), `variant agent-icons/on-${scheme}/${file}`)
    }
  }
})

test('a declared variant is used for its theme only, and the base path is the answer everywhere else', () => {
  for (const scheme of SCHEMES) {
    const other = scheme === 'light' ? 'dark' : 'light'
    for (const file of ICON_VARIANTS[scheme]) {
      assert.equal(themedIcon(`agent-icons/${file}`, scheme), `agent-icons/on-${scheme}/${file}`)
      if (!ICON_VARIANTS[other].includes(file)) assert.equal(themedIcon(`agent-icons/${file}`, other), `agent-icons/${file}`)
    }
  }
})

test('icons without a variant, avatars and unknown paths come back unchanged', () => {
  for (const scheme of SCHEMES) {
    for (const path of ['agent-icons/claude.png', 'avatars/codex.png', 'avatars/kilo.png', 'agent-icons/missing.png', '', 'codex.png']) {
      assert.equal(themedIcon(path, scheme), path)
    }
  }
})
