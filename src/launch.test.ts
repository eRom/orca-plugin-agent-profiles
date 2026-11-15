import { assert, test } from 'orca/testing'
import {
  MODEL_TIER_VARS,
  SUBAGENT_MODEL_FORCE_VAR,
  applyProfile,
  findProfileByModel,
  insertArgs,
  readFlag,
  removeOption,
  rewriteForProfile,
  setFlag,
  splitWords
} from './launch'
import { agentById } from './agents'
import { MESSAGES } from './copy'
import { AGY_CMD, CLAUDE_CMD, CODEX_CMD, DEEPSEEK, OLLAMA, OPENROUTER, OPUS, SAMPLE_STORE } from './test-fixtures'

const CLI = "claude '--dangerously-skip-permissions' '--model' 'deepseek-v4.1-flash:cloud[1m]' 'Reponds uniquement: OK-SPIKE'"

/** Affectation que le shell du terminal développe : échoue en nommant la variable si elle manque. */
const assignment = (target: string, reference: string, reason = MESSAGES.fr.envMissing) => `${target}="\${${reference}:?${reason}}"`

test('setFlag replaces a flag in place or inserts it after the binary', () => {
  assert.equal(
    setFlag(CLAUDE_CMD, '--model', 'deepseek-v4.1-flash:cloud[1m]'),
    "claude '--dangerously-skip-permissions' '--model' 'deepseek-v4.1-flash:cloud[1m]' '--effort' 'medium'"
  )
  assert.equal(
    setFlag(CLI, '--effort', 'max'),
    "claude '--effort' 'max' '--dangerously-skip-permissions' '--model' 'deepseek-v4.1-flash:cloud[1m]' 'Reponds uniquement: OK-SPIKE'"
  )
  assert.equal(
    setFlag("claude '--model=qwen/qwen3.8-flash' '--effort' 'medium'", '--model', 'qwen/qwen3.8-flash[1m]'),
    "claude '--model' 'qwen/qwen3.8-flash[1m]' '--effort' 'medium'"
  )
  assert.equal(readFlag(CLI, '--model'), 'deepseek-v4.1-flash:cloud[1m]')
})

test('insertArgs adds new words after the binary and skips flags already present', () => {
  assert.equal(
    insertArgs(CLAUDE_CMD, ['--remote-control', '--dangerously-skip-permissions']),
    "claude '--remote-control' '--dangerously-skip-permissions' '--model' 'claude-opus-5-5' '--effort' 'medium'"
  )
  assert.equal(insertArgs(CLAUDE_CMD, ['--dangerously-skip-permissions']), CLAUDE_CMD)
  // Une valeur égale à un mot existant passe quand même : seul un flag déjà présent est ignoré.
  assert.equal(
    insertArgs(CLAUDE_CMD, ['--note', 'medium']),
    "claude '--note' 'medium' '--dangerously-skip-permissions' '--model' 'claude-opus-5-5' '--effort' 'medium'"
  )
})

test('insertArgs replaces a flag already present instead of orphaning its value', () => {
  assert.equal(
    insertArgs(CLAUDE_CMD, ['--effort', 'high']),
    "claude '--dangerously-skip-permissions' '--model' 'claude-opus-5-5' '--effort' 'high'"
  )
  assert.equal(
    insertArgs(CLAUDE_CMD, ['--effort=max']),
    "claude '--dangerously-skip-permissions' '--model' 'claude-opus-5-5' '--effort' 'max'"
  )
  assert.equal(
    insertArgs(CLAUDE_CMD, ['--remote-control', '--note', 'x y']),
    "claude '--remote-control' '--note' 'x y' '--dangerously-skip-permissions' '--model' 'claude-opus-5-5' '--effort' 'medium'"
  )
})

test('a model id with shell metacharacters stays one quoted word', () => {
  const command = setFlag(CLAUDE_CMD, '--model', "it's a [1m]")
  assert.equal(readFlag(command, '--model'), "it's a [1m]")
  assert.ok(command.includes(`'it'\\''s a [1m]'`))
})

const words = (command: string): string[] => splitWords(command).map((word) => word.value)
const spec = (id: string) => agentById(id)!

