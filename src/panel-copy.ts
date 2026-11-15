// Messages dans la langue d'affichage d'Orca, lue à chaque appel : seul module à mêler `env.locale` et copy.ts.
import { env } from 'orca'
import { messagesFor, type Messages } from './copy'

export const copy = (): Messages => messagesFor(env.locale)

/** Comparateur d'affichage : casse et accents ignorés, nombres dans l'ordre naturel (« 9 » avant « 10 »), selon la langue d'Orca. */
export const byName = (a: string, b: string): number => a.localeCompare(b, env.locale, { sensitivity: 'base', numeric: true })
