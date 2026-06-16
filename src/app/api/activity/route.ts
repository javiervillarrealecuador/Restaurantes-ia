import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

async function verifyStaff(req: NextRequest, restaurantId: string): Promise<boolean> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return false;
  const token = authHeader.replace('Bearer ', '');

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return false;

  const { data: staff } = await supabaseAdmin
    .from('restaurant_staff')
    .select('role')
    .eq('profile_id', user.id)
    .eq('restaurant_id', restaurantId)
    .limit(1);

  return !!staff && staff.length > 0;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { restaurant_id, profile_id, action, details } = body;

    if (!restaurant_id || !action) {
      return NextResponse.json({ error: 'Restaurant ID and Action are required' }, { status: 400 });
    }

    // Validate authorization
    const isAuthorized = await verifyStaff(req, restaurant_id);
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized. Staff membership required.' }, { status: 401 });
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
