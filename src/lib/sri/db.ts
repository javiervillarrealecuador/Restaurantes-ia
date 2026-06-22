// src/lib/sri/db.ts
// Conecta el generador puro con la base de datos de Supabase.

import { supabaseAdmin } from '../supabaseAdmin';
import { buildFacturaXml, type FacturaInput, type FacturaResult } from './factura';
import { decryptValue } from '../crypto';

export interface DBRestaurant {
  id: string;
  name: string;
  address: string | null;
  ruc: string | null;
  sri_dir_matriz: string | null;
  sri_dir_estab: string | null;
  sri_estab: string | null;
  sri_pto_emi: string | null;
  sri_obligado_contab: boolean;
  sri_rimpe: string | null;
  sri_agente_retencion: string | null;
  sri_contrib_especial: string | null;
  sri_ambiente: number;
  sri_p12_b64: string | null;
  sri_p12_pwd: string | null;
  sri_iva_rate: number;
  sri_iva_temporal: number | null;
  sri_iva_temporal_inicio: string | null;
  sri_iva_temporal_fin: string | null;
}

/**
 * Resuelve la tasa de IVA activa para el restaurante según la fecha actual.
 * Compara si hoy cae dentro del rango de una tasa de IVA temporal programada.
 */
export function getActiveIvaRate(restaurant: DBRestaurant): number {
  if (
    restaurant.sri_iva_temporal !== null &&
    restaurant.sri_iva_temporal !== undefined &&
    !isNaN(Number(restaurant.sri_iva_temporal))
  ) {
    const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd
    const inicio = restaurant.sri_iva_temporal_inicio;
    const fin = restaurant.sri_iva_temporal_fin;
    if (inicio && fin && today >= inicio && today <= fin) {
      return Number(restaurant.sri_iva_temporal);
    }
  }
  return Number(restaurant.sri_iva_rate ?? 15.00);
}

