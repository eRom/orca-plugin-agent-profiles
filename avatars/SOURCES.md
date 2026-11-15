# Sources des avatars

Les huit images viennent du jeu d'icônes **Lobe Icons**, paquet npm `@lobehub/icons-static-png`.

- Version : 2.7.0 (dernière version publiée au 15/11/2026, vérifiée sur le registre npm)
- Licence : MIT, Copyright (c) 2023 LobeHub
- Dépôt : https://github.com/lobehub/lobe-icons
- Registre npm : https://registry.npmjs.org/@lobehub/icons-static-png/latest
- Licence : https://raw.githubusercontent.com/lobehub/lobe-icons/master/LICENSE
- Fichiers servis par jsDelivr : https://cdn.jsdelivr.net/npm/@lobehub/icons-static-png@2.7.0/dark/

Les icônes sont des marques déposées de leurs propriétaires respectifs : elles servent ici uniquement à repérer visuellement un fournisseur ou un modèle.

| Fichier         | Fichier source (dossier `dark/`) |
| --------------- | -------------------------------- |
| `claude.png`    | `claude-color.png`               |
| `deepseek.png`  | `deepseek-color.png`             |
| `qwen.png`      | `qwen-color.png`                 |
| `glm.png`       | `zhipu-color.png` (Zhipu, éditeur de GLM) |
| `mistral.png`   | `mistral-color.png`              |
| `kimi.png`      | `kimi-color.png`                 |
| `ollama.png`    | `ollama.png` (pas de version couleur, glyphe blanc pour thème sombre) |
| `openrouter.png`| `openrouter-color.png`           |

## Variantes par thème

Pourquoi : `kimi.png` et `ollama.png` ont un glyphe blanc : ils disparaissent sur le thème clair d'Orca. Le profil garde toujours le chemin de base
(`avatars/ollama.png`) ; le panneau affiche la variante au rendu selon `env.theme.colorScheme` (`src/icons.ts`,
table `ICON_VARIANTS`). Le thème sombre garde l'image de base.

| Variante | Thème |
|---|---|
| `on-light/kimi.png`, `on-light/ollama.png` | clair (glyphe blanc remplacé par `#18181B`) |

Recette (à partir de l'avatar de base) :

```
magick avatars/ollama.png -fuzz 20% -fill '#18181B' -opaque white avatars/on-light/ollama.png
magick avatars/kimi.png -fuzz 20% -fill '#18181B' -opaque white avatars/on-light/kimi.png
```

Les variantes ne sont pas listées par le sélecteur (le worker ne lit que le dossier racine). Pour en ajouter une :
générer le fichier, l'ajouter à `ICON_VARIANTS` ; un test vérifie que table et disque concordent dans les deux sens.

Pour ajouter un avatar : déposer un `.png` dans ce dossier, il apparaît dans le sélecteur du panneau. En mode dev, tout fichier ajouté au dossier du plugin fait redemander une approbation à Orca (constaté sur Orca 1.4.259) : il faut l'accorder pour que le plugin se recharge. Un plugin installé (hors mode dev) est une copie figée : un fichier ajouté dans le dossier source n'y apparaît pas, il faut réinstaller. Seul le PNG est listé pour l'instant ; les autres formats (`.webp`, `.jpg`, `.svg`) seront ajoutés une fois vérifiés dans Orca.
