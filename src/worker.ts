// Worker du plugin : seul écrivain du store, il répond au panneau, tient l'inventaire des agents activés dans
// Orca, applique les profils via le hook agent.launch.before et expose la commande de relance.
// Orca transpile ce fichier au chargement.
import type { OrcaWorkerApi } from 'orca/worker'
import { agentById } from './agents'
import { listAvatarFiles, pluginDirectory } from './avatars'
import { LOCALES, localeOf, MESSAGES, type Locale, type Messages } from './copy'
import { detectAgents, enabledAgents, REAL_INVENTORY_DEPS, type Inventory, type InventoryDeps } from './inventory'
import { applyProfile, dialectFor, findProfileByModel, readFlag, supportsProviders } from './launch'
import type { DeleteResult, LaunchResult, SaveResult } from './protocol'
import {
  EMPTY_STORE,
  favoriteProfiles,
  MAX_FAVORITES,
  newId,
  parseStore,
  removeProfile,
  removeProvider,
  setFavorite,
  STORE_KEY,
  upsertProfile,
  upsertProvider,
  validateProfile,
  validateProvider,
  type FieldErrors,
  type Profile,
  type Provider,
  type Store
} from './store'

/** Délai pendant lequel le prochain lancement de l'agent du profil choisi reprend ce profil. */
const PENDING_TTL_MS = 15_000
/** Âge maximal d'un inventaire servi par `agents.list` sans nouvelle sonde. */
const INVENTORY_TTL_MS = 10_000

/** Clé de stockage de la dernière langue annoncée par un panneau : distincte de celle du store, qui ne change pas de forme. */
export const LOCALE_KEY = 'ui.locale'

type Source = 'panel' | 'relaunch' | 'favorite'

/** Id de l'emplacement `slot` (1 à `MAX_FAVORITES`) dans `contributes.statusBarItems`, et de sa commande. */
export const favoriteItemId = (slot: number): string => `favorite-${slot}`
export const favoriteCommandId = (slot: number): string => `agentProfiles.favorite${slot}`

type StatusItem = { id: string; text?: string; icon?: 'star'; tooltip?: string; visible: boolean }
type Pending = { profileId: string; agentId: string; source: Source; at: number }

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))
/** Code d'une erreur de l'hôte (`unknown_method`, `unavailable`…), pour les logs. */
const codeOf = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'unknown'

const sameInventory = (a: Inventory, b: Inventory): boolean =>
  a.settingsReadable === b.settingsReadable && a.agents.length === b.agents.length && a.agents.every((id, i) => id === b.agents[i])

export default function activate(orca: OrcaWorkerApi): Promise<void> {
  return activateWith(orca, REAL_INVENTORY_DEPS)
}

