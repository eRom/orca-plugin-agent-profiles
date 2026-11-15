// Tout le texte affiché par le plugin, en un seul endroit, en anglais et en français.
// Module pur (sans 'orca') : le worker, le panneau et les tests l'importent tous.

export type Locale = 'en' | 'fr'

export const LOCALES: readonly Locale[] = ['en', 'fr']

/** Niveaux d'effort que les agents de la table acceptent (`src/agents.ts`) ; une valeur inconnue s'affiche telle quelle. */
export type EffortKey = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'

export type Messages = {
  nameRequired: string
  modelRequired: string
  modelTaken: (name: string) => string
  providerNotFound: string
  nameTaken: string
  agentUnknown: string
  modelNotAccepted: string
  effortNotSupported: string
  providerClaudeOnly: string
  baseUrlRequired: string
  baseUrlScheme: string
  baseUrlNoV1: string
  tokenRequired: string
  envLine: (line: number) => string
  providerInUse: (names: string) => string
  noWorkspace: string
  routingNotTaken: string
  noLastProfile: string
  profileNotFound: string
  profileNotApplied: (name: string) => string
  agentDisabled: (label: string) => string
  profileProviderMissing: (name: string) => string
  launched: (name: string) => string
  literalToken: string
  /** Inséré dans `${NOM:?…}` du shell : ni `"`, ni `}`, ni `$`, ni accent grave, ni antislash. */
  envMissing: string

  // Panneau : groupes par agent, fournisseurs, états.
  tabProviders: string
  newProfileFor: (label: string) => string
  newProvider: string
  editProfileTitle: string
  editProviderTitle: string
  refreshAgents: string
  launch: (name: string) => string
  edit: (name: string) => string
  lastBadge: string
  unknownProvider: string
  noProfileForAgent: string
  collapseGroup: (label: string) => string
  expandGroup: (label: string) => string
  profileCount: (count: number) => string
  noProviderHint: string
  detectingAgents: string
  detectFailedTitle: string
  noAgentTitle: string
  noAgentHint: string
  settingsUnreadable: string
  launchFailedTitle: string
  loading: string
  loadFailedTitle: string
  retry: string

  // Formulaires.
  fieldName: string
  fieldAvatar: string
  fieldProvider: string
  fieldModel: string
  fieldEffort: string
  fieldExtraArgs: string
  extraArgsPlaceholder: string
  fieldBaseUrl: string
  fieldToken: string
  tokenPlaceholder: string
  fieldExtraEnv: string
  extraEnvPlaceholder: string
  save: string
  cancel: string
  remove: string
  avatarNone: string
  agentIconLabel: (name: string) => string
  providerNone: string
  effortDefault: string
  efforts: Record<EffortKey, string>
}

const fr: Messages = {
  nameRequired: 'Nom requis.',
  modelRequired: 'Modèle requis.',
  modelTaken: (name) => `Modèle déjà utilisé par « ${name} ».`,
  providerNotFound: 'Fournisseur introuvable.',
  nameTaken: 'Nom déjà utilisé pour cet agent.',
  agentUnknown: 'Agent inconnu.',
  modelNotAccepted: 'Cet agent ne prend pas de modèle.',
  effortNotSupported: 'Effort non pris en charge par cet agent.',
  providerClaudeOnly: 'Fournisseur réservé à Claude.',
  baseUrlRequired: 'URL requise.',
  baseUrlScheme: "L'URL doit commencer par http:// ou https://.",
  baseUrlNoV1: 'Sans /v1 à la fin : Claude Code ajoute /v1/messages.',
  tokenRequired: 'Jeton requis.',
  envLine: (line) => `Ligne ${line} : forme attendue NOM=valeur.`,
  providerInUse: (names) => `Utilisé par : ${names}.`,
  noWorkspace: 'Ouvre un workspace pour lancer un profil.',
  routingNotTaken: "Le routage n'a pas pris : ce Claude utilise ton compte Anthropic, ferme-le.",
  noLastProfile: "Aucun profil lancé pour l'instant.",
  profileNotFound: 'Profil introuvable.',
  profileNotApplied: (name) => `Le profil « ${name} » n'a pas été appliqué : l'agent tourne avec les réglages d'Orca.`,
  agentDisabled: (label) => `${label} est désactivé dans Orca.`,
  profileProviderMissing: (name) => `« ${name} » : fournisseur introuvable.`,
  launched: (name) => `« ${name} » lancé.`,
  literalToken: 'Jeton stocké en clair dans le plugin ; préfère une référence $NOM.',
  envMissing: 'absente du shell, exporte-la dans ~/.zshenv',

  tabProviders: 'Fournisseurs',
  newProfileFor: (label) => `Nouveau profil ${label}`,
  newProvider: 'Nouveau fournisseur',
  editProfileTitle: 'Modifier le profil',
  editProviderTitle: 'Modifier le fournisseur',
  refreshAgents: 'Actualiser les agents',
  launch: (name) => `Lancer ${name}`,
  edit: (name) => `Modifier ${name}`,
  lastBadge: 'Dernier',
  unknownProvider: 'Fournisseur inconnu',
  noProfileForAgent: 'Aucun profil',
  collapseGroup: (label) => `Replier ${label}`,
  expandGroup: (label) => `Déplier ${label}`,
  profileCount: (count) => (count === 0 ? 'Aucun profil' : `${count} profil${count > 1 ? 's' : ''}`),
  noProviderHint: 'Crée ton premier fournisseur avec +',
  detectingAgents: 'Recherche des agents',
  detectFailedTitle: 'Détection impossible',
  noAgentTitle: 'Aucun agent activé',
  noAgentHint: "Active un agent dans les réglages d'Orca (Agents).",
  settingsUnreadable: "Réglages d'Orca illisibles : tous les agents installés sont affichés.",
  launchFailedTitle: 'Lancement impossible',
  loading: 'Chargement',
  loadFailedTitle: 'Chargement impossible',
  retry: 'Réessayer',

  fieldName: 'Nom',
  fieldAvatar: 'Avatar',
  fieldProvider: 'Fournisseur',
  fieldModel: 'Modèle',
  fieldEffort: 'Effort',
  fieldExtraArgs: 'Arguments supplémentaires',
  extraArgsPlaceholder: 'Un argument par ligne',
  fieldBaseUrl: 'URL de base',
  fieldToken: 'Jeton',
  tokenPlaceholder: '$NOM',
  fieldExtraEnv: 'Variables supplémentaires',
  extraEnvPlaceholder: 'NOM=valeur, une par ligne',
  save: 'Enregistrer',
  cancel: 'Annuler',
  remove: 'Supprimer',
  avatarNone: 'Aucun',
  agentIconLabel: (name) => `${name} (icône d'agent)`,
  providerNone: 'Aucun (compte Anthropic)',
  effortDefault: "Celui d'Orca",
  efforts: {
    off: 'Désactivée',
    minimal: 'Minimale',
    low: 'Basse',
    medium: 'Moyenne',
    high: 'Haute',
    xhigh: 'Extra',
    max: 'Max',
    ultra: 'Ultra'
  }
}

