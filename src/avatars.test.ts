// Les dossiers avatars/ et agent-icons/ du plugin sont listés par le worker : seuls les fichiers image remontent au panneau.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assert, mockHost, mountWorker, test } from 'orca/testing'
import { listAvatarFiles, pluginDirectory } from './avatars'
import { fakeDeps } from './test-fixtures'
import { activateWith } from './worker'

test('lists only image files, sorted, and survives a missing folder', () => {
  const files = listAvatarFiles(pluginDirectory('avatars'))
  assert.ok(files.includes('deepseek.png'))
  assert.ok(files.includes('ollama.png'))
  assert.ok(files.every((file) => !file.endsWith('.md')))
  assert.deepEqual(files, [...files].sort())
  assert.deepEqual(listAvatarFiles('/nonexistent-agent-profiles'), [])
})

test('lists PNG files only, whatever the case, and skips other image formats', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-profiles-avatars-'))
  try {
    for (const name of ['a.png', 'b.PNG', 'c.webp', 'd.jpg', 'e.svg', 'notes.md']) {
      writeFileSync(join(directory, name), 'x')
    }
    assert.deepEqual(listAvatarFiles(directory), ['a.png', 'b.PNG'])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('answers avatars.list with avatars first, then agent icons, as plugin paths', async () => {
  const worker = await mountWorker({ default: (orca) => activateWith(orca, fakeDeps().deps) }, { host: mockHost() })
  const { files } = await worker.request('avatars.list')
  assert.ok(files[0]!.startsWith('avatars/'))
  assert.ok(files.includes('avatars/claude.png'))
  assert.ok(files.includes('agent-icons/claude.png'))
  // Les avatars précèdent toutes les icônes d'agent.
  const firstIcon = files.findIndex((file) => file.startsWith('agent-icons/'))
  assert.ok(files.slice(firstIcon).every((file) => file.startsWith('agent-icons/')))
  for (const file of files) {
    const [directory, name] = file.split('/') as ['avatars' | 'agent-icons', string]
    assert.ok(existsSync(join(pluginDirectory(directory), name)), file)
  }
  await worker.deactivate()
})
