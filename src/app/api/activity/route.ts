import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

async function verifyStaff(req: NextRequest, restaurantId: string): Promise<{ id: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '');

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;

  const { data: staff } = await supabaseAdmin
    .from('restaurant_staff')
    .select('role')
    .eq('profile_id', user.id)
    .eq('restaurant_id', restaurantId)
    .limit(1);

  if (!staff || staff.length === 0) return null;
  return { id: user.id };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { restaurant_id, action, details } = body;

    if (!restaurant_id || !action) {
      return NextResponse.json({ error: 'Restaurant ID and Action are required' }, { status: 400 });
    }

    // Validate authorization — get profile_id from the verified session, NOT from body
    const verifiedUser = await verifyStaff(req, restaurant_id);
    if (!verifiedUser) {
      return NextResponse.json({ error: 'Unauthorized. Staff membership required.' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('activity_logs')
      .insert({
        restaurant_id,
        profile_id: verifiedUser.id, // Always from verified session, never from client body
        action,
        details: details ? String(details).substring(0, 500) : null, // Sanitize: max 500 chars
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, log: data });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error creating activity log in API:', error);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
