import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { restaurant_id, profile_id, action, details } = body;

    if (!restaurant_id || !action) {
      return NextResponse.json({ error: 'Restaurant ID and Action are required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('activity_logs')
      .insert({
        restaurant_id,
        profile_id: profile_id || null,
        action,
        details: details || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, log: data });
  } catch (error: any) {
    console.error('Error creating activity log in API:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
