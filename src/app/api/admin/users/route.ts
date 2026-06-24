import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

async function verifyAdmin(req: NextRequest, targetRestaurantId: string) {
  if (!targetRestaurantId) return null;
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '');

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;

  // Check if super admin
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  if (profile?.is_super_admin) {
    return { user, restaurantId: targetRestaurantId };
  }

  // Check if admin_general for this specific restaurant
  const { data: staff } = await supabaseAdmin
    .from('restaurant_staff')
    .select('role, restaurant_id')
    .eq('profile_id', user.id)
    .eq('restaurant_id', targetRestaurantId)
    .eq('role', 'admin_general')
    .limit(1);

  if (!staff || staff.length === 0) return null;
  return { user, restaurantId: targetRestaurantId };
}

// GET: List all staff members for the restaurant
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetRestaurantId = searchParams.get('restaurantId');
    if (!targetRestaurantId) {
      return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
    }

    const adminSession = await verifyAdmin(req, targetRestaurantId);
    if (!adminSession) {
      return NextResponse.json({ error: 'Unauthorized. Admin role required.' }, { status: 401 });
    }

    const { restaurantId } = adminSession;

    // Fetch staff records with permissions
    const { data: staffList, error: staffErr } = await supabaseAdmin
      .from('restaurant_staff')
      .select(`
        id,
        role,
        permissions,
        created_at,
        kitchen_id,
        profiles (
          id,
          first_name,
          last_name,
          avatar_url
        ),
        restaurant_staff_branches (
          branch_id
        )
      `)
      .eq('restaurant_id', restaurantId);

    if (staffErr) throw staffErr;

    // Fetch auth users to match emails
    const { data: { users: authUsers }, error: authErr } = await supabaseAdmin.auth.admin.listUsers();
    if (authErr) throw authErr;

    // Map emails to staff list
    const staffWithEmails = staffList.map((staff: any) => {
      const authUser = authUsers.find((u) => u.id === staff.profiles?.id);
      const branchIds = staff.restaurant_staff_branches?.map((sb: any) => sb.branch_id) || [];
      return {
        ...staff,
        email: authUser?.email || 'N/D',
        last_sign_in: authUser?.last_sign_in_at || null,
        branchIds,
      };
    });

    return NextResponse.json({ success: true, staff: staffWithEmails });
  } catch (error: any) {
    console.error('Error listing staff:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new user (admin-only)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, fullName, role, permissions, restaurantId: targetRestaurantId, branchIds, kitchenId } = body;

    if (!targetRestaurantId) {
      return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
    }

    const adminSession = await verifyAdmin(req, targetRestaurantId);
    if (!adminSession) {
      return NextResponse.json({ error: 'Unauthorized. Admin role required.' }, { status: 401 });
    }

    const { user: adminUser, restaurantId } = adminSession;

    if (!email || !password || !fullName || !role) {
      return NextResponse.json({ error: 'All fields (email, password, fullName, role) are required' }, { status: 400 });
    }

    // Validate role is a known enum value
    const VALID_ROLES = ['admin_general', 'vendedor_cajero', 'cocinero', 'repartidor', 'camarero'];
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 });
    }

    // 1. Create auth user
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createErr || !newUser.user) {
      throw createErr || new Error('Failed to create authentication user.');
    }

    const userId = newUser.user.id;

    // 2. The database trigger automatically creates the profiles row. Let's verify or wait a brief second if needed.
    // Insert into restaurant_staff
    const { data: staffData, error: staffErr } = await supabaseAdmin
      .from('restaurant_staff')
      .insert({
        restaurant_id: restaurantId,
        profile_id: userId,
        role: role,
        permissions: permissions || {},
        kitchen_id: kitchenId || null
      })
      .select('id')
      .single();

    // Insert staff branches relation if provided
    const { branchIds } = body;
    if (!staffErr && staffData && branchIds && Array.isArray(branchIds) && branchIds.length > 0) {
      const staffBranches = branchIds.map((bId: string) => ({
        staff_id: staffData.id,
        branch_id: bId,
      }));
      try {
        await supabaseAdmin.from('restaurant_staff_branches').insert(staffBranches);
      } catch (err) {
        console.error('Error inserting staff branches:', err);
      }
    }

    if (staffErr) {
      // Try to clean up the orphaned auth user. If cleanup also fails, log both errors.
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      } catch (cleanupErr) {
        console.error('Failed to cleanup orphaned auth user after staff link error:', cleanupErr);
      }
      throw staffErr;
    }

    // 3. Log this action in activity_logs
    await supabaseAdmin.from('activity_logs').insert({
      restaurant_id: restaurantId,
      profile_id: adminUser.id,
      action: 'staff_created',
      details: `Creado usuario ${fullName} (${email}) con rol ${role}.`,
    });

    return NextResponse.json({
      success: true,
      message: 'Staff member created successfully.',
      user: {
        id: userId,
        email,
        fullName,
        role,
      }
    });

  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error creating staff user:', error);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
