import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

async function verifySuperAdmin(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile || !profile.is_super_admin) return null;
  return user;
}

// GET: Retrieve all SaaS invoices
export async function GET(req: NextRequest) {
  try {
    const superAdmin = await verifySuperAdmin(req);
    if (!superAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Super Admin role required.' }, { status: 401 });
    }

    const { data: invoices, error: invErr } = await supabaseAdmin
      .from('saas_invoices')
      .select(`
        *,
        restaurants (
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (invErr) throw invErr;

    return NextResponse.json({ success: true, invoices });

  } catch (error: any) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Generate a new invoice (close billing cycle)
export async function POST(req: NextRequest) {
  try {
    const superAdmin = await verifySuperAdmin(req);
    if (!superAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Super Admin role required.' }, { status: 401 });
    }

    const body = await req.json();
    const { restaurantId, periodStart, periodEnd } = body;

    if (!restaurantId || !periodStart || !periodEnd) {
      return NextResponse.json({ error: 'Faltan campos obligatorios (restaurantId, periodStart, periodEnd)' }, { status: 400 });
    }

    // 1. Fetch restaurant cost per order
    const { data: restaurant, error: restErr } = await supabaseAdmin
      .from('restaurants')
      .select('cost_per_order')
      .eq('id', restaurantId)
      .single();

    if (restErr || !restaurant) {
      throw restErr || new Error('Restaurante no encontrado.');
    }

    const costPerOrder = Number(restaurant.cost_per_order || 0.10);

    // 2. Count delivered orders within dates
    const { data: orders, error: ordersErr } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'delivered')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    if (ordersErr) throw ordersErr;

    const ordersCount = orders.length;
    const totalAmount = Number((ordersCount * costPerOrder).toFixed(2));

    // 3. Create invoice
    const { data: invoice, error: invoiceErr } = await supabaseAdmin
      .from('saas_invoices')
      .insert({
        restaurant_id: restaurantId,
        period_start: periodStart,
        period_end: periodEnd,
        orders_delivered: ordersCount,
        cost_per_order: costPerOrder,
        total_amount: totalAmount,
        status: 'pending'
      })
      .select()
      .single();

    if (invoiceErr) throw invoiceErr;

    return NextResponse.json({
      success: true,
      message: 'Factura generada exitosamente.',
      invoice
    });

  } catch (error: any) {
    console.error('Error generating invoice:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
