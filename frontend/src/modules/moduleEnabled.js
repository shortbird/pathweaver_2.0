/**
 * Pure module-gate evaluation for the frontend.
 *
 * The backend is the authority: org payloads carry a server-computed
 * `effective_modules` list, and when it is present that list IS the answer.
 * The local evaluation below exists only as a fallback for stale cached org
 * payloads (and mobile, which mirrors it) -- it re-derives the same veneer
 * semantics as backend/modules/enabled.py from moduleKeys.json, which
 * tests/unit/test_module_registry.py holds in lockstep with the Python
 * registry. Never add gating semantics here that the backend does not have.
 *
 * See docs/ARCHITECTURE_BLOCKS.md sections 4.1-4.2.
 */

import KEYS from './moduleKeys.json'

function rawValue(def, key, flags) {
  const modules = flags.modules
  if (modules && typeof modules === 'object' && key in modules) {
    return Boolean(modules[key])
  }
  const ss = flags.sis_settings || {}
  switch (def.legacy) {
    case 'sis_enabled':
      return Boolean(flags.sis_enabled)
    case 'hidden_modules':
      return !(Array.isArray(ss.hidden_modules) && ss.hidden_modules.includes(key))
    case 'community_enabled':
      return ss.community_enabled === true
    case 'prior_learning_enabled':
      return ss.prior_learning_enabled === true
    case 'kiosk_flag':
      return Boolean(flags.kiosk)
    case 'goals_mode':
      return ss.post_registration_flow === 'goals'
    case 'oea_enabled':
      return Boolean(flags.oea_enabled)
    default:
      return def.default === 'on'
  }
}

/**
 * Is `key` enabled for this organization? `org` is an organization payload
 * (feature_flags + ai_features_enabled, ideally with the server-computed
 * effective_modules). A null org (platform user, or superadmin before
 * picking one) enables only core modules.
 */
export function moduleEnabled(org, key) {
  const def = KEYS[key]
  if (!def) throw new Error(`Unknown module key: ${key}`)
  if (def.default === 'core') return true
  if (!org) return false
  if (Array.isArray(org.effective_modules)) {
    return org.effective_modules.includes(key)
  }
  if (def.gate === 'ai_columns') return Boolean(org.ai_features_enabled)
  const flags = org.feature_flags || {}
  if (!rawValue(def, key, flags)) return false
  return def.parent ? moduleEnabled(org, def.parent) : true
}

/** Every enabled module key for this org, core included, sorted. */
export function effectiveModules(org) {
  return Object.keys(KEYS).filter((key) => moduleEnabled(org, key)).sort()
}
