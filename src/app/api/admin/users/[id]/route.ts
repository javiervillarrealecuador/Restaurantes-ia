import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

async function verifyAdmin(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;

  const { data: staff } = await supabaseAdmin
    .from('restaurant_staff')
    .select('role, restaurant_id')
    .eq('profile_id', user.id)
    .eq('role', 'admin_general')
    .limit(1);

  if (!staff || staff.length === 0) return null;
  return { user, restaurantId: staff[0].restaurant_id };
}

// PATCH: Modify user profile/role/password
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const adminSession = await verifyAdmin(req);
    if (!adminSession) {
      return NextResponse.json({ error: 'Unauthorized. Admin role required.' }, { status: 401 });
    }

    const { user: adminUser, restaurantId } = adminSession;
    const targetUserId = params.id;
    const body = await req.json();
    const { fullName, role, password, permissions } = body;

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
    const adminSession = await verifyAdmin(req);
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
