import { createClient } from '@supabase/supabase-js';

// Admin client for server-side API/webhook execution (bypasses RLS using Service Role Key)
// Env vars are validated at module load time to surface misconfiguration immediately.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://firophcgqwhmhztgcxqi.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseServiceKey) {
  // This is a fatal misconfiguration: all admin API routes will silently fail without it.
  throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required but not set.');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
