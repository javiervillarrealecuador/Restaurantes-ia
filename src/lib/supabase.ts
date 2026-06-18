import { createClient } from '@supabase/supabase-js';

// Supabase public client for frontend use (respects RLS)
// Env vars are set in Vercel; hardcoded values are fallbacks for build-time robustness.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://firophcgqwhmhztgcxqi.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_xU3B7fPKc-ekvk92Ch3Hdg_3FvGRGd8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
