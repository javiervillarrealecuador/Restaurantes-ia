// src/app/api/sri/invoice/route.ts
// Next.js App Router API Route
// POST /api/sri/invoice

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateFacturaForOrder, getSignatureForRestaurant } from '@/lib/sri/db';
import { signXml } from '@/lib/sri/firma';
import { enviarComprobante, consultarAutorizacion } from '@/lib/sri/soap';
import nodemailer from 'nodemailer';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function buildMailHtml(data: any): string {
  const f2 = (n: number) => `$ ${n.toFixed(2)}`;
  const ambLabel = data.ambiente === 2 ? 'PRODUCCIÓN' : 'PRUEBAS';
  const ambColor = data.ambiente === 2 ? '#166534' : '#854d0e';
  const ambBg    = data.ambiente === 2 ? '#dcfce7'  : '#fef9c3';

  const lineas = data.lineas.map((l: any) => `
    <tr>
      <td style="padding:6px;border-bottom:1px solid #e2e8f0;font-size:11px">${l.codigo}</td>
      <td style="padding:6px;border-bottom:1px solid #e2e8f0;font-size:11px">${l.descripcion}</td>
      <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${l.cantidad.toFixed(2)}</td>
      <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${l.precioUnitario.toFixed(4)}</td>
      <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${l.descuento.toFixed(2)}</td>
      <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;font-size:11px">${l.subtotal.toFixed(2)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Comprobante Electrónico</title></head>
<body style="margin:0;padding:16px;background:#f8fafc;font-family:Arial,sans-serif;font-size:13px;color:#1e293b">
<div style="max-width:700px;margin:0 auto;background:white;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
  <div style="display:flex;padding:16px;border-bottom:1px solid #e2e8f0;gap:16px">
    <div style="flex:1">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px">${data.razonSocial}</div>
      <div>RUC: <strong>${data.ruc}</strong></div>
      <div style="font-size:11px;color:#475569">${data.dirMatriz}</div>
      ${data.dirEstab && data.dirEstab !== data.dirMatriz ? `<div style="font-size:11px;color:#475569">Sucursal: ${data.dirEstab}</div>` : ''}
      <div style="font-size:11px">Obligado contabilidad: <strong>${data.obligadoContab ? 'SÍ' : 'NO'}</strong></div>
      ${data.rimpe ? `<div style="font-size:11px;color:#0369a1">${data.rimpe}</div>` : ''}
    </div>
    <div style="flex:1;border:1px solid #cbd5e1;border-radius:6px;padding:12px;background:#f8fafc">
      <div style="font-weight:700;font-size:13px">FACTURA ELECTRÓNICA</div>
      <div style="font-weight:600;margin:4px 0">Nº ${data.numeroFactura}</div>
      <div style="font-size:10px;color:#64748b">NÚMERO DE AUTORIZACIÓN:</div>
      <div style="font-size:9px;word-break:break-all;font-family:monospace">${data.claveAcceso}</div>
      <div style="margin-top:6px;font-size:11px">Fecha: <strong>${data.fechaEmision}</strong></div>
      <span style="font-size:11px;padding:2px 8px;border-radius:12px;font-weight:600;background:${ambBg};color:${ambColor}">${ambLabel}</span>
    </div>
  </div>
  <div style="padding:10px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc">
    <strong>Cliente:</strong> ${data.compradorNombre} &nbsp;|&nbsp;
    <strong>Cédula/RUC:</strong> ${data.compradorId}
    ${data.compradorDir ? ` &nbsp;|&nbsp; <strong>Dir:</strong> ${data.compradorDir}` : ''}
  </div>
  <div style="padding:0 16px">
    <table style="width:100%;border-collapse:collapse;margin:12px 0">
      <thead><tr style="background:#f1f5f9;font-size:11px;color:#475569">
        <th style="padding:6px;text-align:left">Código</th>
        <th style="padding:6px;text-align:left">Descripción</th>
        <th style="padding:6px;text-align:right">Cant.</th>
        <th style="padding:6px;text-align:right">P. Unit.</th>
        <th style="padding:6px;text-align:right">Dscto.</th>
        <th style="padding:6px;text-align:right">Subtotal</th>
      </tr></thead>
      <tbody>${lineas}</tbody>
    </table>
  </div>
  <div style="padding:8px 16px 16px;display:flex;justify-content:flex-end">
    <table style="border-collapse:collapse;min-width:280px">
      ${data.subtotal15 > 0 ? `<tr><td style="padding:3px 8px;font-size:12px">Subtotal 15%</td><td style="padding:3px 8px;text-align:right;font-family:monospace;font-size:12px">${f2(data.subtotal15)}</td></tr>` : ''}
      ${data.subtotal5  > 0 ? `<tr><td style="padding:3px 8px;font-size:12px">Subtotal 5%</td><td style="padding:3px 8px;text-align:right;font-family:monospace;font-size:12px">${f2(data.subtotal5)}</td></tr>` : ''}
      ${data.subtotal0  > 0 ? `<tr><td style="padding:3px 8px;font-size:12px">Subtotal 0%</td><td style="padding:3px 8px;text-align:right;font-family:monospace;font-size:12px">${f2(data.subtotal0)}</td></tr>` : ''}
      <tr><td style="padding:3px 8px;font-size:12px">IVA</td><td style="padding:3px 8px;text-align:right;font-family:monospace;font-size:12px">${f2(data.iva)}</td></tr>
      <tr style="background:#1e293b;color:white;font-weight:700">
        <td style="padding:5px 8px;border-radius:4px 0 0 4px;font-size:12px">VALOR TOTAL</td>
        <td style="padding:5px 8px;text-align:right;font-family:monospace;border-radius:0 4px 4px 0;font-size:12px">${f2(data.total)}</td>
      </tr>
    </table>
  </div>
  <div style="background:#f1f5f9;padding:10px 16px;font-size:10px;text-align:center;color:#64748b;border-top:1px solid #e2e8f0">
    ${data.ambiente === 1
      ? 'DOCUMENTO EMITIDO EN AMBIENTE DE PRUEBAS – SIN VALIDEZ TRIBUTARIA'
      : 'Comprobante electrónico autorizado por el SRI – Ecuador'}
  </div>
</div></body></html>`;
}

export async function POST(request: Request) {
  try {
    const { orderId, formaPago, billingName, billingVat, billingAddress, billingEmail } = await request.json();

    if (!orderId) {
      return NextResponse.json({ error: 'Falta el ID del pedido (orderId)' }, { status: 400 });
    }

    // 1. Update order billing data in Supabase before generating XML
    const orderUpdates: any = {
      sri_requiere_factura: true,
      forma_pago: formaPago || '01',
      billing_vat: (billingVat || '9999999999999').trim(),
      billing_name: (billingName || 'CONSUMIDOR FINAL').trim(),
      billing_address: billingAddress || 'S/D',
      billing_email: billingEmail || '',
      updated_at: new Date().toISOString()
    };

    const { error: updateErr } = await supabaseAdmin
      .from('orders')
      .update(orderUpdates)
      .eq('id', orderId);

    if (updateErr) {
      console.error('Error updating order billing details:', updateErr);
      return NextResponse.json({ error: `Error al actualizar datos de facturación: ${updateErr.message}` }, { status: 500 });
    }

    // 2. Fetch order data, company settings and build pure XML
    let facturaResult;
    try {
      facturaResult = await generateFacturaForOrder(orderId);
    } catch (dbErr: any) {
      console.error('Error generating XML data input:', dbErr);
      return NextResponse.json({ error: dbErr.message || 'Error construyendo XML de la factura' }, { status: 422 });
    }

    // 3. Fetch company P12 digital signature
    const { data: orderData } = await supabaseAdmin.from('orders').select('restaurant_id').eq('id', orderId).single();
    const { data: restaurant } = await supabaseAdmin
      .from('restaurants')
      .select('name, sri_ambiente')
      .eq('id', orderData?.restaurant_id)
      .single();

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurante no encontrado' }, { status: 404 });
    }

    const signatureDetails = await getSignatureForRestaurant(orderData?.restaurant_id);
    if (!signatureDetails) {
      return NextResponse.json({
        error: `El restaurante "${restaurant.name}" no tiene firma electrónica (.p12) activa configurada.`
      }, { status: 422 });
    }

    const ambiente = restaurant.sri_ambiente === 2 ? 2 : 1;

    // 4. Sign XML using XAdES-BES
    let signedXml: string;
    try {
      signedXml = signXml(facturaResult.xml, {
        p12B64: signatureDetails.p12B64,
        pwd: signatureDetails.pwd
      });
    } catch (signErr: any) {
      console.error('Error signing XML:', signErr);
      return NextResponse.json({ error: `Fallo en la firma digital: ${signErr.message}` }, { status: 500 });
    }

    // 5. Send to SRI Web Service (Recepcion WS)
    let recepcion;
    try {
      recepcion = await enviarComprobante(signedXml, ambiente);
    } catch (wsErr: any) {
      console.error('Error sending XML to SRI:', wsErr);
      return NextResponse.json({ error: `Fallo de conexión con Web Service del SRI: ${wsErr.message}` }, { status: 500 });
    }

    const messagesList = [...recepcion.mensajes];

    if (recepcion.estado !== 'RECIBIDA') {
      // Update order state as DEVUELTA/RECHAZADA
      await supabaseAdmin
        .from('orders')
        .update({
          sri_estado: recepcion.estado || 'DEVUELTA',
          sri_ambiente: ambiente,
          sri_mensajes: messagesList.join('\n') || 'Comprobante devuelto por el SRI'
        })
        .eq('id', orderId);

      return NextResponse.json({
        success: false,
        estado: recepcion.estado,
        mensajes: messagesList,
        invoiceRef: facturaResult.numeroFactura,
        invoiceAuth: facturaResult.claveAcceso
      });
    }

    // 6. Query Authorization Web Service with Retries (5 attempts, 2s sleep)
    let aut = null;
    let authError = '';

    try {
      for (let i = 0; i < 5; i++) {
        await sleep(2000);
        aut = await consultarAutorizacion(facturaResult.claveAcceso, ambiente);
        if (aut.estado === 'AUTORIZADO' || aut.estado === 'NO AUTORIZADO') {
          break;
        }
      }
    } catch (autErr: any) {
      console.error('Error querying authorization:', autErr);
      authError = autErr.message;
    }

    const finalEstado = aut?.estado || 'EN PROCESO';
    const finalMensajes = [...messagesList, ...(aut?.mensajes || [])];
    if (authError) finalMensajes.push(`[ERROR CONSULTA]: ${authError}`);

    // Update database with final status
    const finalUpdates: any = {
      sri_estado: finalEstado,
      sri_ambiente: ambiente,
      sri_mensajes: finalMensajes.join('\n') || null
    };

    if (aut?.numeroAutorizacion) {
      finalUpdates.sri_autorizacion = aut.numeroAutorizacion;
    }
    if (aut?.fechaAutorizacion) {
      const d = new Date(aut.fechaAutorizacion);
      if (!isNaN(d.getTime())) {
        finalUpdates.sri_fecha_aut = d.toISOString();
      } else {
        finalUpdates.sri_fecha_aut = new Date().toISOString();
      }
    }
    // Mark as paid if invoice is authorized
    if (finalEstado === 'AUTORIZADO') {
      finalUpdates.is_paid = true;
    }

    await supabaseAdmin
      .from('orders')
      .update(finalUpdates)
      .eq('id', orderId);

    // 7. Send Email via Nodemailer if authorized and email is provided
    let emailSent = false;
    let emailWarning = '';

    if (finalEstado === 'AUTORIZADO' && billingEmail) {
      try {
        const smtpHost = process.env.SMTP_HOST;
        const smtpPort = process.env.SMTP_PORT;
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;

        if (smtpHost && smtpUser && smtpPass) {
          // Re-fetch order with items to populate HTML template
          const { data: orderDetails } = await supabaseAdmin
            .from('orders')
            .select(`
              *,
              restaurants (*),
              order_items (
                quantity,
                unit_price,
                iva_rate,
                menu_items (
                  name,
                  code
                )
              )
            `)
            .eq('id', orderId)
            .single();

          const od = orderDetails as any;
          
          let subtotal15 = 0, subtotal5 = 0, subtotal0 = 0;
          const lineasMail: any[] = [];

          for (const l of (od.order_items || [])) {
            const modifiers = Array.isArray(l.selected_modifiers) ? l.selected_modifiers : [];
            const modifiersPriceSum = modifiers.reduce((sum: number, m: any) => sum + (Number(m.price) || 0), 0);
            const priceUnit = Number(l.unit_price) + modifiersPriceSum;
            const sub = Number(l.quantity) * priceUnit;
            const rate = Number(l.iva_rate);

            if (rate >= 15) subtotal15 += sub;
            else if (rate === 5) subtotal5 += sub;
            else subtotal0 += sub;

            let desc = l.menu_items?.name || 'Producto';
            if (modifiers.length > 0) {
              desc += ` (${modifiers.map((m: any) => m.name).join(', ')})`;
            }

            lineasMail.push({
              codigo: l.menu_items?.code || `P-${l.menu_item_id?.slice(0, 8)}`,
              descripcion: desc,
              cantidad: Number(l.quantity),
              precioUnitario: priceUnit,
              descuento: 0,
              subtotal: sub
            });
          }

          const mailHtml = buildMailHtml({
            razonSocial: od.restaurants?.name || '',
            ruc: od.restaurants?.ruc || '',
            dirMatriz: od.restaurants?.sri_dir_matriz || od.restaurants?.address || 'S/D',
            dirEstab: od.restaurants?.sri_dir_estab || null,
            obligadoContab: od.restaurants?.sri_obligado_contab !== false,
            rimpe: od.restaurants?.sri_rimpe || null,
            numeroFactura: od.invoice_ref || od.order_code || '',
            claveAcceso: facturaResult.claveAcceso,
            fechaEmision: new Date(od.created_at).toLocaleDateString('es-EC'),
            ambiente,
            compradorNombre: od.billing_name || 'CONSUMIDOR FINAL',
            compradorId: od.billing_vat || '9999999999999',
            compradorDir: od.billing_address || 'S/D',
            lineas: lineasMail,
            subtotal15: Math.round(subtotal15 * 100) / 100,
            subtotal5:  Math.round(subtotal5  * 100) / 100,
            subtotal0:  Math.round(subtotal0  * 100) / 100,
            iva: Number(od.tax) || 0,
            total: Number(od.total_price) || 0
          });

          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: parseInt(smtpPort || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: { user: smtpUser, pass: smtpPass }
          });

          const asunto = ambiente === 1
            ? `[PRUEBAS] Factura Electrónica ${od.invoice_ref || ''} - ${od.restaurants?.name}`
            : `Factura Electrónica ${od.invoice_ref || ''} - ${od.restaurants?.name}`;

          await transporter.sendMail({
            from: process.env.SMTP_FROM || smtpUser,
            to: billingEmail,
            subject: asunto,
            html: mailHtml,
            attachments: [
              {
                filename: `FAC_${od.invoice_ref}.xml`,
                content: signedXml,
                contentType: 'application/xml'
              }
            ]
          });

          emailSent = true;
        } else {
          emailWarning = 'SMTP no configurado en servidor (.env.local).';
        }
      } catch (mailErr: any) {
        console.error('Error sending SMTP email:', mailErr);
        emailWarning = `Fallo en el envío: ${mailErr.message}`;
      }
    }

    return NextResponse.json({
      success: finalEstado === 'AUTORIZADO',
      estado: finalEstado,
      numeroAutorizacion: aut?.numeroAutorizacion || null,
      fechaAutorizacion: aut?.fechaAutorizacion || null,
      mensajes: finalMensajes,
      invoiceRef: facturaResult.numeroFactura,
      invoiceAuth: facturaResult.claveAcceso,
      emailSent,
      emailWarning
    });

  } catch (error: any) {
    console.error('Invoice execution crash:', error);
    return NextResponse.json({ error: error.message || 'Error crítico en el proceso de facturación' }, { status: 500 });
  }
}
