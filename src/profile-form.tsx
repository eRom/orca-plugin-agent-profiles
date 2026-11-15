// Formulaire d'un profil : il s'ouvre à la place de la liste et parle au worker par profile.save / profile.delete.
import { atom, Button, Callout, Field, Heading, Input, plugin, read, Row, Select, set, Stack, Textarea, update } from 'orca'
import { agentById } from './agents'
import type { Messages } from './copy'
import { copy } from './panel-copy'
import { shellQuote, splitWords } from './launch'
import { newId, type FieldErrors, type Profile, type Store } from './store'

/** Valeurs de remplacement : un `Select` dont une option vaut '' est abandonné en entier par Orca. */
const NO_AVATAR = 'none'
const DEFAULT_EFFORT = 'default'
const NO_PROVIDER = 'none'

type Draft = {
  id: string
  /** Fixé à l'ouverture : un profil ne change pas d'agent. */
  agentId: string
  name: string
  avatar: string
  providerId: string
  model: string
  effort: string
  /** Un argument par ligne. */
  extraArgs: string
}

type FormState = { draft: Draft; isNew: boolean; errors: FieldErrors; formError: string | null; busy: boolean }

/** Formulaire ouvert, ou null quand la liste est affichée. */
export const profileForm = atom<FormState | null>(null)

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export function openProfileForm(agentId: string, profile: Profile | null): void {
  const draft: Draft = profile
    ? {
        id: profile.id,
        agentId: profile.agentId,
        name: profile.name,
        avatar: profile.avatar ?? NO_AVATAR,
        providerId: profile.providerId ?? NO_PROVIDER,
        model: profile.model ?? '',
        effort: profile.effort ?? DEFAULT_EFFORT,
        extraArgs: profile.extraArgs.map(displayArg).join('\n')
      }
    : {
        id: newId('profile'),
        agentId,
        name: '',
        avatar: NO_AVATAR,
        providerId: NO_PROVIDER,
        model: '',
        effort: DEFAULT_EFFORT,
        extraArgs: ''
      }
  set(profileForm, { draft, isNew: profile === null, errors: {}, formError: null, busy: false })
}

function patch(change: Partial<Draft>): void {
  update(profileForm, (state) => (state ? { ...state, draft: { ...state.draft, ...change } } : state))
}

/** Un champ que l'agent ne porte pas (pas de flag, pas de fournisseur) s'enregistre à null, quoi que le brouillon contienne. */
function toProfile(draft: Draft): Profile {
  const spec = agentById(draft.agentId)
  return {
    id: draft.id,
    agentId: draft.agentId,
    name: draft.name,
    avatar: draft.avatar === NO_AVATAR ? null : draft.avatar,
    model: spec?.model && draft.model.trim() !== '' ? draft.model : null,
    effort: spec?.effort && draft.effort !== DEFAULT_EFFORT ? draft.effort : null,
    providerId: spec?.supportsProvider && draft.providerId !== NO_PROVIDER ? draft.providerId : null,
    // Chaque ligne se découpe en mots, guillemets respectés : `--note "a b"` donne deux arguments.
    extraArgs: draft.extraArgs.split(/\r?\n/).flatMap((line) => splitWords(line).map((word) => word.value))
  }
}

