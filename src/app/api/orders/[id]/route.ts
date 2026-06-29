import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

const formatOrderCode = (code: string | null): string => {
  if (!code) return '';
  const match = code.match(/(\d{13})/);
  if (!match) return code;
  
  const numCode = match[1];
  const year = numCode.slice(0, 4);
  const month = numCode.slice(4, 6);
  const day = numCode.slice(6, 8);
  const seq = numCode.slice(8);
  return code.replace(numCode, `${year}-${month}-${day}-${seq}`);
};

async function verifyStaff(req: NextRequest, restaurantId: string): Promise<boolean> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return false;
  const token = authHeader.replace(/^Bearer\s+/i, '');

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return false;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  if (profile?.is_super_admin) return true;

  const { data: staff } = await supabaseAdmin
    .from('restaurant_staff')
    .select('role')
    .eq('profile_id', user.id)
    .eq('restaurant_id', restaurantId)
    .limit(1);

  return !!staff && staff.length > 0;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id;
    const body = await req.json();
    const { status, is_paid, payment_reference, payment_receipt_url, cutlery_delivered, payment_method } = body;

    if (status === undefined && is_paid === undefined && payment_reference === undefined && payment_receipt_url === undefined && cutlery_delivered === undefined && payment_method === undefined) {
      return NextResponse.json({ error: 'At least one field to update is required' }, { status: 400 });
    }

    // Validate status is a known enum value
    const VALID_STATUSES = ['pending', 'pending_payment', 'confirmed', 'preparing', 'ready', 'delivering', 'delivered', 'cancelled'];
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
    }

    // Validate is_paid is a boolean
    if (is_paid !== undefined && typeof is_paid !== 'boolean') {
      return NextResponse.json({ error: 'is_paid must be a boolean' }, { status: 400 });
    }

    // 1. Fetch current order details
    const { data: order, error: fetchErr } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // 2. Validate that the requesting user is a staff member of this restaurant
    const isAuthorized = await verifyStaff(req, order.restaurant_id);
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized. Staff membership required.' }, { status: 401 });
    }

    const previousStatus = order.status;

    const updatePayload: { 
      updated_at: string; 
      status?: string; 
      is_paid?: boolean;
      payment_method?: string;
      payment_reference?: string | null;
      payment_receipt_url?: string | null;
      cutlery_delivered?: boolean;
    } = { updated_at: new Date().toISOString() };
    
    if (status !== undefined) updatePayload.status = status;
    if (is_paid !== undefined) {
      updatePayload.is_paid = is_paid;
      // Auto-transition to pending if paid and currently pending_payment
      if (is_paid === true && previousStatus === 'pending_payment' && status === undefined) {
        updatePayload.status = 'pending';
      }
    }
    if (payment_method !== undefined) updatePayload.payment_method = payment_method;
    
    // Validate uniqueness of payment_reference if it's being updated
    if (payment_reference !== undefined) {
      if (payment_reference) {
        const { data: existingOrder } = await supabaseAdmin
          .from('orders')
          .select('id')
          .eq('restaurant_id', order.restaurant_id)
          .eq('payment_reference', payment_reference)
          .neq('id', orderId)
          .limit(1);
        
        if (existingOrder && existingOrder.length > 0) {
          return NextResponse.json({ error: 'El número de comprobante/transferencia ya ha sido utilizado en otro pedido.' }, { status: 400 });
        }
      }
      updatePayload.payment_reference = payment_reference;
    }
    if (payment_receipt_url !== undefined) updatePayload.payment_receipt_url = payment_receipt_url;
    if (cutlery_delivered !== undefined) updatePayload.cutlery_delivered = cutlery_delivered;

    // 2. Update order status in database
    const { data: updatedOrder, error: updateErr } = await supabaseAdmin
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // 2.5 Release table if the order is delivered or cancelled (dine-in orders)
    if (status !== undefined && (status === 'delivered' || status === 'cancelled')) {
      if (order.type === 'dine_in' && order.table_number && order.branch_id) {
        try {
          await supabaseAdmin
            .from('restaurant_tables')
            .update({ status: 'free', current_order_id: null })
            .eq('branch_id', order.branch_id)
            .eq('table_number', order.table_number);
          console.log(`Table ${order.table_number} in branch ${order.branch_id} released successfully.`);
        } catch (tableErr) {
          console.error(`Failed to release table for order ${orderId}:`, tableErr);
        }
      }
    }

    // 3. Send WhatsApp notification based on the status change
    if (status !== undefined && previousStatus !== status) {
      // Fetch WhatsApp Phone Number ID and Access Token from restaurant settings
      const { data: settings } = await supabaseAdmin
        .from('settings')
        .select('whatsapp_phone_number_id, whatsapp_access_token')
        .eq('restaurant_id', order.restaurant_id)
        .single();

      const phoneId = settings?.whatsapp_phone_number_id;
      const customToken = settings?.whatsapp_access_token;

      // If no phone ID configured, skip WhatsApp notification (don't use fake fallback)
      if (!phoneId) {
        console.warn(`No WhatsApp phone_number_id configured for restaurant ${order.restaurant_id}. Skipping notification.`);
      }

      let notificationText = '';
      const clientName = order.customer_name || 'Cliente';
      const clientPhone = order.customer_phone;
      const orderCodeText = order.order_code ? ` *${formatOrderCode(order.order_code)}*` : ' de tu pedido';

      if (status === 'confirmed') {
        notificationText = `¡Hola, ${clientName}! 👋 El restaurante ha confirmado tu pedido${orderCodeText} y ya está siendo procesado. 📝🍳`;
      } else if (status === 'preparing') {
        notificationText = `¡Hola, ${clientName}! 🍳 Tu pedido${orderCodeText} ya está en preparación en cocina.`;
      } else if (status === 'ready') {
        if (order.type === 'delivery') {
          notificationText = `¡Hola, ${clientName}! 🥡 Tu pedido${orderCodeText} ya está listo en la cocina del local y está siendo asignado a un repartidor. Te avisaremos apenas salga en camino.`;
        } else if (order.type === 'pickup') {
          notificationText = `🥡 ¡Hola, ${clientName}! Tu pedido${orderCodeText} ya está listo para retirar en el local. ¡Te esperamos!`;
        } else if (order.type === 'dine_in') {
          notificationText = `🍽️ ¡Hola, ${clientName}! Tu pedido${orderCodeText} está listo y va camino a tu Mesa ${order.table_number || 'indicada'}. ¡Buen provecho!`;
        }
      } else if (status === 'delivering') {
        notificationText = `🛵 ¡Buenas noticias, ${clientName}! Tu pedido${orderCodeText} ya va en camino a tu dirección:\n📍 *${order.delivery_address || 'Dirección indicada'}*\n\n¡Nuestro repartidor llegará muy pronto!`;
      } else if (status === 'delivered') {
        notificationText = `¡Hola, ${clientName}! ✨ Tu pedido${orderCodeText} ha sido entregado. Muchas gracias por tu compra. ¡Esperamos que lo disfrutes! ❤️🍽️\n\n¿Qué te pareció el servicio? Responde con una calificación del 1 al 5 ⭐`;
      } else if (status === 'cancelled') {
        notificationText = `¡Hola, ${clientName}! Lo sentimos, tu pedido${orderCodeText} ha sido cancelado por el restaurante. Si tienes alguna duda, por favor contáctanos por este medio.`;
      }

      // 3. Send WhatsApp notification — in a separate try/catch so a
      // WhatsApp failure does NOT roll back the already-successful DB update.
      if (notificationText && clientPhone && phoneId) {
        try {
          await sendWhatsAppMessage(clientPhone, notificationText, phoneId, customToken);
        } catch (waErr) {
          console.error('WhatsApp notification failed (order was updated successfully):', waErr);
        }
      }
    }

    return NextResponse.json({ success: true, order: updatedOrder });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error updating order status in API:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
