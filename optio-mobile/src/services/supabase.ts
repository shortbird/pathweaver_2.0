/**
 * Supabase Client - Used only for Google OAuth flow.
 *
 * Regular API calls use the axios-based api.ts service.
 * This client initiates Google sign-in and returns Supabase tokens,
 * which we then exchange for app tokens via /api/auth/google/callback.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vvfgxcykxjybtvpfzwyx.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2Zmd4Y3lreGp5YnR2cGZ6d3l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU5ODQ2NTAsImV4cCI6MjA3MTU2MDY1MH0.Bh00lJuio6mYbAaJDd7BXsdRkm8azGw2A8djCq7cmO0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: true,
  },
});
