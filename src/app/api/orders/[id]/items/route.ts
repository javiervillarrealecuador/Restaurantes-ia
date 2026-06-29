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
    const { kitchenId, status } = body;

    if (!kitchenId || !status) {
      return NextResponse.json({ error: 'kitchenId and status are required' }, { status: 400 });
    }

    const VALID_STATUSES = ['pending', 'preparing', 'ready'];
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
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

    // 3. Find items belonging to this kitchen
    const { data: orderItems, error: itemsErr } = await supabaseAdmin
      .from('order_items')
      .select('id, status, menu_items(kitchen_id)')
      .eq('order_id', orderId);

    if (itemsErr || !orderItems) {
      return NextResponse.json({ error: 'Failed to fetch order items' }, { status: 500 });
    }

    const itemsToUpdate = orderItems.filter((item: any) => 
      item.menu_items && item.menu_items.kitchen_id === kitchenId
    );

    if (itemsToUpdate.length === 0) {
      return NextResponse.json({ success: true, message: 'No items for this kitchen' });
    }

    const itemIds = itemsToUpdate.map((item: any) => item.id);

    // 4. Update order_items status
    const { error: updateErr } = await supabaseAdmin
      .from('order_items')
      .update({ status })
      .in('id', itemIds);

    if (updateErr) {
      throw updateErr;
    }

    // 5. Check if all items for the order are now ready
    let allReady = true;
    for (const item of orderItems) {
      const isUpdatedItem = itemIds.includes(item.id);
      const itemStatus = isUpdatedItem ? status : (item.status || 'pending');
      if (itemStatus !== 'ready') {
        allReady = false;
        break;
      }
    }

    let globalStatusUpdated = false;

    // 6. If all items are ready, update the global order status if it's not already ready
    if (allReady && order.status !== 'ready' && order.status !== 'delivered' && order.status !== 'cancelled') {
      const { error: orderUpdateErr } = await supabaseAdmin
        .from('orders')
        .update({ status: 'ready', updated_at: new Date().toISOString() })
        .eq('id', orderId);
        
      if (orderUpdateErr) throw orderUpdateErr;
      globalStatusUpdated = true;
      order.status = 'ready'; // update local reference for notification
    } else if (!allReady && status === 'preparing' && (order.status === 'pending' || order.status === 'confirmed')) {
       // If at least one item is preparing, set order to preparing if it was pending
       const { error: orderUpdateErr } = await supabaseAdmin
        .from('orders')
        .update({ status: 'preparing', updated_at: new Date().toISOString() })
        .eq('id', orderId);
        
      if (orderUpdateErr) throw orderUpdateErr;
      order.status = 'preparing';
    }

    // 7. Send WhatsApp notification if global status changed to ready
    if (globalStatusUpdated && order.status === 'ready') {
      const { data: settings } = await supabaseAdmin
        .from('settings')
        .select('whatsapp_phone_number_id, whatsapp_access_token')
        .eq('restaurant_id', order.restaurant_id)
        .single();

      const phoneId = settings?.whatsapp_phone_number_id;
      const customToken = settings?.whatsapp_access_token;
      
      const clientName = order.customer_name || 'Cliente';
      const clientPhone = order.customer_phone;
      const orderCodeText = order.order_code ? ` *${formatOrderCode(order.order_code)}*` : ' de tu pedido';
      
      let notificationText = '';
      if (order.type === 'delivery') {
        notificationText = `¡Hola, ${clientName}! 🥡 Tu pedido${orderCodeText} ya está listo en la cocina del local y está siendo asignado a un repartidor. Te avisaremos apenas salga en camino.`;
      } else if (order.type === 'pickup') {
        notificationText = `🥡 ¡Hola, ${clientName}! Tu pedido${orderCodeText} ya está listo para retirar en el local. ¡Te esperamos!`;
      } else if (order.type === 'dine_in') {
        notificationText = `🍽️ ¡Hola, ${clientName}! Tu pedido${orderCodeText} está listo y va camino a tu Mesa ${order.table_number || 'indicada'}. ¡Buen provecho!`;
      }

      if (notificationText && clientPhone && phoneId) {
        try {
          await sendWhatsAppMessage(clientPhone, notificationText, phoneId, customToken);
        } catch (waErr) {
          console.error('WhatsApp notification failed (order items updated successfully):', waErr);
        }
      }
    }

    return NextResponse.json({ success: true, allReady, globalStatusUpdated });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error updating order items status in API:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
