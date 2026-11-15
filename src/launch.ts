// Logique pure du routage : lecture et réécriture de la ligne de commande, environnement du profil.
import type { AgentSpec, FlagGrammar } from './agents'
import { isEnvReference, sameModel, type Profile, type Provider } from './store'

/**
 * Variables par lesquelles Claude Code choisit un modèle (session, paliers, sous-agents).
 * Reprise d'IdnmA (`withModelTierDefaults`) : hors d'Anthropic, rien ne doit réclamer un modèle
 * Anthropic au proxy.
 */
export const MODEL_TIER_VARS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL'
] as const

/** Fait primer `CLAUDE_CODE_SUBAGENT_MODEL` sur le modèle qu'un agent réclame (lu par IdnmA dans Claude Code 2.1.319). */
export const SUBAGENT_MODEL_FORCE_VAR = 'CLAUDE_CODE_SUBAGENT_MODEL_FORCE'

type Word = { value: string; start: number; end: number }

/**
 * Découpe une ligne de commande en mots shell, avec leur position brute. Orca met chaque argument
 * entre guillemets simples (`claude '--model' 'x'`, capturé le 15/11/2026 sur Orca 1.4.259).
 */
export function splitWords(command: string): Word[] {
  const words: Word[] = []
  let i = 0
  while (i < command.length) {
    while (i < command.length && /\s/.test(command[i]!)) i++
    if (i >= command.length) break
    const start = i
    let value = ''
    while (i < command.length && !/\s/.test(command[i]!)) {
      const char = command[i]!
      if (char === "'") {
        const close = command.indexOf("'", i + 1)
        const stop = close === -1 ? command.length : close
        value += command.slice(i + 1, stop)
        i = stop + 1
      } else if (char === '"') {
        i++
        while (i < command.length && command[i] !== '"') {
          if (command[i] === '\\' && i + 1 < command.length) i++
          value += command[i]
          i++
        }
        i++
      } else if (char === '\\' && i + 1 < command.length) {
        value += command[i + 1]
        i += 2
      } else {
        value += char
        i++
      }
    }
    words.push({ value, start, end: Math.min(i, command.length) })
  }
  return words
}

/** Guillemets simples : `[1m]` non protégé est un motif de glob pour zsh (« no matches found »). */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Mots occupés par un flag : `--x v` (deux mots) ou `--x=v` (un mot). */
function findFlag(words: Word[], flag: string): { start: number; end: number; value: string } | undefined {
  for (let k = 0; k < words.length; k++) {
    const word = words[k]!
    if (word.value === flag) {
      const next = words[k + 1]
      return next ? { start: word.start, end: next.end, value: next.value } : undefined
    }
    if (word.value.startsWith(`${flag}=`)) {
      return { start: word.start, end: word.end, value: word.value.slice(flag.length + 1) }
    }
  }
  return undefined
}

export function readFlag(command: string, flag: string): string | undefined {
  return findFlag(splitWords(command), flag)?.value
}

/** Remplace la valeur d'un flag, ou l'insère juste après le binaire quand il manque. */
export function setFlag(command: string, flag: string, value: string): string {
  const replacement = `${shellQuote(flag)} ${shellQuote(value)}`
  const words = splitWords(command)
  const current = findFlag(words, flag)
  if (current) return `${command.slice(0, current.start)}${replacement}${command.slice(current.end)}`
  const binaryEnd = words[0]?.end ?? 0
  return `${command.slice(0, binaryEnd)} ${replacement}${command.slice(binaryEnd)}`
}

/**
 * Applique des arguments supplémentaires. Lus de gauche à droite : `--x v` et `--x=v` forment une
 * paire (flag, valeur), tout autre mot en `-` est un flag seul, le reste est un mot simple.
 * Une paire dont le flag est déjà dans la commande le remplace en place (jamais de doublon, jamais
 * de valeur orpheline), sauf si ce flag est dans `repeatable` (`-c` de Codex, `--add-dir` de Claude) :
 * il s'ajoute alors toujours. Un flag seul déjà présent est ignoré. Le reste est inséré d'un bloc,
 * dans l'ordre d'origine, juste après le binaire.
 */
export function insertArgs(command: string, args: readonly string[], repeatable?: ReadonlySet<string>): string {
  let result = command
  const fresh: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    const next = args[i + 1]
    const equals = arg.startsWith('-') ? arg.indexOf('=') : -1
    let pair: { flag: string; value: string; words: string[] } | undefined
    if (equals > 0) {
      pair = { flag: arg.slice(0, equals), value: arg.slice(equals + 1), words: [arg] }
    } else if (arg.startsWith('-') && next !== undefined && !next.startsWith('-')) {
      pair = { flag: arg, value: next, words: [arg, next] }
      i++
    }
    if (pair) {
      if (!repeatable?.has(pair.flag) && findFlag(splitWords(result), pair.flag)) {
        result = setFlag(result, pair.flag, pair.value)
      } else {
        fresh.push(...pair.words)
      }
    } else if (!arg.startsWith('-') || !splitWords(result).some((word) => word.value === arg)) {
      fresh.push(arg)
    }
  }
  if (fresh.length === 0) return result
  const binaryEnd = splitWords(result)[0]?.end ?? 0
  return `${result.slice(0, binaryEnd)} ${fresh.map(shellQuote).join(' ')}${result.slice(binaryEnd)}`
}

/**
 * Retire chaque occurrence d'un alias de la grammaire, sous la forme `--x v` (deux mots) ou `--x=v`
 * (un mot). Avec `valuePrefix`, seules les occurrences dont la valeur commence par ce préfixe partent
 * (`-c model_reasoning_effort=low` de Codex, pas ses autres `-c`). Chaque retrait emporte l'espace qui
 * le précède : le reste de la commande est conservé octet pour octet.
 */
