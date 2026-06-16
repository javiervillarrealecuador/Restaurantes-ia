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

// PATCH: Update invoice status
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const superAdmin = await verifySuperAdmin(req);
    if (!superAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Super Admin role required.' }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();
    const { status } = body;

    if (!status || !['pending', 'paid', 'overdue'].includes(status)) {
      return NextResponse.json({ error: 'Estado de factura inválido' }, { status: 400 });
    }

    const { data: invoice, error: updateErr } = await supabaseAdmin
      .from('saas_invoices')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return NextResponse.json({
      success: true,
      message: 'Factura actualizada exitosamente.',
      invoice
    });

  } catch (error: any) {
    console.error('Error updating invoice:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
