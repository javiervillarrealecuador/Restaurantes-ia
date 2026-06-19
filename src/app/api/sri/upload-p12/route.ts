// src/app/api/sri/upload-p12/route.ts
// Endpoint dedicado para guardar la firma .p12 en la BD usando supabaseAdmin

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@supabase/supabase-js';

// Forzar Node.js runtime (supabaseAdmin requiere Node.js, no Edge)
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const token = authHeader.slice(7);

    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser(token);
    if (userErr || !user) {
      console.error('upload-p12: auth error', userErr);
      return NextResponse.json({ error: 'Sesion invalida' }, { status: 401 });
    }

    const body = await request.json();
    const { restaurantId, p12B64, p12Pwd } = body;

    console.log('upload-p12: restaurantId=', restaurantId, 'p12B64 length=', p12B64?.length, 'hasPwd=', !!p12Pwd);

    if (!restaurantId) {
      return NextResponse.json({ error: 'Falta restaurantId' }, { status: 400 });
    }
    if (!p12B64) {
      return NextResponse.json({ error: 'Falta el archivo .p12 (p12B64)' }, { status: 400 });
    }
    if (!p12Pwd) {
      return NextResponse.json({ error: 'Falta la contrasena de la firma' }, { status: 400 });
    }

    const { data: rest, error: restErr } = await supabaseAdmin
      .from('restaurants')
      .select('id, name')
      .eq('id', restaurantId)
      .single();

    if (restErr || !rest) {
      console.error('upload-p12: restaurant not found', restErr);
      return NextResponse.json({ error: 'Restaurante no encontrado' }, { status: 404 });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('restaurants')
      .update({
        sri_p12_b64: p12B64,
        sri_p12_pwd: p12Pwd,
        updated_at: new Date().toISOString()
      })
      .eq('id', restaurantId);

    if (updateErr) {
      console.error('upload-p12: update error', updateErr);
      return NextResponse.json({
        error: `Error al guardar la firma: ${updateErr.message}`,
        details: updateErr
      }, { status: 500 });
    }

    console.log('upload-p12: SUCCESS for restaurant', restaurantId);
    return NextResponse.json({
      success: true,
      message: 'Firma electronica guardada correctamente',
      restaurantId,
      p12Size: p12B64.length
    });

  } catch (err: any) {
    console.error('upload-p12: unexpected error', err);
    return NextResponse.json({
      error: err.message || 'Error interno al guardar la firma'
    }, { status: 500 });
  }
}
