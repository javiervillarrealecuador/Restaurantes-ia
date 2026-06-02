import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '1004775756060621';
  const to = req.nextUrl.searchParams.get('to') || '593996804772';

  if (!token) {
    return NextResponse.json({ error: 'Token no configurado en Vercel' }, { status: 500 });
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: 'Mensaje de diagnóstico desde Vercel 🛠️' },
        }),
      }
    );

    const data = await response.json();

    return NextResponse.json({
      status: response.status,
      ok: response.ok,
      meta_response: data
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
