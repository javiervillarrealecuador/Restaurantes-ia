import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

async function verifySuperAdmin(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '');

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

// GET: List all restaurants with their billing metrics
export async function GET(req: NextRequest) {
  try {
    const superAdmin = await verifySuperAdmin(req);
    if (!superAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Super Admin role required.' }, { status: 401 });
    }

    // 1. Fetch all restaurants selecting only required fields (no address/logos)
    const { data: restaurants, error: restErr } = await supabaseAdmin
      .from('restaurants')
      .select('id, name, slug, email, phone, cost_per_order, prepaid_credits, status, created_at')
      .order('created_at', { ascending: false });

    if (restErr) throw restErr;

    // Calculate dates for current billing cycle (this month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const statsMap: Record<string, any> = {};

    // 2. Try fetching stats from Database View first (database-level aggregation, uses 0 RAM)
    const { data: viewStats, error: viewErr } = await supabaseAdmin
      .from('restaurant_billing_stats')
      .select('*');

    if (!viewErr && viewStats) {
      // View exists in database! Map stats directly
      viewStats.forEach((row: any) => {
        const total = parseInt(row.total_orders || '0', 10);
        const cancelled = parseInt(row.cancelled_orders || '0', 10);
        statsMap[row.restaurant_id] = {
          totalOrders: total,
          deliveredOrders: parseInt(row.delivered_orders || '0', 10),
          cancelledOrders: cancelled,
          currentPeriodDelivered: parseInt(row.current_period_delivered || '0', 10),
          cancellationRate: total > 0 ? Math.round((cancelled / total) * 100) : 0,
        };
      });
    } else {
      // Fallback: Fetch only required columns from orders and group in memory
      console.warn('Database view restaurant_billing_stats not found. Falling back to optimized JS calculations:', viewErr?.message || 'Unknown view error');
      
      const { data: orders, error: ordersErr } = await supabaseAdmin
        .from('orders')
        .select('restaurant_id, status, created_at');

      if (ordersErr) throw ordersErr;

      restaurants.forEach((r: any) => {
        const restOrders = orders.filter((o: any) => o.restaurant_id === r.id);
        const totalOrdersCount = restOrders.length;
        const deliveredOrdersCount = restOrders.filter((o: any) => o.status === 'delivered').length;
        const cancelledOrdersCount = restOrders.filter((o: any) => o.status === 'cancelled').length;
        
        const currentPeriodOrders = restOrders.filter((o: any) => {
          return o.status === 'delivered' && new Date(o.created_at) >= startOfMonth;
        }).length;

        const cancellationRate = totalOrdersCount > 0 
          ? Math.round((cancelledOrdersCount / totalOrdersCount) * 100) 
          : 0;

        statsMap[r.id] = {
          totalOrders: totalOrdersCount,
          deliveredOrders: deliveredOrdersCount,
          cancelledOrders: cancelledOrdersCount,
          currentPeriodDelivered: currentPeriodOrders,
          cancellationRate,
        };
      });
    }

    // 3. Map stats to each restaurant and compute unbilled amount
    const restaurantsWithStats = restaurants.map((r: any) => {
      const restStats = statsMap[r.id] || {
        totalOrders: 0,
        deliveredOrders: 0,
        cancelledOrders: 0,
        currentPeriodDelivered: 0,
        cancellationRate: 0,
      };

      const unbilledAmount = restStats.currentPeriodDelivered * Number(r.cost_per_order || 0.10);

      return {
        ...r,
        stats: {
          ...restStats,
          unbilledAmount
        }
      };
    });

    return NextResponse.json({ success: true, restaurants: restaurantsWithStats });

  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error fetching restaurants stats:', error);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}


// POST: Register a new restaurant and its General Admin user
export async function POST(req: NextRequest) {
  try {
    const superAdmin = await verifySuperAdmin(req);
    if (!superAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Super Admin role required.' }, { status: 401 });
    }

    const body = await req.json();
    const { 
      name, 
      slug, 
      address, 
      phone, 
      email, 
      costPerOrder, 
      prepaidCredits, 
      adminName, 
      adminEmail, 
      adminPassword 
    } = body;

    if (!name || !slug || !adminEmail || !adminPassword || !adminName) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    // 1. Create restaurant
    const { data: restaurant, error: restErr } = await supabaseAdmin
      .from('restaurants')
      .insert({
        name,
        slug,
        address: address || '',
        phone: phone || '',
        email: email || '',
        cost_per_order: Number(costPerOrder) || 0.10,
        prepaid_credits: parseInt(prepaidCredits, 10) || 0,
        status: 'active'
      })
      .select()
      .single();

    if (restErr) throw restErr;

    // 2. Create settings
    const { error: settingsErr } = await supabaseAdmin
      .from('settings')
      .insert({
        restaurant_id: restaurant.id,
        is_ordering_enabled: true,
        whatsapp_phone_number_id: 'default_phone_id',
        whatsapp_verify_token: 'default_verify_token_' + slug
      });

    if (settingsErr) {
      // rollback restaurant
      await supabaseAdmin.from('restaurants').delete().eq('id', restaurant.id);
      throw settingsErr;
    }

    // 3. Create default menu category
    await supabaseAdmin.from('menu_categories').insert({
      restaurant_id: restaurant.id,
      name: 'Especialidades',
      sort_order: 1,
      is_active: true
    });

    // 4. Create admin user in Auth
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: adminName }
    });

    if (createErr || !newUser.user) {
      // rollback restaurant
      await supabaseAdmin.from('restaurants').delete().eq('id', restaurant.id);
      throw createErr || new Error('No se pudo crear el usuario en Supabase Auth.');
    }

    const userId = newUser.user.id;

    // 5. Insert into restaurant_staff
    const { error: staffErr } = await supabaseAdmin
      .from('restaurant_staff')
      .insert({
        restaurant_id: restaurant.id,
        profile_id: userId,
        role: 'admin_general',
        permissions: {} // Gets default permissions
      });

    if (staffErr) {
      // cleanup auth and restaurant
      await supabaseAdmin.auth.admin.deleteUser(userId);
      await supabaseAdmin.from('restaurants').delete().eq('id', restaurant.id);
      throw staffErr;
    }

    return NextResponse.json({
      success: true,
      message: 'Restaurante y Administrador creados exitosamente.',
      restaurant
    });

  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error registering new restaurant:', error);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