export async function activateWith(orca: OrcaWorkerApi, deps: InventoryDeps): Promise<void> {
  let store: Store = EMPTY_STORE
  let pending: Pending | null = null
  let lastDenyReason: string | null = null
  let writing: Promise<unknown> = Promise.resolve()
  let launching: Promise<unknown> = Promise.resolve()
  let inventory: Inventory | null = null
  let probing: Promise<Inventory> | null = null
  /** Commandes trouvées par la dernière sonde retenue : sert à recalculer les agents activés sans shell. */
  let lastFound: ReadonlySet<string> | null = null
  /** Numéro de la dernière sonde lancée : une sonde plus ancienne qui finit après ne doit rien écrire. */
  let generation = 0
  let settingsReadable: boolean | null = null
  /** Langue des messages du worker (refus, validations, retour de commande) ; celle du dernier panneau monté. */
  let locale: Locale = 'en'
  /** Valeur présente dans le stockage, pour n'écrire que lorsqu'elle change. */
  let storedLocale: Locale | null = null
  const m = (): Messages => MESSAGES[locale]
  /** Dernier état envoyé à chaque emplacement de la barre d'état, pour n'appeler l'hôte que sur un changement. */
  const shownItems = new Map<string, string>()
  let statusSync: Promise<void> = Promise.resolve()

  /** Lit le store ; absent, il est créé vide ; illisible, il est copié de côté avant d'être remplacé. */
  async function load(): Promise<void> {
    const raw = await orca.storage.get(STORE_KEY)
    const parsed = raw === null ? null : parseStore(raw)
    if (parsed) {
      store = parsed
      return
    }
    if (raw !== null) {
      const backupKey = `${STORE_KEY}.corrupt-${Date.now()}`
      await orca.storage.set(backupKey, raw)
      orca.log(`store invalid, backed up to ${backupKey}`)
    }
    await orca.storage.set(STORE_KEY, EMPTY_STORE)
    store = EMPTY_STORE
  }

  /** Langue relue au démarrage : anglais tant qu'aucun panneau n'en a annoncé une, puis la dernière vue. */
  async function loadLocale(): Promise<void> {
    try {
      const raw = await orca.storage.get(LOCALE_KEY)
      const known = LOCALES.find((candidate) => candidate === raw)
      if (known) {
        locale = known
        storedLocale = known
      }
    } catch (error) {
      // Appel best effort : une lecture refusée laisse l'anglais, elle ne doit pas empêcher l'activation.
      orca.log(`locale read failed code=${codeOf(error)}`)
    }
  }

  const ready = Promise.all([load(), loadLocale()]).then(() => undefined)

  /** Sonde les agents activés ; poste `agents.changed` si la liste ou la lisibilité des réglages a bougé. */
  function probe(): Promise<Inventory> {
    const mine = ++generation
    const run: Promise<Inventory> = detectAgents(deps, () => orca.log('shell probe failed, PATH fallback'))
      .then(({ inventory: next, found }) => {
        // Seule la sonde la plus récente écrit : une plus ancienne, lente, rendrait un état périmé.
        if (mine !== generation) return next
        const changed = inventory === null || !sameInventory(inventory, next)
        inventory = next
        lastFound = found
        if (!next.settingsReadable && settingsReadable !== false) orca.log('settings unreadable')
        settingsReadable = next.settingsReadable
        if (changed) orca.panels.post('agents.changed', next)
        return next
      })
      .finally(() => {
        if (probing === run) probing = null
      })
    probing = run
    return run
  }

  /** Le cache sert 10 s ; deux demandes simultanées partagent la même sonde. */
  function listInventory(): Promise<Inventory> {
    if (probing) return probing
    if (inventory && deps.now() - inventory.detectedAt < INVENTORY_TTL_MS) return Promise.resolve(inventory)
    return probe()
  }

  // Au démarrage, sans bloquer l'activation : un volet peut déjà attendre l'inventaire.
  probe().catch((error: unknown) => orca.log(`inventory failed: ${messageOf(error)}`))

  /** Les écritures passent une par une : pas de mise à jour perdue entre deux requêtes concurrentes. */
  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = writing.then(task)
    writing = run.catch(() => undefined)
    return run
  }

  async function commit(next: Store): Promise<Store> {
    await orca.storage.set(STORE_KEY, next)
    store = next
    orca.panels.post('store.changed', next)
    syncStatusBar()
    return next
  }

  /** État voulu des emplacements : un favori par emplacement, dans l'ordre d'ajout, les autres masqués. */
  function statusItems(): StatusItem[] {
    const favorites = favoriteProfiles(store)
    return Array.from({ length: MAX_FAVORITES }, (_, index) => {
      const id = favoriteItemId(index + 1)
      const profile = favorites[index]
      if (!profile) return { id, visible: false }
      const label = agentById(profile.agentId)?.label ?? profile.agentId
      // Bornes du schéma d'Orca : 64 caractères de texte, 256 d'infobulle.
      return { id, text: profile.name.slice(0, 64), icon: 'star', tooltip: m().favoriteTooltip(profile.name, label).slice(0, 256), visible: true }
    })
  }

  /**
   * Pousse vers Orca les emplacements qui ont changé, un appel à la fois et dans l'ordre des écritures.
   * Best effort : hors app desktop, ou sur un Orca sans barre d'état, le reste du plugin fonctionne.
   */
  function syncStatusBar(): Promise<void> {
    const wanted = statusItems()
    statusSync = statusSync.then(async () => {
      for (const item of wanted) {
        const key = JSON.stringify(item)
        if (shownItems.get(item.id) === key) continue
        try {
          await orca.host.call('statusBar.update', item)
          shownItems.set(item.id, key)
        } catch (error) {
          orca.log(`status bar update failed item=${item.id} code=${codeOf(error)}`)
        }
      }
    })
    return statusSync
  }

  const save = <T extends Profile | Provider>(
    draft: T,
    kind: 'profile' | 'provider',
    validate: (current: Store, draft: T, messages: Messages) => FieldErrors,
    upsert: (current: Store, item: T) => Store
  ): Promise<SaveResult> =>
    serialize(async () => {
      await ready
      const errors = validate(store, draft, m())
      if (Object.keys(errors).length > 0) return { ok: false, errors }
      const id = draft.id === '' ? newId(kind) : draft.id
      return { ok: true, store: await commit(upsert(store, { ...draft, id })) }
    })

  /** Les lancements passent un par un : `pending` et `lastDenyReason` ne se partagent pas entre deux lancements. */
  function enqueueLaunch(task: () => Promise<LaunchResult>): Promise<LaunchResult> {
    const run = launching.then(task)
    launching = run.catch(() => undefined)
    return run
  }

  const launchProfile = (profileId: string, source: Source): Promise<LaunchResult> =>
    enqueueLaunch(() => runLaunch(profileId, source))

  async function runLaunch(profileId: string, source: Source): Promise<LaunchResult> {
    await ready
    lastDenyReason = null
    const profile = store.profiles.find((p) => p.id === profileId)
    if (!profile) return { ok: false, reason: m().profileNotFound }
    if (!agentById(profile.agentId)) return { ok: false, reason: m().agentUnknown }
    const context = await orca.host.call('workspace.readContext', {})
    if (!context?.workspaceId) return { ok: false, reason: m().noWorkspace }

    // agent.launch ne prend ni modèle ni env : le hook ci-dessous applique le profil en attente.
    pending = { profileId, agentId: profile.agentId, source, at: Date.now() }
    let launched: { terminalId: string }
    try {
      launched = await orca.host.call('agent.launch', { workspaceId: context.workspaceId, agent: profile.agentId })
    } catch (error) {
      pending = null
      return { ok: false, reason: lastDenyReason ?? messageOf(error) }
    }
    // Si le hook n'a pas consommé l'entrée, elle ne doit pas survivre à ce lancement.
    const unconsumed = pending !== null
    pending = null
    if (lastDenyReason) return { ok: false, reason: lastDenyReason }
    if (unconsumed) {
      // Un agent non réglé tourne avec les réglages d'Orca (pour Claude, le compte Anthropic) : le montrer.
      await focusTerminal(launched.terminalId)
      return { ok: false, reason: profile.providerId !== null ? m().routingNotTaken : m().profileNotApplied(profile.name) }
    }
    await focusTerminal(launched.terminalId)
    await serialize(() => commit({ ...store, lastProfileId: profileId }))
    return { ok: true }
  }

  /** agent.launch ouvre le terminal en arrière-plan : sans ce focus, le clic semble ne rien faire. */
  async function focusTerminal(terminalId: string): Promise<void> {
    try {
      const { focused } = await orca.host.call('terminal.focus', { terminalId })
      // false : une demande de focus plus récente a gagné, ou la fenêtre n'a pas suivi.
      if (!focused) orca.log(`focus not taken terminal=${terminalId}`)
    } catch (error) {
      // L'agent tourne déjà : un focus refusé (hors app desktop, Orca trop ancien) n'annule pas le lancement.
      orca.log(`focus failed terminal=${terminalId} code=${codeOf(error)}`)
    }
  }

  orca.panels.handle('locale.set', async ({ locale: tag }) => {
    await ready
    locale = localeOf(tag)
    if (storedLocale !== locale) {
      await orca.storage.set(LOCALE_KEY, locale)
      storedLocale = locale
    }
    // Les infobulles de la barre d'état suivent la langue annoncée.
    syncStatusBar()
    return { ok: true as const }
  })

  orca.panels.handle('store.get', async () => {
    await ready
    return store
  })

  orca.panels.handle('profile.save', ({ profile }) =>
    save(
      { ...profile, name: profile.name.trim(), model: profile.model === null ? null : profile.model.trim() },
      'profile',
      validateProfile,
      upsertProfile
    )
  )

  orca.panels.handle('provider.save', ({ provider }) =>
    save(
      { ...provider, name: provider.name.trim(), baseUrl: provider.baseUrl.trim(), token: provider.token.trim() },
      'provider',
      validateProvider,
      upsertProvider
    )
  )

  orca.panels.handle('profile.delete', ({ profileId }) =>
    serialize(async (): Promise<DeleteResult> => {
      await ready
      if (!store.profiles.some((p) => p.id === profileId)) return { ok: false, error: m().profileNotFound }
      return { ok: true, store: await commit(removeProfile(store, profileId)) }
    })
  )

  orca.panels.handle('provider.delete', ({ providerId }) =>
    serialize(async (): Promise<DeleteResult> => {
      await ready
      if (!store.providers.some((p) => p.id === providerId)) return { ok: false, error: m().providerNotFound }
      const removed = removeProvider(store, providerId, m())
      if ('error' in removed) return { ok: false, error: removed.error }
      return { ok: true, store: await commit(removed.store) }
    })
  )

  orca.panels.handle('profile.favorite', ({ profileId, favorite }) =>
    serialize(async (): Promise<DeleteResult> => {
      await ready
      const changed = setFavorite(store, profileId, favorite, m())
      if ('error' in changed) return { ok: false, error: changed.error }
      return { ok: true, store: changed.store === store ? store : await commit(changed.store) }
    })
  )

  orca.panels.handle('profile.launch', ({ profileId }) => launchProfile(profileId, 'panel'))
  orca.panels.handle('agents.list', () => listInventory())
  orca.panels.handle('agents.refresh', () => probe())

  orca.panels.handle('avatars.list', () => ({
    files: [
      ...listAvatarFiles(pluginDirectory('avatars')).map((file) => `avatars/${file}`),
      ...listAvatarFiles(pluginDirectory('agent-icons')).map((file) => `agent-icons/${file}`)
    ]
  }))

  /** Lancement par une commande (raccourci, palette, barre d'état) : le message rendu s'affiche dans Orca. */
  async function launchFromCommand(profile: Profile, source: Source): Promise<string> {
    const spec = agentById(profile.agentId)
    // Les réglages d'Orca sont relus à chaque relance (synchrone, sans shell) ; une sonde n'est attendue que si aucune n'a abouti.
    const enabled = lastFound ? enabledAgents(lastFound, deps.readSettings()) : (await listInventory()).agents
    if (spec && !enabled.includes(spec.id)) return m().agentDisabled(spec.label)
    const result = await launchProfile(profile.id, source)
    return result.ok ? m().launched(profile.name) : result.reason
  }

  orca.commands.register('agentProfiles.relaunchLast', async () => {
    await ready
    const profile = store.profiles.find((p) => p.id === store.lastProfileId)
    if (!profile) return m().noLastProfile
    return launchFromCommand(profile, 'relaunch')
  })

  for (let slot = 1; slot <= MAX_FAVORITES; slot++) {
    orca.commands.register(favoriteCommandId(slot), async () => {
      await ready
      const profile = favoriteProfiles(store)[slot - 1]
      if (!profile) return m().noFavoriteInSlot(slot)
      return launchFromCommand(profile, 'favorite')
    })
  }

  orca.hooks.on('agent.launch.before', async (event, next) => {
    await ready

    // Pas de test sur le workspace : l'identifiant lu par le worker (workspace.readContext) n'a pas le même
    // format que `event.workspaceId` du hook (constaté en direct sur Orca 1.4.259). Seuls comptent l'agent
    // et la fraîcheur : un profil en attente ne s'applique jamais au lancement d'un autre agent.
    const fromPending =
      pending && pending.agentId === event.agent && Date.now() - pending.at < PENDING_TTL_MS ? pending : null
    if (fromPending) pending = null

    // Lu à chaque lancement : le shell des terminaux peut changer dans les réglages d'Orca sans redémarrage.
    const syntax = deps.launchShell()
    let profile: Profile | undefined
    if (fromPending) {
      profile = store.profiles.find((p) => p.id === fromPending.profileId)
      if (!profile) {
        // Le profil choisi dans le panneau a disparu du store : jamais de passage silencieux vers les réglages d'Orca.
        lastDenyReason = m().profileNotFound
        orca.log(`deny profile=${fromPending.profileId} reason=missing`)
        return { deny: lastDenyReason }
      }
    } else if (event.agent === 'claude') {
      profile = findProfileByModel(store.profiles, readFlag(event.command, '--model', dialectFor(syntax)))
    }
    if (!profile) return undefined
    const chosen = profile

    const deny = (reason: string, why: string) => {
      // Seul un refus du profil choisi dans le panneau est celui du lancement en cours ; un lancement natif refusé a le sien.
      if (fromPending) lastDenyReason = reason
      orca.log(`deny profile=${chosen.id} reason=${why}`)
      return { deny: reason }
    }
    const spec = agentById(chosen.agentId)
    if (!spec) return deny(m().agentUnknown, 'agent-unknown')
    // Le store vient d'un stockage non fiable (éditions à la main) : on revérifie ici ce que validateProfile garantit à l'écriture.
    if (chosen.providerId !== null && !spec.supportsProvider) return deny(m().providerClaudeOnly, 'provider-claude-only')
    if (chosen.providerId !== null && chosen.model === null) return deny(m().modelRequired, 'model-required')
    const provider = chosen.providerId === null ? null : store.providers.find((p) => p.id === chosen.providerId)
    if (provider === undefined) return deny(m().profileProviderMissing(chosen.name), 'provider-missing')

    if (provider !== null && !supportsProviders(syntax)) return deny(m().providerShellUnsupported, 'shell-unsupported')
    const applied = applyProfile(event, spec, chosen, provider, m(), syntax)
    orca.log(`profile=${chosen.id} agent=${chosen.agentId} via=${fromPending?.source ?? 'model-flag'}`)
    return next({ ...event, ...applied })
  })

  await ready
  // Les éléments de la barre d'état repartent masqués à chaque démarrage d'Orca : on y remet les favoris du store.
  void syncStatusBar()
}
