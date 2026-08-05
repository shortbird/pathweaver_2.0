/**
 * Supabase Client for OAuth
 *
 * This client is specifically for OAuth flows (Google, etc.).
 * Regular API calls still use the axios-based api.js service.
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

// Fall back to harmless placeholders when the env is absent (e.g. the test
// runner) so createClient() doesn't throw "supabaseUrl is required" at import —
// which would crash any test that transitively imports a supabase-using
// component. In prod the real env vars are always set, so this never applies.
export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'anon-placeholder-key',
  {
  auth: {
    autoRefreshToken: false, // We handle token refresh in authService
    persistSession: false,   // We use our own session management
    detectSessionInUrl: true, // Required for OAuth callback
    flowType: 'implicit'     // PKCE requires persisted storage for code_verifier; since we use persistSession: false, use implicit flow instead
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
})

export default supabase
