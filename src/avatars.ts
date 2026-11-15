// Avatars livrés avec le plugin : le panneau n'a pas de système de fichiers, le worker liste le dossier pour lui.
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Extensions proposées par le sélecteur : PNG seul tant que les autres formats ne sont pas vérifiés dans Orca. */
const IMAGE_EXTENSIONS = ['.png']

/** Noms des images de `directory`, triés ; liste vide si le dossier est absent ou illisible. */
export function listAvatarFiles(directory: string): string[] {
  try {
    return readdirSync(directory)
      .filter((file) => IMAGE_EXTENSIONS.some((extension) => file.toLowerCase().endsWith(extension)))
      .sort()
  } catch {
    return []
  }
}

/** Dossier `avatars/` ou `agent-icons/` du plugin, déduit de l'emplacement de ce fichier (`src/avatars.ts`). */
export function pluginDirectory(name: 'avatars' | 'agent-icons'): string {
  return fileURLToPath(new URL(`../${name}`, import.meta.url))
}
