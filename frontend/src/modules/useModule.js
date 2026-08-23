/**
 * React hook over the module gate: `useModule('billing')` answers for the
 * current org from OrganizationContext. Pure callers (route guards, utils
 * like postLoginPath) import moduleEnabled from './moduleEnabled' directly.
 */

import { useOrganization } from '../contexts/OrganizationContext'
import { moduleEnabled } from './moduleEnabled'

export function useModule(key) {
  const { organization } = useOrganization()
  return moduleEnabled(organization, key)
}
