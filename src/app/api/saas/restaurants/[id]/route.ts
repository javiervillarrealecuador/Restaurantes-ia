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

// PATCH: Update restaurant billing or details
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const superAdmin = await verifySuperAdmin(req);
    if (!superAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Super Admin role required.' }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();
    const { name, slug, address, phone, email, cost_per_order, prepaid_credits, status } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (address !== undefined) updateData.address = address;
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email;
    if (status !== undefined) updateData.status = status;
    if (cost_per_order !== undefined) updateData.cost_per_order = Number(cost_per_order);
    if (prepaid_credits !== undefined) updateData.prepaid_credits = parseInt(prepaid_credits, 10);

    const { data: restaurant, error: updateErr } = await supabaseAdmin
      .from('restaurants')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return NextResponse.json({
      success: true,
      message: 'Restaurante actualizado con éxito.',
      restaurant
    });

  } catch (error: any) {
    console.error('Error updating restaurant:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
