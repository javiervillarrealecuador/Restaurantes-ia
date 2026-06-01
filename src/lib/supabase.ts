import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';


if (!supabaseUrl) {
  console.warn('Warning: NEXT_PUBLIC_SUPABASE_URL is not set in environment variables.');
}

// Standard client for frontend use (respects RLS, runs in client & server components)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

