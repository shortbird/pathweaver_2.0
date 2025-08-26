import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const backendUrl = Deno.env.get('BACKEND_URL') || 'https://pathweaver20-production.up.railway.app'
    const cronSecret = Deno.env.get('CRON_SECRET') || 'a_very_strong_and_secret_key_for_your_cron_job_2024'

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