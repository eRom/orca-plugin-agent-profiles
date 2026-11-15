// Table des agents d'Orca : commandes à détecter, grammaire des flags modèle et effort, icône.
// Sources (dépôt d'Orca, commit ed507d41f4d) :
// - ordre et libellés : src/shared/agent-launch/catalog/tui-agent-display-names.ts ;
// - commandes : detectCmd et detectCmdAliases de src/shared/agent-launch/catalog/tui-agent-config.ts ;
// - modèle et effort : EXTRA_AGENT_ARG_OPTIONS (src/shared/agent-launch/startup/automation-extra-agent-args.ts),
//   la liste blanche des arguments qu'Orca accepte en plus, plus le modèle d'OpenCode
//   (src/shared/agent-session/options/catalog-providers/agent-session-option-catalog-opencode.ts).
//   Gemini, Muse et l'effort d'omp figurent dans d'autres catalogues d'Orca mais pas dans cette liste : ils restent à null.

/** Grammaire d'un flag : `flags[0]` est celui qu'on écrit, les autres sont reconnus à la lecture. */
export type FlagGrammar = { flags: readonly string[]; valuePrefix?: string }

export type EffortGrammar = FlagGrammar & { values: readonly string[] }

export type AgentSpec = {
  id: string
  label: string
  /** Commandes dont la présence prouve que l'agent est installé (detectCmd puis alias). */
  commands: readonly string[]
  /** Commandes qui doivent toutes exister en plus, sinon l'agent n'est pas utilisable. */
  requiredCommands: readonly string[]
  /** Chemin de l'icône PNG, relatif à la racine du plugin. */
  icon: string
  model: FlagGrammar | null
  effort: EffortGrammar | null
  /** Flags qu'un argument en plus ajoute sans remplacer. */
  repeatableFlags: readonly string[]
  supportsProvider: boolean
}

type Overrides = Partial<Pick<AgentSpec, 'requiredCommands' | 'model' | 'effort' | 'repeatableFlags' | 'supportsProvider'>>

function agent(id: string, label: string, commands: readonly string[], overrides: Overrides = {}): AgentSpec {
  return {
    id,
    label,
    commands,
    requiredCommands: [],
    icon: `agent-icons/${id}.png`,
    model: null,
    effort: null,
    repeatableFlags: [],
    supportsProvider: false,
    ...overrides
  }
}

const MODEL: FlagGrammar = { flags: ['--model'] }
const MODEL_SHORT: FlagGrammar = { flags: ['-m', '--model'] }

/** Dans l'ordre du catalogue d'Orca (Réglages > Agents). */
export const AGENTS: readonly AgentSpec[] = [
  agent('claude', 'Claude', ['claude'], {
    model: MODEL,
    effort: { flags: ['--effort'], values: ['low', 'medium', 'high', 'xhigh', 'max'] },
    repeatableFlags: ['--add-dir'],
    supportsProvider: true
  }),
  agent('claude-agent-teams', 'Claude Agent Teams', ['orca', 'orca-dev', 'orca-ide'], { requiredCommands: ['claude'] }),
  agent('openclaude', 'OpenClaude', ['openclaude']),
  agent('codex', 'Codex', ['codex'], {
    model: MODEL_SHORT,
    effort: {
      flags: ['-c', '--config'],
      valuePrefix: 'model_reasoning_effort=',
      values: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']
    },
    repeatableFlags: ['-c', '--config']
  }),
  agent('grok', 'Grok', ['grok'], {
    model: MODEL_SHORT,
    effort: { flags: ['--effort', '--reasoning-effort'], values: ['low', 'medium', 'high', 'xhigh'] }
  }),
  agent('copilot', 'GitHub Copilot', ['copilot']),
  agent('opencode2', 'OpenCode 2', ['opencode2']),
  agent('opencode', 'OpenCode', ['opencode'], { model: MODEL_SHORT }),
  agent('mimo-code', 'MiMo Code', ['mimo']),
  agent('ante', 'Ante', ['ante']),
  agent('trae', 'Trae', ['traecli']),
  agent('muse', 'Muse', ['muse']),
  agent('dsh', 'DeepSeek Harness', ['dsh-tui', 'dst'], { requiredCommands: ['dsh'] }),
  agent('qoder', 'Qoder CLI', ['qodercli', 'qoder']),
  agent('qoder-cn', 'Qoder CLI China', ['qoderclicn', 'qodercn']),
  agent('zcode', 'ZCode', ['zcode']),
  agent('pi', 'Pi', ['pi'], {
    model: MODEL,
    effort: { flags: ['--thinking'], values: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] }
  }),
  agent('omp', 'OMP', ['omp'], { model: MODEL }),
  agent('prime-agent', 'Prime Agent', ['prime-agent']),
  agent('gemini', 'Gemini', ['gemini']),
  agent('antigravity', 'Antigravity', ['agy'], {
    model: MODEL,
    effort: { flags: ['--effort'], values: ['low', 'medium', 'high'] }
  }),
  agent('aider', 'Aider', ['aider']),
  agent('goose', 'Goose', ['goose']),
  agent('amp', 'Amp', ['amp']),
  agent('kilo', 'Kilocode', ['kilo']),
  agent('kiro', 'Kiro', ['kiro-cli']),
  agent('crush', 'Charm', ['crush']),
  agent('aug', 'Auggie', ['auggie']),
  agent('autohand', 'Autohand Code', ['autohand']),
  agent('cline', 'Cline', ['cline']),
  agent('codebuff', 'Codebuff', ['codebuff']),
  agent('freebuff', 'Freebuff', ['freebuff']),
  agent('command-code', 'Command Code', ['command-code']),
  agent('continue', 'Continue', ['cn']),
  agent('cursor', 'Cursor', ['cursor-agent'], { model: MODEL_SHORT }),
  agent('droid', 'Droid', ['droid']),
  agent('kimi', 'Kimi', ['kimi', 'kimi-code']),
  agent('mistral-vibe', 'Mistral Vibe', ['vibe', 'mistral-vibe']),
  agent('qwen-code', 'Qwen Code', ['qwen']),
  agent('rovo', 'Rovo Dev', ['acli']),
  agent('hermes', 'Hermes', ['hermes']),
  agent('devin', 'Devin', ['devin']),
  agent('openclaw', 'OpenClaw', ['openclaw']),
  agent('codebuddy', 'CodeBuddy', ['codebuddy', 'cbc'], {
    model: MODEL,
    effort: { flags: ['--effort'], values: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] }
  }),
  agent('jcode', 'Jcode', ['jcode'])
]

export function agentById(id: string): AgentSpec | undefined {
  return AGENTS.find((spec) => spec.id === id)
}
