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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false, // We handle token refresh in authService
    persistSession: false,   // We use our own session management
    detectSessionInUrl: true // Required for OAuth callback
  }
})

export default supabase