test('applyProfile routes an Ollama profile with literal env and model tiers', () => {
  const profile = { ...DEEPSEEK, effort: 'max', extraArgs: ['--remote-control'] }
  const routed = applyProfile({ command: CLAUDE_CMD, env: {} }, spec('claude'), profile, OLLAMA, MESSAGES.fr)
  // Les deux littéraux de routage non secrets passent aussi en tête de commande : un `export` plus
  // tard dans ~/.zshenv ne peut pas les écraser. Le jeton littéral, lui, reste hors de la ligne.
  assert.ok(routed.command.startsWith("ANTHROPIC_BASE_URL='http://localhost:11434' ANTHROPIC_API_KEY='' claude "))
  assert.deepEqual(words(routed.command), [
    'ANTHROPIC_BASE_URL=http://localhost:11434',
    'ANTHROPIC_API_KEY=',
    'claude',
    '--remote-control',
    '--model',
    'deepseek-v4.1-flash:cloud[1m]',
    '--effort',
    'max',
    '--dangerously-skip-permissions'
  ])
  assert.ok(!routed.command.includes('AUTH_TOKEN'))
  assert.equal(routed.env.ANTHROPIC_BASE_URL, 'http://localhost:11434')
  assert.equal(routed.env.ANTHROPIC_AUTH_TOKEN, 'ollama')
  assert.equal(routed.env.ANTHROPIC_API_KEY, '')
  for (const name of MODEL_TIER_VARS) assert.equal(routed.env[name], 'deepseek-v4.1-flash:cloud[1m]')
  assert.equal(routed.env[SUBAGENT_MODEL_FORCE_VAR], '1')
})

test('applyProfile hands $NAME references to the terminal shell', () => {
  const provider = { ...OPENROUTER, extraEnv: { HTTP_PROXY: '$MY_PROXY', LOG_LEVEL: 'debug' } }
  const routed = applyProfile({ command: CLAUDE_CMD, env: {} }, spec('claude'), DEEPSEEK, provider, MESSAGES.fr)
  const prefix =
    "ANTHROPIC_BASE_URL='https://openrouter.ai/api' ANTHROPIC_API_KEY='' " +
    `${assignment('ANTHROPIC_AUTH_TOKEN', 'OPENROUTER_API_KEY')} ${assignment('HTTP_PROXY', 'MY_PROXY')} ` +
    'claude '
  assert.ok(routed.command.startsWith(prefix))
  assert.deepEqual(words(routed.command.slice(prefix.length)), [
    '--model',
    'deepseek-v4.1-flash:cloud[1m]',
    '--dangerously-skip-permissions',
    '--effort',
    'medium'
  ])
  assert.equal(Object.hasOwn(routed.env, 'ANTHROPIC_AUTH_TOKEN'), false)
  assert.equal(Object.hasOwn(routed.env, 'HTTP_PROXY'), false)
  assert.equal(routed.env.LOG_LEVEL, 'debug')
  // Les littéraux de routage restent aussi dans env.
  assert.equal(routed.env.ANTHROPIC_BASE_URL, 'https://openrouter.ai/api')
  assert.equal(routed.env.ANTHROPIC_API_KEY, '')
})

test('the shell failure text of a missing $NAME follows the language of the messages it is given', () => {
  const provider = { ...OPENROUTER, extraEnv: {} }
  const routed = applyProfile({ command: CLAUDE_CMD, env: {} }, spec('claude'), DEEPSEEK, provider, MESSAGES.en)
  assert.ok(
    routed.command.includes('ANTHROPIC_AUTH_TOKEN="${OPENROUTER_API_KEY:?missing from the shell, export it in ~/.zshenv}"'),
    routed.command
  )
  assert.ok(!routed.command.includes('absente du shell'))
})

test('a base URL with a quote stays one quoted assignment', () => {
  const provider = { ...OLLAMA, baseUrl: "http://host/it's" }
  const routed = applyProfile({ command: CLAUDE_CMD, env: {} }, spec('claude'), DEEPSEEK, provider, MESSAGES.fr)
  assert.ok(routed.command.startsWith(`ANTHROPIC_BASE_URL='http://host/it'\\''s' ANTHROPIC_API_KEY='' claude `))
})

test('applyProfile skips an extraEnv key that is not a valid variable name', () => {
  const provider = {
    ...OLLAMA,
    extraEnv: { GOOD_ONE: 'x', 'BAD KEY': 'y', '1ABC': 'z', 'A;rm': 'w', 'X=Y': 'v', '$(id)': 'u', 'REF-ED': '$FOO' }
  }
  const routed = applyProfile({ command: CLAUDE_CMD, env: {} }, spec('claude'), DEEPSEEK, provider, MESSAGES.fr)
  assert.equal(routed.env.GOOD_ONE, 'x')
  for (const name of ['BAD KEY', '1ABC', 'A;rm', 'X=Y', '$(id)', 'REF-ED']) {
    assert.equal(Object.hasOwn(routed.env, name), false, name)
  }
  // Une clé invalide n'atteint pas non plus la ligne de commande, même comme référence `$NOM`.
  assert.ok(!routed.command.includes('REF-ED') && !routed.command.includes('FOO'))
  assert.ok(!routed.command.includes('rm=') && !routed.command.includes('BAD KEY'))
})

