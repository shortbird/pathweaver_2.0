import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// This is a SERVER-TO-SERVER function invoked by a scheduled cron job, not a
// browser endpoint. CORS is therefore intentionally locked down (no wildcard)
// and every request must present the shared CRON_SECRET (DB-H1 fix).
const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || 'null'
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

// Constant-time comparison so a wrong secret can't be recovered via timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // DB-H1 fix: fail CLOSED when the secret is not configured (no hardcoded
  // fallback), and reject any caller that does not present the correct secret
  // BEFORE creating a service-role client or triggering the cost-bearing cycle.
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) {
    console.error('CRON_SECRET is not configured; refusing to run.')
    return new Response(
      JSON.stringify({ success: false, error: 'Server misconfiguration' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }

  const authHeader = req.headers.get('Authorization') || ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const provided = bearer || req.headers.get('x-cron-secret') || ''
  if (!provided || !timingSafeEqual(provided, cronSecret)) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
    )
  }

  try {
    // Get environment variables (all required — no dead defaults)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const backendUrl = Deno.env.get('BACKEND_URL')

    if (!supabaseUrl || !supabaseServiceKey || !backendUrl) {
      console.error('Missing required environment configuration.')
      return new Response(
        JSON.stringify({ success: false, error: 'Server misconfiguration' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('Starting AI Quest Generation Cycle...')

    // Call your backend API endpoint
    const response = await fetch(`${backendUrl}/api/ai/run-cycle`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json'
      }
    })

    const result = await response.json()

    // Log the results to Supabase (optional - for monitoring)
    const { error: logError } = await supabase
      .from('ai_cycle_logs')
      .insert({
        status: response.ok ? 'success' : 'failed',
        result: result,
        executed_at: new Date().toISOString()
      })

    if (logError) {
      console.error('Failed to log cycle results:', logError)
    }

    return new Response(
      JSON.stringify({
        success: response.ok,
        message: response.ok ? 'AI cycle completed successfully' : 'AI cycle failed',
        details: result
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: response.ok ? 200 : 500
      }
    )
  } catch (error) {
    console.error('Error in AI quest cycle:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
