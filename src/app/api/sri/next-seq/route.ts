// src/app/api/sri/next-seq/route.ts
// GET /api/sri/next-seq?restaurantId=xxx
// Devuelve el próximo número secuencial SIN consumirlo (sólo lectura).
// Usado por el modal de facturación para mostrar el número que se asignará.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const restaurantId = searchParams.get('restaurantId');

  if (!restaurantId) {
    return NextResponse.json({ error: 'restaurantId requerido' }, { status: 400 });
  }

  // Obtener estab y pto_emi del restaurante
  const { data: rest, error: rErr } = await supabaseAdmin
    .from('restaurants')
    .select('sri_estab, sri_pto_emi')
    .eq('id', restaurantId)
    .single();

  if (rErr || !rest) {
    return NextResponse.json({ error: 'Restaurante no encontrado' }, { status: 404 });
  }

  const estab  = rest.sri_estab  || '001';
  const ptoEmi = rest.sri_pto_emi || '001';

  // Leer el próximo número SIN consumirlo (SELECT, no RPC atómica)
  const { data: seq } = await supabaseAdmin
    .from('sri_document_sequence')
    .select('next_number')
    .eq('restaurant_id', restaurantId)
    .eq('doc_type', 'factura')
    .eq('estab', estab)
    .eq('pto_emi', ptoEmi)
    .maybeSingle();

  const nextNumber = seq?.next_number ?? 1;
  const formatted  = `${estab}-${ptoEmi}-${String(nextNumber).padStart(9, '0')}`;

  return NextResponse.json({ nextNumber, estab, ptoEmi, formatted });
}