export async function generateFacturaForOrder(orderId: string, secuencialOverride?: number | null): Promise<FacturaResult> {
  // 1. Fetch Order and Line Items
  const { data: order, error: oErr } = await supabaseAdmin
    .from('orders')
    .select(`
      id,
      order_number,
      order_code,
      created_at,
      invoice_ref,
      invoice_auth,
      status,
      restaurant_id,
      forma_pago,
      billing_name,
      billing_vat,
      billing_address,
      billing_email,
      customer_name,
      customer_phone,
      delivery_address,
      branch_id,
      order_items (
        quantity,
        unit_price,
        iva_rate,
        selected_modifiers,
        menu_items (
          name,
          code
        )
      )
    `)
    .eq('id', orderId)
    .single();

  if (oErr || !order) {
    throw new Error(`Pedido no encontrado: ${oErr?.message || 'ID inválido'}`);
  }

  const orderAny = order as any;

  // 2. Fetch Restaurant/Company details
  const { data: restaurant, error: rErr } = await supabaseAdmin
    .from('restaurants')
    .select('*')
    .eq('id', orderAny.restaurant_id)
    .single();

  if (rErr || !restaurant) {
    throw new Error(`Configuración de restaurante no encontrada: ${rErr?.message || 'ID de restaurante inválido'}`);
  }

  const rest = restaurant as DBRestaurant;
  if (!rest.ruc || !/^\d{13}$/.test(rest.ruc)) {
    throw new Error(`El RUC del restaurante (${rest.ruc || 'vacío'}) debe tener 13 dígitos.`);
  }

  // 3. Resolve establishment codes and address (fallback to branch if available)
  let estab = rest.sri_estab || '001';
  let ptoEmi = rest.sri_pto_emi || '001';
  let dirEstablecimiento = rest.sri_dir_estab || rest.address || 'S/D';

  if (orderAny.branch_id) {
    const { data: branch } = await supabaseAdmin
      .from('branches')
      .select('name, address, sri_estab, sri_pto_emi')
      .eq('id', orderAny.branch_id)
      .single();
    if (branch) {
      const b = branch as any;
      if (b.sri_estab) estab = b.sri_estab;
      if (b.sri_pto_emi) ptoEmi = b.sri_pto_emi;
      if (b.address) dirEstablecimiento = b.address;
    }
  }

  // 4. Resolve sequential number atomically
  let secuencial: number;
  let numeroFactura = orderAny.invoice_ref;
  let claveAcceso = orderAny.invoice_auth;

  if (numeroFactura) {
    // Pedido ya tenía un número reservado de un intento previo — reutilizarlo
    const parts = numeroFactura.split('-');
    if (parts.length === 3) {
      secuencial = parseInt(parts[2]);
    } else {
      secuencial = orderAny.order_number;
    }
  } else if (secuencialOverride != null && !isNaN(Number(secuencialOverride))) {
    // El usuario especificó manualmente el número secuencial desde el modal
    secuencial = Number(secuencialOverride);
    numeroFactura = `${estab}-${ptoEmi}-${String(secuencial).padStart(9, '0')}`;
    // Actualizar el contador para que el próximo número automático sea el siguiente
    await supabaseAdmin
      .from('sri_document_sequence')
      .upsert({
        restaurant_id: orderAny.restaurant_id,
        doc_type: 'factura',
        estab,
        pto_emi: ptoEmi,
        next_number: secuencial + 1
      }, { onConflict: 'restaurant_id,doc_type,estab,pto_emi' });
  } else {
    // Generar número atómicamente con la función PG
    const { data: nextSec, error: seqErr } = await supabaseAdmin
      .rpc('sri_next_secuencial', {
        p_restaurant_id: orderAny.restaurant_id,
        p_doc_type: 'factura',
        p_estab: estab,
        p_pto_emi: ptoEmi
      });
    if (seqErr) {
      console.error('Error reserving sequential:', seqErr);
      throw new Error(`Error al generar secuencial del SRI: ${seqErr.message}`);
    }
    secuencial = nextSec;
    numeroFactura = `${estab}-${ptoEmi}-${String(secuencial).padStart(9, '0')}`;
  }

  // 5. Construct lines mapping item modifiers into unit_price sum and description text
  const lineas = (orderAny.order_items || []).map((l: any) => {
    const modifiers = Array.isArray(l.selected_modifiers) ? l.selected_modifiers : [];
    const modifiersPriceSum = modifiers.reduce((sum: number, m: any) => sum + (Number(m.price) || 0), 0);
    const priceUnit = Number(l.unit_price) + modifiersPriceSum;

    let descripcion = l.menu_items?.name || 'Producto';
    if (modifiers.length > 0) {
      descripcion += ` (${modifiers.map((m: any) => m.name).join(', ')})`;
    }

    return {
      codigo: l.menu_items?.code || `PROD-${l.menu_item_id?.slice(0, 8) || 'GEN'}`,
      descripcion,
      cantidad: Number(l.quantity),
      precioUnitario: priceUnit,
      descuento: 0,
      ivaRate: l.iva_rate !== null && l.iva_rate !== undefined ? Number(l.iva_rate) : 15.00,
    };
  });

  if (lineas.length === 0) {
    throw new Error('El pedido no contiene ningún ítem para facturar.');
  }

  const input: FacturaInput = {
    emisor: {
      ruc: rest.ruc,
      razonSocial: rest.name,
      nombreComercial: rest.name,
      dirMatriz: rest.sri_dir_matriz || rest.address || 'S/D',
      dirEstablecimiento,
      estab,
      ptoEmi,
      ambiente: rest.sri_ambiente === 2 ? 2 : 1,
      obligadoContabilidad: rest.sri_obligado_contab !== false,
      contribuyenteEspecial: rest.sri_contrib_especial || null,
      agenteRetencion: rest.sri_agente_retencion || null,
      contribuyenteRimpe: rest.sri_rimpe || null,
    },
    comprador: {
      identificacion: (orderAny.billing_vat || '9999999999999').trim(),
      razonSocial: (orderAny.billing_name || 'CONSUMIDOR FINAL').trim(),
      direccion: orderAny.billing_address || orderAny.delivery_address || 'S/D',
    },
    fechaEmision: orderAny.created_at,
    secuencial,
    lineas,
    formaPago: orderAny.forma_pago || '01',
  };

  const result = buildFacturaXml(input);

  // Update order with reserved numbers if they weren't saved yet
  const updates: any = {};
  if (!orderAny.invoice_auth) updates.invoice_auth = result.claveAcceso;
  if (!orderAny.invoice_ref)  updates.invoice_ref  = result.numeroFactura;
  if (Object.keys(updates).length > 0) {
    await supabaseAdmin.from('orders').update(updates).eq('id', orderId);
  }

  return result;
}

export interface SriSignatureDetails {
  p12B64: string;
  pwd: string;
  razon: string | null;
  expira: string | null;
}

/**
 * Obtiene la firma electrónica activa de la tabla sri_firmas.
 * Si no hay ninguna o la tabla no existe, hace un fallback leyendo
 * las columnas heredadas directamente de la tabla restaurants.
 */
export async function getSignatureForRestaurant(restaurantId: string): Promise<SriSignatureDetails | null> {
  try {
    const { data: signature, error } = await supabaseAdmin
      .from('sri_firmas')
      .select('archivo_base64, clave, razon_social, expiracion')
      .eq('restaurant_id', restaurantId)
      .eq('esta_activa', true)
      .maybeSingle();

    if (!error && signature && signature.archivo_base64 && signature.clave) {
      return {
        p12B64: decryptValue(signature.archivo_base64),
        pwd: decryptValue(signature.clave),
        razon: signature.razon_social,
        expira: signature.expiracion
       };
    }
  } catch (err) {
    console.warn('Error querying sri_firmas table, falling back to legacy:', err);
  }

  // Fallback a las columnas en la tabla restaurants
  try {
    const { data: restaurant, error } = await supabaseAdmin
      .from('restaurants')
      .select('sri_p12_b64, sri_p12_pwd, sri_firma_razon, sri_firma_expira')
      .eq('id', restaurantId)
      .single();

    if (!error && restaurant && restaurant.sri_p12_b64 && restaurant.sri_p12_pwd) {
      return {
        p12B64: decryptValue(restaurant.sri_p12_b64),
        pwd: decryptValue(restaurant.sri_p12_pwd),
        razon: restaurant.sri_firma_razon,
        expira: restaurant.sri_firma_expira
      };
    }
  } catch (err) {
    console.error('Error fetching fallback legacy signature:', err);
  }

  return null;
}
