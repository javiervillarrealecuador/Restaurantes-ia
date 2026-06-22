// src/app/api/sri/test-smtp/route.ts
// Endpoint temporal para probar SMTP desde Vercel.
// ELIMINAR después de verificar que el correo funciona.

import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const host  = searchParams.get('host')  || process.env.SMTP_HOST  || 'smtp.gmail.com';
  const port  = parseInt(searchParams.get('port')  || process.env.SMTP_PORT  || '587');
  const user  = searchParams.get('user')  || process.env.SMTP_USER  || '';
  const pass  = searchParams.get('pass')  || process.env.SMTP_PASS  || '';
  const to    = searchParams.get('to')    || user;

  if (!user || !pass) {
    return NextResponse.json({ error: 'Faltan user y pass como parámetros o env vars' }, { status: 400 });
  }

  try {
    const transporter = nodemailer.createTransport({
      host, port, secure: false,
      auth: { user, pass }
    });

    await transporter.verify();

    const info = await transporter.sendMail({
      from: user,
      to,
      subject: 'Prueba SMTP — Sistema Facturación SRI',
      html: '<p>Correo de prueba. Si lo recibes, el SMTP está funcionando correctamente.</p>'
    });

    return NextResponse.json({
      ok: true,
      messageId: info.messageId,
      response: info.response
    });

  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