export function removeOption(command: string, grammar: FlagGrammar): string {
  const words = splitWords(command)
  const prefix = grammar.valuePrefix ?? ''
  const ranges: { start: number; end: number }[] = []
  // Le premier mot est le binaire : jamais un flag.
  for (let k = 1; k < words.length; k++) {
    const word = words[k]!
    const alias = grammar.flags.find((flag) => word.value === flag || word.value.startsWith(`${flag}=`))
    if (alias === undefined) continue
    if (word.value === alias) {
      const next = words[k + 1]
      if (next === undefined || !next.value.startsWith(prefix)) continue
      ranges.push({ start: word.start, end: next.end })
      k++
    } else if (word.value.slice(alias.length + 1).startsWith(prefix)) {
      ranges.push({ start: word.start, end: word.end })
    }
  }
  let result = command
  for (const { start, end } of ranges.reverse()) {
    let from = start
    while (from > 0 && /\s/.test(result[from - 1]!)) from--
    result = result.slice(0, from) + result.slice(end)
  }
  return result
}

/** Réglages d'un profil appliqués à la commande : `null` laisse ce qu'Orca a choisi. */
export type LaunchSettings = { model: string | null; effort: string | null; extraArgs: readonly string[] }

/**
 * Réécrit la commande qu'Orca prépare pour l'agent `spec`, d'après la grammaire de ses flags.
 * Modèle et effort sont retirés puis réécrits d'un bloc juste après le binaire (toujours deux mots
 * `--flag valeur` : pi ne lit pas `--flag=valeur`), puis les arguments en plus sont insérés.
 */
export function rewriteForProfile(command: string, spec: AgentSpec, settings: LaunchSettings): string {
  let result = command
  const block: string[] = []
  if (settings.model !== null && spec.model) {
    result = removeOption(result, spec.model)
    block.push(spec.model.flags[0]!, settings.model)
  }
  if (settings.effort !== null && spec.effort) {
    result = removeOption(result, spec.effort)
    block.push(spec.effort.flags[0]!, `${spec.effort.valuePrefix ?? ''}${settings.effort}`)
  }
  if (block.length > 0) {
    const binaryEnd = splitWords(result)[0]?.end ?? 0
    result = `${result.slice(0, binaryEnd)} ${block.map(shellQuote).join(' ')}${result.slice(binaryEnd)}`
  }
  return insertArgs(result, settings.extraArgs, new Set(spec.repeatableFlags))
}

/** Repli du hook : seuls les profils Claude à fournisseur se reconnaissent à leur modèle. */
export function findProfileByModel(profiles: readonly Profile[], model: string | undefined): Profile | undefined {
  if (!model) return undefined
  return profiles.find(
    (profile) =>
      profile.agentId === 'claude' && profile.providerId !== null && profile.model !== null && sameModel(profile.model, model)
  )
}

/**
 * Une valeur `$NOM` devient une affectation en tête de commande, développée par le shell du
 * terminal (qui lit ~/.zshenv) : le worker d'Orca, lancé depuis le Dock, n'a pas ces variables
 * (constaté le 15/11/2026), et la clé ne transite ainsi ni par le plugin ni par Orca.
 * `:?` fait échouer la commande dans le shell, en nommant la variable, si elle est absente ou vide.
 */
function shellAssignments(references: [string, string][]): string {
  return references
    .map(([target, ref]) => `${target}="\${${ref}:?absente du shell, exporte-la dans ~/.zshenv}"`)
    .join(' ')
}

/** Nom de variable valide pour le shell : défense contre un store modifié à la main. */
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

export function applyProfile(
  event: { command: string; env: Record<string, string> },
  spec: AgentSpec,
  profile: Profile,
  provider: Provider | null
): { command: string; env: Record<string, string> } {
  const command = rewriteForProfile(event.command, spec, profile)
  // Sans fournisseur (tout agent autre que Claude, ou Claude sur son compte) : seule la commande change.
  if (provider === null) return { command, env: event.env }

  const env = { ...event.env }
  const references: [string, string][] = []
  const assign = (name: string, value: string) => {
    if (isEnvReference(value)) references.push([name, value.slice(1)])
    else env[name] = value
  }
  env.ANTHROPIC_BASE_URL = provider.baseUrl
  assign('ANTHROPIC_AUTH_TOKEN', provider.token)
  env.ANTHROPIC_API_KEY = ''
  for (const [name, value] of Object.entries(provider.extraEnv)) {
    if (VARIABLE_NAME.test(name)) assign(name, value)
  }
  if (profile.model !== null) {
    for (const name of MODEL_TIER_VARS) if (!Object.hasOwn(env, name)) env[name] = profile.model
  }
  if (!Object.hasOwn(env, SUBAGENT_MODEL_FORCE_VAR)) env[SUBAGENT_MODEL_FORCE_VAR] = '1'

  // Affectations en tête : l'URL et la clé vide (non secrètes) d'abord, puis les références `$NOM`.
  // Un `export` plus loin dans ~/.zshenv ne peut ainsi écraser ni l'un ni l'autre. Un jeton littéral
  // reste dans `env` seulement : il pourrait être un secret, et la ligne de commande se journalise.
  const routing = `ANTHROPIC_BASE_URL=${shellQuote(provider.baseUrl)} ANTHROPIC_API_KEY=''`
  const prefix = references.length > 0 ? `${routing} ${shellAssignments(references)}` : routing
  return { command: `${prefix} ${command}`, env }
}
