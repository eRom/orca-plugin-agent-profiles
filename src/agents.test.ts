// Invariants de la table : aucun comptage, aucune copie figée du catalogue d'Orca.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { assert, test } from 'orca/testing'
import { AGENTS, agentById } from './agents'

const pluginFile = (relative: string): string => fileURLToPath(new URL(`../${relative}`, import.meta.url))

test('every agent has a unique id, a label and at least one command', () => {
  const ids = AGENTS.map((agent) => agent.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const agent of AGENTS) {
    assert.ok(agent.label.trim() !== '', agent.id)
    assert.ok(agent.commands.length > 0, agent.id)
  }
})

test('every agent icon is a PNG shipped with the plugin', () => {
  for (const agent of AGENTS) {
    assert.match(agent.icon, /^agent-icons\/[a-z0-9-]+\.png$/)
    assert.ok(existsSync(pluginFile(agent.icon)), agent.icon)
  }
})

test('an effort grammar always offers values, and only Claude takes a provider', () => {
  for (const agent of AGENTS) {
    if (agent.effort) assert.ok(agent.effort.values.length > 0, agent.id)
    assert.equal(agent.supportsProvider, agent.id === 'claude')
  }
})

test('writes the flags probed live on 15/11 for agy and codex', () => {
  assert.equal(agentById('antigravity')!.model!.flags[0], '--model')
  assert.equal(agentById('antigravity')!.effort!.flags[0], '--effort')
  assert.equal(agentById('codex')!.model!.flags[0], '-m')
  assert.equal(agentById('codex')!.effort!.flags[0], '-c')
  assert.equal(agentById('codex')!.effort!.valuePrefix, 'model_reasoning_effort=')
  assert.equal(agentById('dsh')!.model, null)
  assert.equal(agentById('nope'), undefined)
})
