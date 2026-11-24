// Commandes de lancement réelles, telles qu'Orca 1.4.259 les prépare : chaque argument entre guillemets simples.
import { agentById } from './agents'
import type { Inventory, InventoryDeps, OrcaSettings } from './inventory'
import type { Profile, Provider, Store } from './store'

/** Capturée dans les logs V1 : le panneau Orca lance Claude avec son modèle et son effort. */
export const CLAUDE_CMD = "claude '--dangerously-skip-permissions' '--model' 'claude-opus-5-5' '--effort' 'medium'"

/** Capturée par la sonde du 15/11/2026. */
export const AGY_CMD = "agy '--dangerously-skip-permissions'"

/** Capturée par la sonde du 15/11/2026. */
export const CODEX_CMD = "codex '-c' 'disable_paste_burst=true' '--dangerously-bypass-approvals-and-sandbox'"

// Données communes aux tests : fournisseurs, un profil par famille d'agent, magasin et inventaire d'exemple.

export const OLLAMA: Provider = { id: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434', token: 'ollama', extraEnv: {} }

export const OPENROUTER: Provider = {
  id: 'openrouter',
  name: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api',
  token: '$OPENROUTER_API_KEY',
  extraEnv: {}
}

export const OPUS: Profile = {
  id: 'opus', agentId: 'claude', name: 'Opus', avatar: null, model: 'opus', effort: 'medium', providerId: null, extraArgs: []
}

export const DEEPSEEK: Profile = {
  id: 'deepseek-flash',
  agentId: 'claude',
  name: 'DeepSeek 4.1 Flash',
  avatar: 'avatars/deepseek.png',
  model: 'deepseek-v4.1-flash:cloud[1m]',
  effort: null,
  providerId: 'ollama',
  extraArgs: []
}

export const ARGON: Profile = {
  id: 'argon', agentId: 'antigravity', name: 'Argon', avatar: null, model: 'gemini-4-argon', effort: 'medium', providerId: null, extraArgs: []
}

export const LUNA: Profile = {
  id: 'luna', agentId: 'codex', name: 'Luna', avatar: null, model: 'gpt-6-luna', effort: 'high', providerId: null, extraArgs: []
}

export const HARNESS: Profile = {
  id: 'harness', agentId: 'dsh', name: 'Harness', avatar: null, model: null, effort: null, providerId: null, extraArgs: []
}

export const SAMPLE_STORE: Store = {
  version: 2,
  providers: [OLLAMA, OPENROUTER],
  profiles: [OPUS, DEEPSEEK, ARGON, LUNA, HARNESS],
  lastProfileId: null,
  favoriteIds: []
}

export const ENABLED: Inventory = {
  agents: ['claude', 'codex', 'grok', 'opencode', 'dsh', 'pi', 'antigravity'],
  settingsReadable: true,
  detectedAt: 0
}

/**
 * Dépendances d'inventaire factices : un test change `state.agents`, `state.settings` (les réglages d'Orca, `null`
 * pour illisibles) ou `state.now` pour simuler Orca, `state.finds` compte les sondes.
 */
export function fakeDeps(agents: readonly string[] = ENABLED.agents) {
  const state = { agents: [...agents], now: 0, finds: 0, settings: { disabled: [], overrides: {} } as OrcaSettings | null }
  const deps: InventoryDeps = {
    readSettings: () => state.settings,
    findCommands: async () => {
      state.finds++
      return new Set(state.agents.flatMap((id) => [...agentById(id)!.commands, ...agentById(id)!.requiredCommands]))
    },
    now: () => state.now,
    launchShell: () => 'posix'
  }
  return { deps, state }
}
