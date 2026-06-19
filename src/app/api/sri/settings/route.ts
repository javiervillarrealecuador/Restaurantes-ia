// src/app/api/sri/settings/route.ts
// Guarda la configuracion SRI usando supabaseAdmin para evitar RLS del cliente anon.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@supabase/supabase-js';

// Node.js runtime -- supabaseAdmin requiere Node.js, no puede correr en Edge
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const token = authHeader.slice(7);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey);

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser(token);
    if (userErr || !user) {
      return NextResponse.json({ error: 'Sesion invalida o expirada' }, { status: 401 });
    }

    const body = await request.json();
    const { restaurantId, updates } = body;

    if (!restaurantId || !updates) {
      return NextResponse.json({ error: 'Faltan datos: restaurantId o updates' }, { status: 400 });
    }

    const { data: rest, error: restErr } = await supabaseAdmin
      .from('restaurants')
      .select('id, name')
      .eq('id', restaurantId)
      .single();

    if (restErr || !rest) {
      return NextResponse.json({ error: 'Restaurante no encontrado' }, { status: 404 });
    }

    const { data: access } = await supabaseAdmin
      .from('saas_restaurant_users')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!access) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('is_super_admin')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile?.is_super_admin) {
        console.warn(`User ${user.id} updating restaurant ${restaurantId} without explicit membership`);
      }
    }

    const allowedFields = [
      'ruc', 'name', 'address',
      'sri_dir_matriz', 'sri_dir_estab', 'sri_estab', 'sri_pto_emi',
      'sri_obligado_contab', 'sri_rimpe', 'sri_agente_retencion', 'sri_contrib_especial',
      'sri_ambiente', 'sri_p12_b64', 'sri_p12_pwd',
      'sri_email_envio', 'sri_iva_rate', 'sri_iva_temporal',
      'sri_iva_temporal_inicio', 'sri_iva_temporal_fin',
      'sri_firma_razon', 'sri_firma_expira',
      'updated_at'
    ];

    const safeUpdates: any = {};
    for (const key of allowedFields) {
      if (key in updates) {
        safeUpdates[key] = updates[key];
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: 'No hay campos validos para actualizar' }, { status: 400 });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('restaurants')
      .update(safeUpdates)
      .eq('id', restaurantId);

    if (updateErr) {
      console.error('Error updating restaurant SRI settings:', updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    console.log(`SRI settings saved for restaurant ${restaurantId} by user ${user.id}. Fields: ${Object.keys(safeUpdates).join(', ')}`);
    return NextResponse.json({ success: true, restaurantId, updatedFields: Object.keys(safeUpdates) });

  } catch (err: any) {
    console.error('SRI settings API error:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}
