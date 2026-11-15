# Agent Profiles

Plugin Orca qui lance les agents d'Orca avec tes profils. Un profil associe à un agent (Claude, Antigravity, Codex,
Grok, OpenCode, Pi, DeepSeek Harness...) un modèle et un effort quand l'agent les accepte (certains n'acceptent que
des arguments en plus), avec des arguments facultatifs. Pour Claude,
il peut aussi pointer un fournisseur (Ollama, OpenRouter, tout fournisseur compatible) dont l'environnement est
injecté au moment du lancement, via le hook `agent.launch.before`.

## Le panneau « Agents »

- **Un groupe par agent activé dans Orca**, par ordre alphabétique. L'en-tête montre un chevron, l'icône et le
  nom de l'agent, avec + pour y créer un profil. Le chevron replie ou déplie les profils du groupe ; replié,
  l'en-tête indique combien de profils il cache. Les groupes repliés sont retenus d'une session d'Orca à l'autre,
  les mêmes pour tous les workspaces. Chaque groupe se détache du volet sur une surface du thème d'Orca
  (thèmes personnalisés compris).
- **Profils**, par ordre alphabétique dans leur groupe : un avatar (ou un monogramme), le nom, le résumé « modèle · effort · fournisseur » (les parties
  absentes sont omises), le badge « Dernier » sur le profil lancé en dernier. ▷ lance le profil dans le workspace
  actif, ✎ le modifie. Le formulaire s'adapte à l'agent : modèle et effort seulement quand l'agent les accepte,
  fournisseur pour Claude uniquement.
- **Fournisseurs** : partagés, réservés à Claude. L'URL de base (sans `/v1` à la fin : Claude Code ajoute
  `/v1/messages`), le jeton et des variables d'environnement supplémentaires, une par ligne.
- **Avatars** : des PNG des dossiers `avatars/` (voir `avatars/SOURCES.md`) et `agent-icons/` (icônes des agents
  d'Orca, voir `agent-icons/SOURCES.md`), choisis dans le formulaire du profil.
- `Mod+Alt+L` (ou la commande « Agents : relancer le dernier profil ») relance le dernier profil lancé, quel que
  soit son agent. Les réglages d'Orca sont relus à ce moment : si l'agent est désactivé, rien n'est lancé et le
  message le dit.

## Quels agents sont activés

Aucune API de plugin ne donne la liste des agents d'Orca : le plugin la reconstitue lui-même.

1. Il lit, en lecture seule, les réglages d'Orca (`disabledTuiAgents` et `agentCmdOverrides`) dans
   `~/Library/Application Support/orca/profiles/<id>/profile-state.db`. Il n'y écrit jamais.
2. Il cherche la commande de chaque agent connu avec un seul `zsh -ilc`, donc avec le vrai `PATH` de ton shell.
3. Un agent est affiché s'il est trouvé, pas désactivé dans Orca, et si les commandes dont il dépend sont aussi
   trouvées (Claude Agent Teams a besoin de `claude`, DeepSeek Harness de `dsh`). Une commande personnalisée
   définie dans Orca (override) compte comme une commande trouvée.

Le panneau se met à jour à son ouverture et au bouton ⟳, qui relance la détection : un interrupteur basculé dans
Settings > Agents n'est pas suivi tout seul, appuie sur ⟳ pour le voir. Si le shell de login échoue (erreur ou
délai de 15 s), le plugin cherche les commandes dans le `PATH` du worker, moins complet que celui de ton shell.
Si les réglages d'Orca sont illisibles, le panneau affiche tous les agents trouvés et le dit.

## Données

La V2 démarre à vide : elle écrit sous la clé `store.v2` et ne lit, ne modifie ni n'efface `store.v1`, qui reste
intact (retour à la V1 possible). Les fournisseurs et profils de la V1 sont à recréer dans le panneau, aucun import.
Un profil dont l'agent est désactivé reste dans le store et réapparaît avec son groupe.

## Routage

Un profil lancé depuis le panneau (ou par `Mod+Alt+L`) réécrit la commande de son agent : le hook retire le flag
de modèle ou d'effort déjà présent dans les réglages d'Orca, puis pose ceux du profil, avec les arguments en plus.
Un effort laissé à « Celui d'Orca » ne touche pas à la commande.

Pour Claude avec fournisseur, tout lancement dont le `--model` est celui du profil est aussi routé vers lui, d'où
qu'il vienne (palette, CLI, automation), par exemple :

```sh
orca agent launch --agent claude --model 'deepseek-v4.1-flash:cloud[1m]'
```

Les autres agents ne sont jamais modifiés hors du panneau.

L'URL de base et la clé Anthropic vide sont écrites en tête de commande, hors de portée d'un `export` plus loin
dans `~/.zshenv`. Un jeton littéral ne passe que par l'environnement du lancement, jamais par la ligne de commande.

### Clés `$NOM`

Une valeur `$NOM` (par exemple `$OPENROUTER_API_KEY`) n'est jamais lue par le plugin : elle devient une affectation
en tête de commande, développée par le shell du terminal, qui lit `~/.zshenv`. Le worker d'Orca, lancé depuis le Dock,
n'a pas ces variables, et la clé ne transite ni par le plugin ni par Orca. Si la variable est absente, le shell refuse
de démarrer Claude et la nomme.

## Limites

- La détection des agents dépend du format interne de `profile-state.db`, sans contrat côté Orca : s'il change,
  le plugin retombe sur « tous les agents installés » au lieu de planter, mais le tri par activation est perdu.
- La table des agents (`src/agents.ts`: commandes, flags de modèle et d'effort) est embarquée et à tenir à jour
  quand Orca ajoute ou modifie un agent.
- Kimi est détecté comme installé par Orca alors que sa commande n'est pas dans le `PATH` : le plugin ne le voit
  pas tant que c'est le cas.
- Pas de prompt au lancement depuis le panneau : Orca ne le transmet pas.
- Les reprises et restaurations de session ne sont pas routées : Orca ne les passe pas par le hook, une session routée
  reprise démarre donc sans le profil.
- Un lancement natif du même agent, déclenché dans les 15 secondes qui suivent un lancement depuis le panneau dont le profil n'a pas encore été consommé, peut recevoir ce profil.
- En mode dev, tout changement de fichier dans le dossier du plugin le désactive jusqu'à une nouvelle approbation :
  pour un usage quotidien, installe une copie figée.

## Développement

```sh
orca plugin test . --json
bunx tsc -p .
orca plugin validate . --json
orca plugin check . --json
```