const en: Messages = {
  nameRequired: 'Name is required.',
  modelRequired: 'Model is required.',
  modelTaken: (name) => `Model already used by "${name}".`,
  providerNotFound: 'Provider not found.',
  nameTaken: 'Name already used for this agent.',
  agentUnknown: 'Unknown agent.',
  modelNotAccepted: "This agent doesn't accept a model.",
  effortNotSupported: 'Effort not supported by this agent.',
  providerClaudeOnly: 'Providers are only available for Claude.',
  baseUrlRequired: 'URL is required.',
  baseUrlScheme: 'The URL must start with http:// or https://.',
  baseUrlNoV1: 'Leave out the trailing /v1: Claude Code adds /v1/messages.',
  tokenRequired: 'Token is required.',
  envLine: (line) => `Line ${line}: expected NAME=value.`,
  providerInUse: (names) => `Still used by: ${names}.`,
  noWorkspace: 'Open a workspace to launch a profile.',
  routingNotTaken: "Routing didn't apply: this Claude is using your Anthropic account. Close it.",
  noLastProfile: 'No profile launched yet.',
  profileNotFound: 'Profile not found.',
  profileNotApplied: (name) => `Profile "${name}" wasn't applied: the agent is running with Orca's settings.`,
  agentDisabled: (label) => `${label} is disabled in Orca.`,
  profileProviderMissing: (name) => `"${name}": provider not found.`,
  launched: (name) => `"${name}" launched.`,
  literalToken: 'Token stored in plain text in the plugin; prefer a $NAME reference.',
  envMissing: 'missing from the shell, export it in ~/.zshenv',

  tabProviders: 'Providers',
  newProfileFor: (label) => `New ${label} profile`,
  newProvider: 'New provider',
  editProfileTitle: 'Edit profile',
  editProviderTitle: 'Edit provider',
  refreshAgents: 'Refresh agents',
  launch: (name) => `Launch ${name}`,
  edit: (name) => `Edit ${name}`,
  lastBadge: 'Last used',
  unknownProvider: 'Unknown provider',
  noProfileForAgent: 'No profiles',
  collapseGroup: (label) => `Collapse ${label}`,
  expandGroup: (label) => `Expand ${label}`,
  profileCount: (count) => (count === 0 ? 'No profiles' : count === 1 ? '1 profile' : `${count} profiles`),
  noProviderHint: 'Create your first provider with +',
  detectingAgents: 'Detecting agents',
  detectFailedTitle: "Couldn't detect agents",
  noAgentTitle: 'No agents enabled',
  noAgentHint: "Enable an agent in Orca's settings (Agents).",
  settingsUnreadable: "Couldn't read Orca's settings: showing all installed agents.",
  launchFailedTitle: "Couldn't launch",
  loading: 'Loading',
  loadFailedTitle: "Couldn't load",
  retry: 'Retry',

  fieldName: 'Name',
  fieldAvatar: 'Avatar',
  fieldProvider: 'Provider',
  fieldModel: 'Model',
  fieldEffort: 'Effort',
  fieldExtraArgs: 'Extra arguments',
  extraArgsPlaceholder: 'One argument per line',
  fieldBaseUrl: 'Base URL',
  fieldToken: 'Token',
  tokenPlaceholder: '$NAME',
  fieldExtraEnv: 'Extra variables',
  extraEnvPlaceholder: 'NAME=value, one per line',
  save: 'Save',
  cancel: 'Cancel',
  remove: 'Delete',
  avatarNone: 'None',
  agentIconLabel: (name) => `${name} (agent icon)`,
  providerNone: 'None (Anthropic account)',
  effortDefault: "Orca's default",
  efforts: {
    off: 'Off',
    minimal: 'Minimal',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'Extra high',
    max: 'Max',
    ultra: 'Ultra'
  }
}

export const MESSAGES: Record<Locale, Messages> = { en, fr }

/** `fr` quand la sous-étiquette de langue est `fr` (`fr`, `fr-FR`, `fr_CA`), `en` pour tout le reste. */
export function localeOf(tag: string): Locale {
  return /^fr(?:[-_]|$)/i.test(tag.trim()) ? 'fr' : 'en'
}

export const messagesFor = (tag: string): Messages => MESSAGES[localeOf(tag)]
