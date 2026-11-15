// `orca plugin check` dessine le panneau une fois par scénario, le worker sur un hôte neuf :
// il sème lui-même son store. Seul le workspace au focus change d'un scénario à l'autre.
import { defineCheck } from 'orca/testing'

export default defineCheck({
  seeded: {
    results: { 'workspace.readContext': { workspaceId: 'w1', branch: 'main', displayName: 'w1', terminals: [] } }
  },
  noWorkspace: {
    results: { 'workspace.readContext': null }
  }
})
