import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://firophcgqwhmhztgcxqi.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_xU3B7fPKc-ekvk92Ch3Hdg_3FvGRGd8';


if (!supabaseUrl) {
  console.warn('Warning: NEXT_PUBLIC_SUPABASE_URL is not set in environment variables.');
}

// Standard client for frontend use (respects RLS, runs in client & server components)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

