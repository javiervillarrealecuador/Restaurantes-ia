import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

async function verifyAdmin(req: NextRequest, targetRestaurantId: string) {
  if (!targetRestaurantId) return null;
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');

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

// PATCH: Modify user profile/role/password
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const targetUserId = params.id;
    const body = await req.json();
    const { fullName, role, password, permissions, restaurantId: targetRestaurantId, branchIds } = body;

    if (!targetRestaurantId) {
      return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
    }

    const adminSession = await verifyAdmin(req, targetRestaurantId);
    if (!adminSession) {
      return NextResponse.json({ error: 'Unauthorized. Admin role required.' }, { status: 401 });
    }

    const { user: adminUser, restaurantId } = adminSession;

    // Fetch the target user details first to verify they belong to same restaurant
    const { data: targetStaff, error: findErr } = await supabaseAdmin
      .from('restaurant_staff')
      .select('restaurant_id, role')
      .eq('profile_id', targetUserId)
      .single();

    if (findErr || !targetStaff) {
      return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
    }

    if (targetStaff.restaurant_id !== restaurantId) {
      return NextResponse.json({ error: 'Unauthorized. Staff belongs to another restaurant.' }, { status: 403 });
    }

    // 1. Update Auth User if password or metadata changes
    const updateParams: any = {};
    if (password) {
      updateParams.password = password;
    }
    if (fullName) {
      updateParams.user_metadata = { full_name: fullName };
    }

    if (Object.keys(updateParams).length > 0) {
      const { error: authUpdateErr } = await supabaseAdmin.auth.admin.updateUserById(
        targetUserId,
        updateParams
      );
      if (authUpdateErr) throw authUpdateErr;
    }

    // 2. Update Profile Name
    if (fullName) {
      const parts = fullName.trim().split(' ');
      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ');

      const { error: profErr } = await supabaseAdmin
        .from('profiles')
        .update({
          first_name: firstName,
          last_name: lastName || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', targetUserId);

      if (profErr) throw profErr;
    }

    // 3. Update Role & Permissions in restaurant_staff
    if (role || permissions) {
      const updateData: any = {};
      if (role) updateData.role = role;
      if (permissions) updateData.permissions = permissions;

      const { error: roleErr } = await supabaseAdmin
        .from('restaurant_staff')
        .update(updateData)
        .eq('profile_id', targetUserId)
        .eq('restaurant_id', restaurantId);

      if (roleErr) throw roleErr;
    }

    // 3.5. Update Staff Branches in restaurant_staff_branches
    if (branchIds && Array.isArray(branchIds)) {
      // Get staff ID
      const { data: rsData } = await supabaseAdmin
        .from('restaurant_staff')
        .select('id')
        .eq('profile_id', targetUserId)
        .eq('restaurant_id', restaurantId)
        .single();
      
      if (rsData) {
        // Delete existing relations
        await supabaseAdmin
          .from('restaurant_staff_branches')
          .delete()
          .eq('staff_id', rsData.id);
        
        // Insert new relations
        if (branchIds.length > 0) {
          const staffBranches = branchIds.map((bId: string) => ({
            staff_id: rsData.id,
            branch_id: bId,
          }));
          await supabaseAdmin.from('restaurant_staff_branches').insert(staffBranches);
        }
      }
    }

    // 4. Log action
    await supabaseAdmin.from('activity_logs').insert({
      restaurant_id: restaurantId,
      profile_id: adminUser.id,
      action: 'staff_updated',
      details: `Modificado usuario ID ${targetUserId}. Cambios: ${fullName ? '[Nombre] ' : ''}${role ? `[Rol: ${role}] ` : ''}${permissions ? '[Permisos Personalizados] ' : ''}${password ? '[Clave Restablecida]' : ''}`,
    });

    return NextResponse.json({ success: true, message: 'User updated successfully.' });

  } catch (error: any) {
    console.error('Error updating staff user:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Delete user
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { user: adminUser, restaurantId } = adminSession;
    const targetUserId = params.id;

    // Verify same restaurant
    const { data: targetStaff, error: findErr } = await supabaseAdmin
      .from('restaurant_staff')
      .select('restaurant_id, role')
      .eq('profile_id', targetUserId)
      .single();

    if (findErr || !targetStaff) {
      return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
    }

    if (targetStaff.restaurant_id !== restaurantId) {
      return NextResponse.json({ error: 'Unauthorized. Staff belongs to another restaurant.' }, { status: 403 });
    }

    // Get name before deletion for log
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', targetUserId)
      .single();

    const staffName = profile ? `${profile.first_name} ${profile.last_name || ''}`.trim() : 'ID ' + targetUserId;

    // Delete auth user (cascades to profiles and restaurant_staff because of foreign keys on delete cascade)
    const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (deleteErr) throw deleteErr;

    // Log action
    await supabaseAdmin.from('activity_logs').insert({
      restaurant_id: restaurantId,
      profile_id: adminUser.id,
      action: 'staff_deleted',
      details: `Eliminado miembro del personal: ${staffName} (ID: ${targetUserId}).`,
    });

    return NextResponse.json({ success: true, message: 'User deleted successfully.' });

  } catch (error: any) {
    console.error('Error deleting staff user:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
