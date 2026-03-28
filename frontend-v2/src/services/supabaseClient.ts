/**
 * Supabase Client for OAuth (Google, etc.)
 *
 * Used only for OAuth flows. Regular API calls use the axios-based api.ts.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
});

export default supabase;