test('a Claude profile without provider changes the command only', () => {
  const routed = applyProfile({ command: CLAUDE_CMD, env: { KEEP: '1' } }, spec('claude'), OPUS, null, MESSAGES.fr)
  assert.deepEqual(routed.env, { KEEP: '1' })
  assert.deepEqual(words(routed.command), ['claude', '--model', 'opus', '--effort', 'medium', '--dangerously-skip-permissions'])
})

test('routes a Claude profile through its provider and keeps the effort Orca chose', () => {
  const routed = applyProfile({ command: CLAUDE_CMD, env: {} }, spec('claude'), DEEPSEEK, OLLAMA, MESSAGES.fr)
  assert.ok(routed.command.startsWith("ANTHROPIC_BASE_URL='http://localhost:11434' ANTHROPIC_API_KEY=''"))
  assert.equal(routed.env.ANTHROPIC_AUTH_TOKEN, 'ollama')
  assert.equal(routed.env.ANTHROPIC_MODEL, 'deepseek-v4.1-flash:cloud[1m]')
  assert.equal(readFlag(routed.command, '--effort'), 'medium')
})

test('the model-flag fallback only finds Claude profiles with a provider', () => {
  const profiles = SAMPLE_STORE.profiles
  assert.equal(findProfileByModel(profiles, 'deepseek-v4.1-flash:cloud')?.id, 'deepseek-flash')
  assert.equal(findProfileByModel(profiles, 'opus'), undefined)
  assert.equal(findProfileByModel(profiles, 'gemini-4-argon'), undefined)
})

test('rewrites the Claude command Orca prepares, without duplicating model or effort', () => {
  const command = rewriteForProfile(CLAUDE_CMD, spec('claude'), { model: 'opus', effort: 'high', extraArgs: [] })
  assert.deepEqual(words(command), ['claude', '--model', 'opus', '--effort', 'high', '--dangerously-skip-permissions'])
})

test('keeps the effort Orca chose when the profile has none', () => {
  const command = rewriteForProfile(CLAUDE_CMD, spec('claude'), { model: 'opus', effort: null, extraArgs: [] })
  assert.deepEqual(words(command), ['claude', '--model', 'opus', '--dangerously-skip-permissions', '--effort', 'medium'])
})

test('rewrites agy the way the live probe launched it', () => {
  const command = rewriteForProfile(AGY_CMD, spec('antigravity'), { model: 'gemini-4-argon', effort: 'medium', extraArgs: [] })
  assert.deepEqual(words(command), ['agy', '--model', 'gemini-4-argon', '--effort', 'medium', '--dangerously-skip-permissions'])
})

test('sets codex effort through -c without touching its other -c settings', () => {
  const current = CODEX_CMD.replace("codex ", "codex '-c' 'model_reasoning_effort=low' ")
  const command = rewriteForProfile(current, spec('codex'), { model: 'gpt-6-luna', effort: 'high', extraArgs: ['-c', 'foo=bar'] })
  assert.deepEqual(words(command), [
    'codex', '-c', 'foo=bar', '-m', 'gpt-6-luna', '-c', 'model_reasoning_effort=high',
    '-c', 'disable_paste_burst=true', '--dangerously-bypass-approvals-and-sandbox'
  ])
})

test('removes the equals form of a flag too', () => {
  const command = rewriteForProfile("claude '--model=claude-opus-5-5' '--effort=low'", spec('claude'), { model: 'sonnet', effort: 'high', extraArgs: [] })
  assert.deepEqual(words(command), ['claude', '--model', 'sonnet', '--effort', 'high'])
})

test('uses pi thinking levels and quotes models that zsh would glob', () => {
  const pi = rewriteForProfile('pi', spec('pi'), { model: 'ollama/deepseek-v4.1-flash:cloud', effort: 'high', extraArgs: [] })
  assert.deepEqual(words(pi), ['pi', '--model', 'ollama/deepseek-v4.1-flash:cloud', '--thinking', 'high'])
  const claude = rewriteForProfile('claude', spec('claude'), { model: 'deepseek-v4.1-flash:cloud[1m]', effort: null, extraArgs: [] })
  assert.ok(claude.includes("'deepseek-v4.1-flash:cloud[1m]'"))
})

test('an agent without a model flag only receives its extra arguments', () => {
  const command = rewriteForProfile('dsh-tui', spec('dsh'), { model: null, effort: null, extraArgs: ['--yolo'] })
  assert.deepEqual(words(command), ['dsh-tui', '--yolo'])
})

test('removeOption only drops the occurrences matching the value prefix and keeps the rest byte for byte', () => {
  const effort = spec('codex').effort!
  const command = "codex '-c' 'model_reasoning_effort=low' '-c' 'disable_paste_burst=true' '--config=model_reasoning_effort=max' 'go'"
  assert.equal(removeOption(command, effort), "codex '-c' 'disable_paste_burst=true' 'go'")
  assert.equal(removeOption(CODEX_CMD, effort), CODEX_CMD)
})
