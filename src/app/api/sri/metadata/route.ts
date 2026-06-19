// src/app/api/sri/metadata/route.ts
// Forzar Node.js runtime (node-forge requiere Node.js, no Edge)
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { extractP12Metadata } from '@/lib/sri/firma';

export async function POST(request: Request) {
  try {
    const { p12B64, pwd } = await request.json();
    if (!p12B64 || !pwd) {
      return NextResponse.json({ error: 'Falta p12B64 o pwd' }, { status: 400 });
    }
    const meta = extractP12Metadata(p12B64, pwd);
    return NextResponse.json(meta);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Firma .p12 inválida' }, { status: 422 });
  }
}
