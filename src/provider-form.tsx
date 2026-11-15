// Formulaire d'un fournisseur : même principe que celui d'un profil, avec les variables d'environnement en lignes.
import { atom, Button, Callout, Field, Heading, Input, plugin, read, Row, set, Stack, Textarea, update } from 'orca'
import { COPY } from './copy'
import { formatEnvLines, isEnvReference, newId, parseEnvLines, type FieldErrors, type Provider, type Store } from './store'

/** Au-delà de cette longueur, un jeton qui n'est pas une référence `$NOM` ressemble à un vrai secret. */
const LITERAL_TOKEN_MIN_LENGTH = 12

type Draft = { id: string; name: string; baseUrl: string; token: string; extraEnv: string }

type FormState = { draft: Draft; isNew: boolean; errors: FieldErrors; formError: string | null; busy: boolean }

/** Formulaire ouvert, ou null quand la liste est affichée. */
export const providerForm = atom<FormState | null>(null)

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export function openProviderForm(_current: Store, provider: Provider | null): void {
  const draft: Draft = provider
    ? {
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        token: provider.token,
        extraEnv: formatEnvLines(provider.extraEnv)
      }
    : { id: newId('provider'), name: '', baseUrl: '', token: '', extraEnv: '' }
  set(providerForm, { draft, isNew: provider === null, errors: {}, formError: null, busy: false })
}

function patch(change: Partial<Draft>): void {
  update(providerForm, (state) => (state ? { ...state, draft: { ...state.draft, ...change } } : state))
}

function close(): void {
  set(providerForm, null)
}

function settle(change: Partial<FormState>): void {
  update(providerForm, (state) => (state ? { ...state, busy: false, ...change } : state))
}

async function save(onStore: (next: Store) => void): Promise<void> {
  const state = read(providerForm)
  if (!state || state.busy) return
  const { draft } = state
  const parsed = parseEnvLines(draft.extraEnv)
  if ('error' in parsed) {
    update(providerForm, (s) => (s ? { ...s, errors: { extraEnv: parsed.error }, formError: null } : s))
    return
  }
  update(providerForm, (s) => (s ? { ...s, busy: true, errors: {}, formError: null } : s))
  try {
    const provider: Provider = { id: draft.id, name: draft.name, baseUrl: draft.baseUrl, token: draft.token, extraEnv: parsed.env }
    const result = await plugin.request('provider.save', { provider })
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
  const state = read(providerForm)
  if (!state || state.busy) return
  update(providerForm, (s) => (s ? { ...s, busy: true, errors: {}, formError: null } : s))
  try {
    const result = await plugin.request('provider.delete', { providerId: state.draft.id })
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

export function renderProviderForm(onStore: (next: Store) => void) {
  const state = read(providerForm)
  if (!state) return null
  const { draft, errors, formError, busy, isNew } = state
  // Le worker range le jeton rogné : l'avertissement lit donc la même valeur.
  const token = draft.token.trim()
  const literalToken = !isEnvReference(token) && token.length > LITERAL_TOKEN_MIN_LENGTH
  return (
    <Stack gap="md">
      <Heading level={3}>{isNew ? COPY.newProvider : COPY.editProviderTitle}</Heading>
      <Field label={COPY.fieldName} error={errors.name}>
        <Input label={COPY.fieldName} labelHidden value={draft.name} invalid={!!errors.name} onChange={(name) => patch({ name })} />
      </Field>
      <Field label={COPY.fieldBaseUrl} error={errors.baseUrl}>
        <Input
          label={COPY.fieldBaseUrl}
          labelHidden
          value={draft.baseUrl}
          invalid={!!errors.baseUrl}
          onChange={(baseUrl) => patch({ baseUrl })}
        />
      </Field>
      <Field label={COPY.fieldToken} error={errors.token}>
        <Input
          label={COPY.fieldToken}
          labelHidden
          value={draft.token}
          placeholder={COPY.tokenPlaceholder}
          invalid={!!errors.token}
          onChange={(token) => patch({ token })}
        />
      </Field>
      {literalToken ? <Callout tone="warning">{COPY.literalToken}</Callout> : null}
      <Field label={COPY.fieldExtraEnv} error={errors.extraEnv}>
        <Textarea
          label={COPY.fieldExtraEnv}
          labelHidden
          rows={3}
          value={draft.extraEnv}
          placeholder={COPY.extraEnvPlaceholder}
          invalid={!!errors.extraEnv}
          onChange={(extraEnv) => patch({ extraEnv })}
        />
      </Field>
      {formError === null ? null : <Callout tone="danger">{formError}</Callout>}
      <Row justify="between" align="center">
        <Row gap="xs">
          <Button disabled={busy} onPress={() => save(onStore)}>
            {COPY.save}
          </Button>
          <Button variant="ghost" onPress={close}>
            {COPY.cancel}
          </Button>
        </Row>
        {isNew ? null : (
          <Button variant="outline" tone="danger" disabled={busy} onPress={() => remove(onStore)}>
            {COPY.remove}
          </Button>
        )}
      </Row>
    </Stack>
  )
}
