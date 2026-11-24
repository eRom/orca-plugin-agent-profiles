// Contrat panneau <-> worker, déclaré une fois par fusion de déclarations sur `orca` (gabarit worker-panel d'Orca).
import type { Inventory } from './inventory'
import type { FieldErrors, Profile, Provider, Store } from './store'

export type SaveResult = { ok: true; store: Store } | { ok: false; errors: FieldErrors }
export type DeleteResult = { ok: true; store: Store } | { ok: false; error: string }
export type LaunchResult = { ok: true } | { ok: false; reason: string }

declare module 'orca' {
  interface PluginRequests {
    /** Langue d'affichage du panneau (BCP-47) : le worker la retient et la persiste pour ses propres messages. */
    'locale.set': { input: { locale: string }; output: { ok: true } }
    'store.get': { output: Store }
    'profile.save': { input: { profile: Profile }; output: SaveResult }
    'profile.delete': { input: { profileId: string }; output: DeleteResult }
    'provider.save': { input: { provider: Provider }; output: SaveResult }
    'provider.delete': { input: { providerId: string }; output: DeleteResult }
    'profile.launch': { input: { profileId: string }; output: LaunchResult }
    /** Épingle ou retire un profil de la barre d'état ; refuse au-delà de `MAX_FAVORITES`. */
    'profile.favorite': { input: { profileId: string; favorite: boolean }; output: DeleteResult }
    'agents.list': { output: Inventory }
    'agents.refresh': { output: Inventory }
    /** Chemins relatifs à la racine du plugin : `avatars/…` puis `agent-icons/…`. */
    'avatars.list': { output: { files: string[] } }
  }
  interface PluginPanelEvents {
    'store.changed': Store
    'agents.changed': Inventory
  }
}
