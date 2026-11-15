// Variantes d'icônes selon le thème d'Orca. Module pur : le panneau l'importe, il n'a pas de système de fichiers,
// donc la liste des variantes est une table statique (un test vérifie qu'elle colle au disque).

export type ColorScheme = 'light' | 'dark'

/**
 * Icônes de base (`agent-icons/<nom>`) qui ont une variante pour un thème, dans `agent-icons/on-<thème>/<nom>`.
 * Orca dessine Codex, Aider, Pi et OpenCode 2 avec `currentColor` : notre PNG converti est clair, donc illisible
 * sur fond clair. Kilo a au contraire un glyphe sombre, illisible sur fond sombre.
 */
export const ICON_VARIANTS: Readonly<Record<ColorScheme, readonly string[]>> = {
  light: ['codex.png', 'aider.png', 'pi.png', 'opencode2.png'],
  dark: ['kilo.png']
}

const BASE_FOLDER = 'agent-icons/'

/** Chemin de la variante de `iconPath` pour `colorScheme` si elle existe, sinon `iconPath` inchangé (avatars compris). */
export function themedIcon(iconPath: string, colorScheme: ColorScheme): string {
  if (!iconPath.startsWith(BASE_FOLDER)) return iconPath
  const file = iconPath.slice(BASE_FOLDER.length)
  return ICON_VARIANTS[colorScheme].includes(file) ? `${BASE_FOLDER}on-${colorScheme}/${file}` : iconPath
}
