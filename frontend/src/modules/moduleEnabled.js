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

/**
 * Is this module KNOWN to be off for the org? False when we cannot tell.
 *
 * For skipping a request that would 404 anyway. It is not moduleEnabled()
 * negated, and the difference is the whole point: moduleEnabled answers a
 * boolean for any input, so a payload carrying neither `effective_modules` nor
 * `feature_flags` gets the fallback's derivation over an empty object — which
 * reports every SIS module off, because there is no `sis_enabled` in {} to
 * satisfy the parent cascade. Two payloads look exactly like that:
 *
 *   - /api/sis/parent/context, which lists orgs WITHOUT their feature_flags;
 *   - OrganizationContext's degraded `{ id }`, set when /api/auth/me could not
 *     load the org.
 *
 * Hiding a live feature is far worse than the speculative request this exists
 * to avoid, so an unanswerable payload means "ask" — today's behaviour — and
 * only a payload that genuinely says no suppresses the call.
 */
export function moduleKnownOff(org, key) {
  const def = KEYS[key]
  if (!def) throw new Error(`Unknown module key: ${key}`)
  // Core is on for everyone and cannot be turned off, so no payload — not even
  // a list that omits it — is evidence that it is off.
  if (def.default === 'core') return false
  if (!org) return false
  if (Array.isArray(org.effective_modules)) return !org.effective_modules.includes(key)
  if (org.feature_flags) return !moduleEnabled(org, key)
  return false
}
