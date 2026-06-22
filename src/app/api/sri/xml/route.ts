// src/app/api/sri/xml/route.ts
// GET /api/sri/xml?orderId=XXX
// Generates the authorized SRI XML container on-the-fly and returns it.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateFacturaForOrder, getSignatureForRestaurant } from '@/lib/sri/db';
import { signXml } from '@/lib/sri/firma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ error: 'Falta el ID del pedido (orderId)' }, { status: 400 });
    }

    // 1. Fetch order SRI details
    const { data: order, error: oErr } = await supabaseAdmin
      .from('orders')
      .select('id, invoice_ref, sri_estado, sri_autorizacion, sri_fecha_aut, restaurant_id')
      .eq('id', orderId)
      .single();

    if (oErr || !order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }

    if (order.sri_estado !== 'AUTORIZADO') {
      return NextResponse.json({ error: 'El comprobante aún no ha sido AUTORIZADO por el SRI' }, { status: 400 });
    }

    // 2. Re-generate XML
    const facturaResult = await generateFacturaForOrder(orderId);

    // 3. Fetch restaurant signature keys
    const signatureDetails = await getSignatureForRestaurant(order.restaurant_id);

    if (!signatureDetails) {
      return NextResponse.json({ error: 'Firma electrónica del emisor no configurada.' }, { status: 422 });
    }

    // 4. Sign XML
    const signed = signXml(facturaResult.xml, {
      p12B64: signatureDetails.p12B64,
      pwd: signatureDetails.pwd
    });

    // 5. Wrap in SRI Authorization structure
    // Formatear fecha en hora Ecuador (UTC-5) con offset explícito, igual que el SRI
    const toEcuadorIso = (iso: string) => {
      const d = new Date(iso);
      const ec = new Date(d.getTime() - 5 * 3600 * 1000);
      return ec.toISOString().replace('Z', '-05:00');
    };
    const fechaAutFormatted = toEcuadorIso(order.sri_fecha_aut || new Date().toISOString());
    const authorizedXml = `<?xml version="1.0" encoding="UTF-8"?>
<autorizacion>
  <estado>${order.sri_estado}</estado>
  <numeroAutorizacion>${order.sri_autorizacion || order.invoice_ref}</numeroAutorizacion>
  <fechaAutorizacion class="fechaAutorizacion">${fechaAutFormatted}</fechaAutorizacion>
  <comprobante><![CDATA[${signed}]]></comprobante>
  <mensajes/>
</autorizacion>`;

    return new Response(authorizedXml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename=FAC_${order.invoice_ref || orderId}.xml`,
      },
    });

  } catch (error: any) {
    console.error('Error in SRI XML generation route:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}