/** Un argument qui contient un espace ou un guillemet s'affiche quoté, pour que l'enregistrer de nouveau le garde entier. */
const displayArg = (arg: string): string => (/[\s'"\\]/.test(arg) || arg === '' ? shellQuote(arg) : arg)

function close(): void {
  set(profileForm, null)
}

function settle(change: Partial<FormState>): void {
  update(profileForm, (state) => (state ? { ...state, busy: false, ...change } : state))
}

async function save(onStore: (next: Store) => void): Promise<void> {
  const state = read(profileForm)
  if (!state || state.busy) return
  update(profileForm, (s) => (s ? { ...s, busy: true, errors: {}, formError: null } : s))
  try {
    const result = await plugin.request('profile.save', { profile: toProfile(state.draft) })
    if (result.ok) {
      onStore(result.store)
      close()
    } else {
      settle({ errors: result.errors })
    }
  } catch (error) {
    settle({ formError: messageOf(error) })
  }
}

async function remove(onStore: (next: Store) => void): Promise<void> {
  const state = read(profileForm)
  if (!state || state.busy) return
  update(profileForm, (s) => (s ? { ...s, busy: true, errors: {}, formError: null } : s))
  try {
    const result = await plugin.request('profile.delete', { profileId: state.draft.id })
    if (result.ok) {
      onStore(result.store)
      close()
    } else {
      settle({ formError: result.error })
    }
  } catch (error) {
    settle({ formError: messageOf(error) })
  }
}

/** Nom du fichier sans son dossier ni son extension. */
const stemOf = (file: string): string => file.replace(/^.*\//, '').replace(/\.[^.]+$/, '')

/** Une icône d'agent porte le même nom qu'un avatar (« claude ») : le libellé les distingue. */
const avatarLabel = (file: string, m: Messages): string => (file.startsWith('agent-icons/') ? m.agentIconLabel(stemOf(file)) : stemOf(file))

function avatarOptions(files: string[], chosen: string, m: Messages) {
  // Un fichier choisi mais disparu du dossier reste une option : l'enregistrer ne doit pas l'effacer en silence.
  const names = chosen !== NO_AVATAR && !files.includes(chosen) ? [...files, chosen] : files
  return [{ value: NO_AVATAR, label: m.avatarNone }, ...names.map((file) => ({ value: file, label: avatarLabel(file, m) }))]
}

const effortLabel = (value: string, m: Messages): string => (m.efforts as Record<string, string>)[value] ?? value

export function renderProfileForm(current: Store, files: string[], onStore: (next: Store) => void) {
  const m = copy()
  const state = read(profileForm)
  if (!state) return null
  const { draft, errors, formError, busy, isNew } = state
  const spec = agentById(draft.agentId)
  return (
    <Stack gap="md">
      <Heading level={3}>{isNew ? m.newProfileFor(spec?.label ?? draft.agentId) : m.editProfileTitle}</Heading>
      <Field label={m.fieldName} error={errors.name}>
        <Input label={m.fieldName} labelHidden value={draft.name} invalid={!!errors.name} onChange={(name) => patch({ name })} />
      </Field>
      <Field label={m.fieldAvatar}>
        <Select
          label={m.fieldAvatar}
          labelHidden
          value={draft.avatar}
          options={avatarOptions(files, draft.avatar, m)}
          onChange={(avatar) => patch({ avatar })}
        />
      </Field>
      {spec?.model ? (
        <Field label={m.fieldModel} error={errors.model}>
          <Input label={m.fieldModel} labelHidden value={draft.model} invalid={!!errors.model} onChange={(model) => patch({ model })} />
        </Field>
      ) : null}
      {spec?.effort ? (
        <Field label={m.fieldEffort} error={errors.effort}>
          <Select
            label={m.fieldEffort}
            labelHidden
            value={draft.effort}
            options={[
              { value: DEFAULT_EFFORT, label: m.effortDefault },
              ...spec.effort.values.map((value) => ({ value, label: effortLabel(value, m) }))
            ]}
            onChange={(effort) => patch({ effort })}
          />
        </Field>
      ) : null}
      {spec?.supportsProvider ? (
        <Field label={m.fieldProvider} error={errors.providerId}>
          <Select
            label={m.fieldProvider}
            labelHidden
            value={draft.providerId}
            options={[
              { value: NO_PROVIDER, label: m.providerNone },
              ...current.providers.map((p) => ({ value: p.id, label: p.name }))
            ]}
            onChange={(providerId) => patch({ providerId })}
          />
        </Field>
      ) : null}
      <Field label={m.fieldExtraArgs}>
        <Textarea
          label={m.fieldExtraArgs}
          labelHidden
          rows={3}
          value={draft.extraArgs}
          placeholder={m.extraArgsPlaceholder}
          onChange={(extraArgs) => patch({ extraArgs })}
        />
      </Field>
      {errors.agentId ? <Callout tone="danger">{errors.agentId}</Callout> : null}
      {formError === null ? null : <Callout tone="danger">{formError}</Callout>}
      <Row justify="between" align="center">
        <Row gap="xs">
          <Button disabled={busy} onPress={() => save(onStore)}>
            {m.save}
          </Button>
          <Button variant="ghost" onPress={close}>
            {m.cancel}
          </Button>
        </Row>
        {isNew ? null : (
          <Button variant="outline" tone="danger" disabled={busy} onPress={() => remove(onStore)}>
            {m.remove}
          </Button>
        )}
      </Row>
    </Stack>
  )
}
