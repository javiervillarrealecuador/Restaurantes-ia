import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id;
    const body = await req.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
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

    const previousStatus = order.status;

    // 2. Update order status in database
    const { data: updatedOrder, error: updateErr } = await supabaseAdmin
      .from('orders')
      .update({ 
        status, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // 3. Send WhatsApp notification based on the status change
    if (previousStatus !== status) {
      // Fetch WhatsApp Phone Number ID from restaurant settings
      const { data: settings } = await supabaseAdmin
        .from('settings')
        .select('whatsapp_phone_number_id')
        .eq('restaurant_id', order.restaurant_id)
        .single();

      const phoneId = settings?.whatsapp_phone_number_id || '123456789012345'; // fallback test phone ID

      let notificationText = '';
      const clientName = order.customer_name || 'Cliente';
      const clientPhone = order.customer_phone;
      const orderCodeText = order.order_code ? ` *${order.order_code}*` : ' de tu pedido';

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
        notificationText = `¡Hola, ${clientName}! ✨ Tu pedido${orderCodeText} ha sido entregado. Muchas gracias por tu compra. ¡Esperamos que lo disfrutes! ❤️🍽️`;
      } else if (status === 'cancelled') {
        notificationText = `¡Hola, ${clientName}! Lo sentimos, tu pedido${orderCodeText} ha sido cancelado por el restaurante. Si tienes alguna duda, por favor contáctanos por este medio.`;
      }

      if (notificationText && clientPhone) {
        await sendWhatsAppMessage(clientPhone, notificationText, phoneId);
      }
    }

    return NextResponse.json({ success: true, order: updatedOrder });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error updating order status in API:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
