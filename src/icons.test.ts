// Variantes d'icônes par thème : la table du module pur doit coller au disque dans les deux sens, et le choix suit le thème.
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { assert, test } from 'orca/testing'
import { pluginDirectory } from './avatars'
import { type ColorScheme, ICON_VARIANTS, themedIcon } from './icons'

const SCHEMES: ColorScheme[] = ['light', 'dark']
const FOLDERS = ['agent-icons', 'avatars'] as const

test('every declared variant exists on disk, and so does its base image', () => {
  for (const scheme of SCHEMES) {
    for (const base of ICON_VARIANTS[scheme]) {
      const [folder, file] = base.split('/') as [string, string]
      assert.ok(existsSync(join(pluginDirectory(folder as (typeof FOLDERS)[number]), file)), `base ${base}`)
      assert.ok(existsSync(join(pluginDirectory(folder as (typeof FOLDERS)[number]), `on-${scheme}`, file)), `variant of ${base}`)
    }
  }
})

test('every variant file on disk is declared in the table', () => {
  for (const folder of FOLDERS) {
    const root = pluginDirectory(folder)
    // Les PNG de base portent une extension, un dossier de variantes `on-<thème>` n'en a pas.
    for (const variantFolder of readdirSync(root).filter((name) => name.startsWith('on-') && !name.includes('.'))) {
      const scheme = variantFolder.slice('on-'.length)
      assert.ok(SCHEMES.includes(scheme as ColorScheme), `${folder}/${variantFolder} is a known theme folder`)
      for (const file of readdirSync(join(root, variantFolder))) {
        assert.ok(ICON_VARIANTS[scheme as ColorScheme].includes(`${folder}/${file}`), `${folder}/${variantFolder}/${file} is declared`)
      }
    }
  }
})

test('a declared variant is used for its theme only, and the base path is the answer everywhere else', () => {
  for (const scheme of SCHEMES) {
    const other = scheme === 'light' ? 'dark' : 'light'
    for (const base of ICON_VARIANTS[scheme]) {
      const [folder, file] = base.split('/') as [string, string]
      assert.equal(themedIcon(base, scheme), `${folder}/on-${scheme}/${file}`)
      if (!ICON_VARIANTS[other].includes(base)) assert.equal(themedIcon(base, other), base)
    }
  }
})

test('images without a variant and unknown paths come back unchanged', () => {
  for (const scheme of SCHEMES) {
    for (const path of ['agent-icons/claude.png', 'avatars/codex.png', 'avatars/kilo.png', 'agent-icons/kimi.png', 'agent-icons/missing.png', '', 'codex.png']) {
      assert.equal(themedIcon(path, scheme), path)
    }
  }
})
