// src/app/api/sri/metadata/route.ts
import { NextResponse } from 'next/server';
import { extractP12Metadata } from '@/lib/sri/firma';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Node.js runtime -- node-forge requiere Node.js, no puede correr en Edge
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    // Verificar autenticacion
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Sesion invalida' }, { status: 401 });
    }

    const { p12B64, pwd } = await request.json();
    if (!p12B64 || !pwd) {
      return NextResponse.json({ error: 'Falta p12B64 o pwd' }, { status: 400 });
    }
    const meta = extractP12Metadata(p12B64, pwd);
    return NextResponse.json(meta);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Firma .p12 invalida' }, { status: 422 });
  }
}
