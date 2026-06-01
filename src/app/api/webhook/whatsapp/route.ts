import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

interface ParsedOrderItem {
  product_id: string;
  quantity: number;
  notes: string | null;
}

interface ParsedOrder {
  items: ParsedOrderItem[];
  order_type: 'dine_in' | 'delivery' | 'pickup';
  delivery_address: string | null;
  table_number: string | null;
  notes: string | null;
}

interface DBMenuItem {
  id: string;
  name: string;
  price: number;
  description: string | null;
  code?: string | null;
  category_name?: string | null;
}

// GET: WhatsApp Webhook Verification (Meta Verification Challenge)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'mi_token_de_verificacion_prueba_123';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WhatsApp Webhook verified successfully!');
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  console.error('WhatsApp Webhook verification failed. Tokens mismatch.');
  return new NextResponse('Forbidden', { status: 403 });
}

// POST: Handle Incoming WhatsApp Messages
export async function POST(req: NextRequest) {
  let webhookLogId: string | null = null;
  let restaurantId: string | null = null;

  try {
    const payload = await req.json();
    console.log('Incoming WhatsApp Payload:', JSON.stringify(payload, null, 2));

    // 1. Extract message details from WhatsApp payload
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    // If there is no message or not text/image type, ignore
    if (!message || (message.type !== 'text' && message.type !== 'image')) {
      return NextResponse.json({ status: 'ignored', message: 'No text or image message found.' });
    }

    const whatsappMsgId = message.id; // Extract WhatsApp message UUID

    // Check message idempotency (duplicate prevention)
    if (whatsappMsgId) {
      const { data: existingLog, error: logError } = await supabaseAdmin
        .from('whatsapp_webhook_logs')
        .select('id, status')
        .eq('whatsapp_message_id', whatsappMsgId)
        .limit(1);

      if (logError) {
        console.error('Error checking duplicate message:', logError);
      }

      if (existingLog && existingLog.length > 0) {
        console.log(`Duplicate WhatsApp message ID ignored: ${whatsappMsgId}`);
        return NextResponse.json({ status: 'duplicate_ignored', log_id: existingLog[0].id });
      }
    }

    const customerPhone = message.from;
    const customerName = value?.contacts?.[0]?.profile?.name || 'Cliente WhatsApp';
    const whatsappPhoneId = value?.metadata?.phone_number_id || 'default_phone_id';

    // 2. Fetch or create a restaurant in a multi-tenant fashion
    const { data: settingsData } = await supabaseAdmin
      .from('settings')
      .select('restaurant_id')
      .eq('whatsapp_phone_number_id', whatsappPhoneId)
      .limit(1);

    if (settingsData && settingsData.length > 0) {
      restaurantId = settingsData[0].restaurant_id;
    } else {
      const restaurant = await getOrCreateRestaurant();
      restaurantId = restaurant.id;
    }

    // 3. Conversational Logic: Check if customer has a pending order waiting for details
    const { data: pendingOrders } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('customer_phone', customerPhone)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    const activePendingOrder = pendingOrders?.[0] || null;

    if (activePendingOrder) {
      // Case A: Customer sent an image (Payment receipt upload)
      if (message.type === 'image') {
        if (activePendingOrder.payment_method === 'transfer' && !activePendingOrder.payment_receipt_url) {
          const mockReceiptUrl = 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600';
          const { error: updateErr } = await supabaseAdmin
            .from('orders')
            .update({ payment_receipt_url: mockReceiptUrl })
            .eq('id', activePendingOrder.id);

          if (updateErr) throw updateErr;

          await supabaseAdmin.from('whatsapp_webhook_logs').insert({
            whatsapp_message_id: whatsappMsgId,
            restaurant_id: restaurantId,
            sender_phone: customerPhone,
            message_body: '[Imagen de Comprobante]',
            raw_payload: payload,
            status: 'receipt_uploaded',
          });

          const orderCodeText = activePendingOrder.order_code ? ` para el pedido *${activePendingOrder.order_code}*` : '';
          const replyMsg = `¡Comprobante de pago recibido con éxito! 📄✨\n\nEl administrador verificará tu depósito${orderCodeText} por un valor total de *Monto: $${Number(activePendingOrder.total_price).toFixed(2)}*. Una vez confirmado el pago, el pedido ingresará a la cocina y empezaremos a prepararlo. ¡Te avisaremos cuando el repartidor vaya en camino!`;
          await sendWhatsAppMessage(customerPhone, replyMsg, whatsappPhoneId);

          return NextResponse.json({ success: true, status: 'receipt_uploaded', reply_message: replyMsg });
        } else {
          const replyMsg = `Recibimos tu imagen, pero en este momento no tenemos ningún pedido pendiente esperando comprobante. Si deseas realizar un pedido, por favor escríbelo en texto.`;
          await sendWhatsAppMessage(customerPhone, replyMsg, whatsappPhoneId);
          return NextResponse.json({ status: 'ignored_image', reply_message: replyMsg });
        }
      }

      // Case B: Customer sent text and order is waiting for payment choice
      if (message.type === 'text' && activePendingOrder.payment_method === 'undecided') {
        const textLower = message.text.body.trim().toLowerCase();

        if (textLower === '1' || textLower.includes('efectivo') || textLower.includes('recibir')) {
          const { error: updateErr } = await supabaseAdmin
            .from('orders')
            .update({ payment_method: 'cash' })
            .eq('id', activePendingOrder.id);

          if (updateErr) throw updateErr;

          await supabaseAdmin.from('whatsapp_webhook_logs').insert({
            whatsapp_message_id: whatsappMsgId,
            restaurant_id: restaurantId,
            sender_phone: customerPhone,
            message_body: `Seleccionó Efectivo: ${message.text.body}`,
            raw_payload: payload,
            status: 'payment_method_selected',
          });

          const orderCodeText = activePendingOrder.order_code ? ` *${activePendingOrder.order_code}*` : 'tu pedido';
          const replyMsg = `¡Perfecto! Has seleccionado pago en **Efectivo al recibir** 💵. Hemos enviado el pedido${orderCodeText} al administrador para su confirmación. En cuanto aprueben tu pedido, empezaremos a cocinarlo en cocina y te notificaremos.`;
          await sendWhatsAppMessage(customerPhone, replyMsg, whatsappPhoneId);

          return NextResponse.json({ success: true, status: 'payment_method_selected_cash', reply_message: replyMsg });
        } else if (textLower === '2' || textLower.includes('transfer') || textLower.includes('banco') || textLower.includes('deposito')) {
          const { error: updateErr } = await supabaseAdmin
            .from('orders')
            .update({ payment_method: 'transfer' })
            .eq('id', activePendingOrder.id);

          if (updateErr) throw updateErr;

          await supabaseAdmin.from('whatsapp_webhook_logs').insert({
            whatsapp_message_id: whatsappMsgId,
            restaurant_id: restaurantId,
            sender_phone: customerPhone,
            message_body: `Seleccionó Transferencia: ${message.text.body}`,
            raw_payload: payload,
            status: 'payment_method_selected',
          });

          const orderCodeText2 = activePendingOrder.order_code ? ` para el pedido *${activePendingOrder.order_code}*` : '';
          const replyMsg = `Has seleccionado **Transferencia Bancaria** 🏦.\n\nPor favor realiza el depósito o transferencia${orderCodeText2} a:\n- *Banco Pichincha*\n- *Cuenta Ahorros: 123456789*\n- *Titular: Restaurante Sabor Latino*\n- *Monto Total: $${Number(activePendingOrder.total_price).toFixed(2)}*\n\nUna vez realizada, *envíanos la captura o foto del comprobante* por este medio. ¡Empezaremos a preparar tu comida en cuanto confirmemos el pago!`;
          await sendWhatsAppMessage(customerPhone, replyMsg, whatsappPhoneId);

          return NextResponse.json({ success: true, status: 'payment_method_selected_transfer', reply_message: replyMsg });
        } else {
          const replyMsg = `Por favor, selecciona tu método de pago respondiendo con el número correspondiente:\n\n1️⃣ **Efectivo al recibir** (pagas al llegar)\n2️⃣ **Transferencia bancaria** (pagas antes de cocinar)\n\nResponde únicamente con el número *1* o *2*.`;
          await sendWhatsAppMessage(customerPhone, replyMsg, whatsappPhoneId);
          return NextResponse.json({ status: 'awaiting_payment_choice', reply_message: replyMsg });
        }
      }

      // Case C: Customer sent text but order is already waiting for receipt image
      if (message.type === 'text' && activePendingOrder.payment_method === 'transfer' && !activePendingOrder.payment_receipt_url) {
        const orderCodeText = activePendingOrder.order_code ? ` del pedido *${activePendingOrder.order_code}*` : '';
        const replyMsg = `Aún estamos esperando que nos envíes la captura o foto del comprobante de transferencia bancaria${orderCodeText} por un total de *$${Number(activePendingOrder.total_price).toFixed(2)}* para poder confirmar el pedido y enviarlo a cocina. Por favor, envíanos la imagen.`;
        await sendWhatsAppMessage(customerPhone, replyMsg, whatsappPhoneId);
        return NextResponse.json({ status: 'awaiting_receipt_image', reply_message: replyMsg });
      }
    }

    // If customer sent an image but has no pending order, ignore it
    if (message.type !== 'text') {
      return NextResponse.json({ status: 'ignored', message: 'No new text order message found.' });
    }

    const customerMessage = message.text.body;

    // 4. Create initial log record in Supabase (status = 'received')
    const { data: logData } = await supabaseAdmin
      .from('whatsapp_webhook_logs')
      .insert({
        whatsapp_message_id: whatsappMsgId,
        restaurant_id: restaurantId,
        sender_phone: customerPhone,
        message_body: customerMessage,
        raw_payload: payload,
        status: 'received',
      })
      .select('id')
      .single();

    if (logData) webhookLogId = logData.id;

    // Check if the message is a driver update command: "entregado [código]" or "completado [código]"
    const textTrim = customerMessage.trim().toLowerCase();
    if (textTrim.startsWith('entregado ') || textTrim.startsWith('completado ')) {
      const commandLength = textTrim.startsWith('entregado ') ? 10 : 11;
      const orderCodeInput = customerMessage.substring(commandLength).trim();

      console.log(`Driver command received. Trying to complete order with code: "${orderCodeInput}"`);

      // Search for the order in the database
      const { data: orderToDeliver, error: findError } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('order_code', orderCodeInput)
        .limit(1);

      if (findError) {
        console.error('Error finding order for driver command:', findError);
      }

      if (orderToDeliver && orderToDeliver.length > 0) {
        const targetOrder = orderToDeliver[0];

        // Update status to delivered and mark as paid
        const { error: updateError } = await supabaseAdmin
          .from('orders')
          .update({
            status: 'delivered',
            is_paid: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', targetOrder.id);

        if (updateError) throw updateError;

        // Log this action
        if (webhookLogId) {
          await supabaseAdmin
            .from('whatsapp_webhook_logs')
            .update({
              status: 'order_delivered_by_driver',
              message_body: `Comando repartidor: ${customerMessage}`
            })
            .eq('id', webhookLogId);
        }

        // 1. Notify the customer
        const clientPhone = targetOrder.customer_phone;
        const clientName = targetOrder.customer_name || 'Cliente';
        const orderCodeText = targetOrder.order_code ? ` *${targetOrder.order_code}*` : '';
        const customerMsg = `¡Hola, ${clientName}! ✨ Tu pedido${orderCodeText} ha sido entregado en tu domicilio. ¡Muchas gracias por tu compra! ❤️🍽️`;
        await sendWhatsAppMessage(clientPhone, customerMsg, whatsappPhoneId);

        // 2. Reply to the driver
        const driverReply = `✅ ¡Entendido! El pedido *${orderCodeInput}* ha sido marcado como ENTREGADO y PAGADO en el sistema. Gracias por tu reporte. 🛵💨`;
        await sendWhatsAppMessage(customerPhone, driverReply, whatsappPhoneId);

        return NextResponse.json({
          success: true,
          status: 'order_delivered_by_driver',
          message: `Order ${orderCodeInput} delivered by driver.`,
          reply_message: driverReply
        });
      } else {
        // Log failure
        if (webhookLogId) {
          await supabaseAdmin
            .from('whatsapp_webhook_logs')
            .update({
              status: 'failed',
              error_message: `Driver command failed: Order code "${orderCodeInput}" not found.`
            })
            .eq('id', webhookLogId);
        }

        const driverReply = `❌ No encontramos ningún pedido con el código *${orderCodeInput}*. Por favor, verifica el código e inténtalo de nuevo.`;
        await sendWhatsAppMessage(customerPhone, driverReply, whatsappPhoneId);

        return NextResponse.json({
          status: 'invalid_driver_command',
          message: `Order code ${orderCodeInput} not found.`,
          reply_message: driverReply
        });
      }
    }

    // 5. Fetch available menu items for this restaurant (including category name)
    const { data: menuItemsData, error: menuError } = await supabaseAdmin
      .from('menu_items')
      .select(`
        id,
        name,
        price,
        description,
        code,
        menu_categories!inner (
          id,
          name,
          restaurant_id,
          is_active
        )
      `)
      .eq('menu_categories.restaurant_id', restaurantId)
      .eq('menu_categories.is_active', true)
      .eq('is_available', true);

    if (menuError) throw menuError;

    if (!menuItemsData || menuItemsData.length === 0) {
      throw new Error('No available menu items found for this restaurant.');
    }

    // Flatten category name into each item
    const menuItems: DBMenuItem[] = (menuItemsData as unknown as Array<{
      id: string;
      name: string;
      price: number;
      description: string | null;
      code?: string | null;
      menu_categories: { id: string; name: string; restaurant_id: string; is_active: boolean };
    }>).map((row) => ({
      id: row.id,
      name: row.name,
      price: row.price,
      description: row.description,
      code: row.code,
      category_name: row.menu_categories?.name || null,
    }));

    // 5b. Run the unified AI Agent (handles ALL message types in one Gemini call)
    const geminiKey = process.env.GEMINI_API_KEY || '';
    let agentResult: AgentResult;

    if (!geminiKey || geminiKey === 'tu_api_key_de_gemini') {
      console.warn('Gemini API key not configured. Using fallback agent.');
      agentResult = runFallbackAgent(customerMessage, customerName, menuItems);
    } else {
      try {
        agentResult = await runAIAgent(customerMessage, customerName, menuItems, geminiKey);
      } catch (agentError: unknown) {
        const agentErr = agentError as Error;
        console.error('AI Agent failed, using fallback:', agentErr);
        agentResult = runFallbackAgent(customerMessage, customerName, menuItems);
      }
    }

    // If the agent decided this is NOT an order, just reply and exit
    if (agentResult.intent !== 'order' || !agentResult.order || agentResult.order.items.length === 0) {
      await sendWhatsAppMessage(customerPhone, agentResult.human_response, whatsappPhoneId);

      if (webhookLogId) {
        await supabaseAdmin
          .from('whatsapp_webhook_logs')
          .update({ status: 'info_query_answered', ai_parsed_response: agentResult })
          .eq('id', webhookLogId);
      }

      return NextResponse.json({
        status: agentResult.intent === 'order' ? 'parsed_empty' : 'info_query_answered',
        intent: agentResult.intent,
        message: 'Agent response sent.',
        reply_message: agentResult.human_response,
      });
    }

    const parsedOrder = agentResult.order;

    // 7. Create the Order in Supabase
    let subtotal = 0;
    const orderItemsToInsert: {
      menu_item_id: string;
      quantity: number;
      unit_price: number;
      notes: string | null;
    }[] = [];
    const itemsDetailForMessage: string[] = [];

    for (const parsedItem of parsedOrder.items) {
      const dbItem = menuItems.find((item) => item.id === parsedItem.product_id);
      if (dbItem) {
        const itemPrice = Number(dbItem.price);
        const itemSubtotal = parsedItem.quantity * itemPrice;
        subtotal += itemSubtotal;

        orderItemsToInsert.push({
          menu_item_id: dbItem.id,
          quantity: parsedItem.quantity,
          unit_price: itemPrice,
          notes: parsedItem.notes || null,
        });

        itemsDetailForMessage.push(
          `- ${parsedItem.quantity}x ${dbItem.name} (${parsedItem.notes ? `Nota: ${parsedItem.notes}` : 'Sin notas'})`
        );
      }
    }

    const taxRate = 0.10;
    const tax = Number((subtotal * taxRate).toFixed(2));
    const deliveryFee = parsedOrder.order_type === 'delivery' ? 2.50 : 0.00;
    const total = Number((subtotal + tax + deliveryFee).toFixed(2));

    const isDelivery = parsedOrder.order_type === 'delivery';

    // Insert Order Parent (with undecided payment method for delivery, or cash for dine_in/pickup)
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        restaurant_id: restaurantId,
        status: 'pending',
        type: parsedOrder.order_type || 'pickup',
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_address: parsedOrder.delivery_address || null,
        table_number: parsedOrder.table_number || null,
        notes: parsedOrder.notes || null,
        subtotal,
        tax,
        delivery_fee: deliveryFee,
        total_price: total,
        payment_method: isDelivery ? 'undecided' : 'cash',
        is_paid: false,
      })
      .select('id, order_code')
      .single();

    if (orderError) throw orderError;

    // Insert Order Line Items
    const itemsWithOrderId = orderItemsToInsert.map((item) => ({
      ...item,
      order_id: order.id,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(itemsWithOrderId);

    if (itemsError) throw itemsError;

    // 8. Update Webhook Log Status
    if (webhookLogId) {
      await supabaseAdmin
        .from('whatsapp_webhook_logs')
        .update({
          status: 'order_created',
          ai_parsed_response: parsedOrder,
        })
        .eq('id', webhookLogId);
    }

    // 9. Generate and send confirmation WhatsApp message
    // Use the AI agent's pre-generated response as base, then append the order summary
    let confirmationMessage = '';
    const orderCodeStr = order?.order_code ? `*Código de Pedido:* ${order.order_code}\n\n` : '';

    if (isDelivery) {
      confirmationMessage = `¡Gracias, ${customerName}! Hemos registrado tu pedido a domicilio con éxito. 🛵📋\n\n${orderCodeStr}*Detalle del pedido:*\n${itemsDetailForMessage.join('\n')}\n\n*Resumen financiero:*\n- Subtotal: $${subtotal.toFixed(2)}\n- IVA (10%): $${tax.toFixed(2)}\n- Costo Envío: $${deliveryFee.toFixed(2)}\n*Total a Pagar: $${total.toFixed(2)}*\n\n*Dirección de entrega:* ${parsedOrder.delivery_address || 'Por confirmar'}\n\nPor favor, responde indicando tu método de pago con el número correspondiente:\n\n1️⃣ **Efectivo al recibir** (pagas al motorizado en casa)\n2️⃣ **Transferencia bancaria** (pagas antes de que cocinemos)\n\nResponde con *1* o *2* para continuar.`;
    } else {
      const orderTypeLabel =
        parsedOrder.order_type === 'dine_in'
          ? `Consumo en Mesa (Mesa ${parsedOrder.table_number})`
          : 'Retiro en Local (Takeaway)';

      confirmationMessage = `¡Gracias, ${customerName}! Hemos registrado tu pedido con éxito. 📝🍽\n\n${orderCodeStr}*Detalle del pedido:*\n${itemsDetailForMessage.join('\n')}\n\n*Resumen financiero:*\n- Subtotal: $${subtotal.toFixed(2)}\n- IVA (10%): $${tax.toFixed(2)}\n*Total a Pagar: $${total.toFixed(2)}*\n\n*Tipo de pedido:* ${orderTypeLabel}\n*Estado:* Pendiente de Aceptación por el Restaurante\n\nTu pedido está siendo procesado en cocina. Te notificaremos por aquí cuando cambie su estado. ¡Buen provecho!`;
    }

    await sendWhatsAppMessage(customerPhone, confirmationMessage, whatsappPhoneId);

    return NextResponse.json({
      success: true,
      order_id: order.id,
      status: 'order_created',
      message: 'Order created, awaiting payment selection if delivery.',
      reply_message: confirmationMessage
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Fatal Webhook Error:', err);

    // Attempt to log error in database
    if (webhookLogId) {
      await supabaseAdmin
        .from('whatsapp_webhook_logs')
        .update({
          status: 'failed',
          error_message: err.message || 'Unknown server error',
        })
        .eq('id', webhookLogId);
    }

    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// ----------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------

// Self-bootstrapping helper: retrieves or inserts a default restaurant structure
async function getOrCreateRestaurant() {
  const { data: restaurantList } = await supabaseAdmin
    .from('restaurants')
    .select('*')
    .limit(1);

  if (restaurantList && restaurantList.length > 0) {
    return restaurantList[0];
  }

  // Create default restaurant
  const { data: newRest, error: restErr } = await supabaseAdmin
    .from('restaurants')
    .insert({
      name: 'Restaurante Sabor Latino',
      slug: 'sabor-latino',
      address: 'Av. de la República N32-123 y Eloy Alfaro',
      phone: '+593987654321',
      email: 'sabor@latino.com',
    })
    .select()
    .single();

  if (restErr) throw restErr;

  // Insert default setting
  await supabaseAdmin.from('settings').insert({
    restaurant_id: newRest.id,
    whatsapp_phone_number_id: '123456789012345',
    whatsapp_verify_token: 'mi_token_de_verificacion_prueba_123',
    is_ordering_enabled: true,
  });

  // Create default category
  const { data: category, error: catErr } = await supabaseAdmin
    .from('menu_categories')
    .insert({
      restaurant_id: newRest.id,
      name: 'Especialidades',
      sort_order: 1,
      is_active: true,
    })
    .select()
    .single();

  if (catErr) throw catErr;

  // Insert default available menu items
  await supabaseAdmin.from('menu_items').insert([
    {
      category_id: category.id,
      name: 'Cazuela de Ave',
      description: 'Tradicional cazuela chilena con pollo tierno, choclo, zapallo y arroz.',
      price: 8.50,
      is_available: true,
      estimated_prep_time: 20,
    },
    {
      category_id: category.id,
      name: 'Cazuela de Vacuno',
      description: 'Nutritiva cazuela con carne de vacuno, verduras selectas y condimento tradicional.',
      price: 9.50,
      is_available: true,
      estimated_prep_time: 20,
    },
    {
      category_id: category.id,
      name: 'Fanta Orange',
      description: 'Bebida fanta sabor naranja en lata de 350ml.',
      price: 1.50,
      is_available: true,
      estimated_prep_time: 2,
    },
    {
      category_id: category.id,
      name: 'Coca-Cola Original',
      description: 'Refresco sabor original en lata de 350ml.',
      price: 1.50,
      is_available: true,
      estimated_prep_time: 2,
    },
  ]);

  return newRest;
}

// =======================================================================
// 🤖 APPY — UNIFIED AI AGENT
// One Gemini call handles EVERYTHING: intent, conversation, order parsing
// =======================================================================

interface AgentResult {
  intent: 'order' | 'menu_query' | 'full_menu' | 'greeting' | 'other';
  human_response: string;  // The natural language message to send the customer
  order: ParsedOrder | null;  // Structured order data, only when intent === 'order'
}

async function runAIAgent(
  message: string,
  customerName: string,
  menuItems: DBMenuItem[],
  apiKey: string
): Promise<AgentResult> {
  // Build menu context grouped by category
  const grouped: Record<string, DBMenuItem[]> = {};
  for (const item of menuItems) {
    const cat = item.category_name || 'General';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  const menuContext = Object.entries(grouped)
    .map(([cat, items]) => {
      const rows = items.map(
        (i) => `    - ID:"${i.id}" | Código:"${i.code || ''}" | Nombre:"${i.name}" | Precio:$${i.price} | Desc:"${i.description || ''}"`,
      );
      return `  📂 ${cat}:\n${rows.join('\n')}`;
    })
    .join('\n\n');

  // Categoría names for menu display formatting
  const categoryNames = Object.keys(grouped);

  const systemPrompt = `Eres *Appy*, el asistente virtual inteligente de un restaurante latinoamericano. 
Eres amable, cálido, eficiente y conoces el menú a la perfección.
Atiendes clientes por WhatsApp en español latinoamericano.
Usas emojis con moderación y formato de WhatsApp (*negrita*, _cursiva_).
Nunca inventas platos que no estén en el menú.

=== MENÚ DEL RESTAURANTE ===
${menuContext}
=== FIN DEL MENÚ ===

CATEGORÍAS DISPONIBLES: ${categoryNames.join(', ')}

NOMBRE DEL CLIENTE: ${customerName}`;

  const userPrompt = `MENSAJE DEL CLIENTE: "${message}"

Analiza el mensaje y responde ÚNICAMENTE con un JSON con esta estructura exacta (sin bloques de código, sin texto extra):

{
  "intent": "order" | "menu_query" | "full_menu" | "greeting" | "other",
  "human_response": "Tu respuesta completa y natural para enviar al cliente por WhatsApp",
  "order": {
    "items": [
      { "product_id": "UUID exacto del menú", "quantity": 1, "notes": null }
    ],
    "order_type": "pickup" | "delivery" | "dine_in",
    "delivery_address": null,
    "table_number": null,
    "notes": null
  } | null
}

REGLAS CRÍTICAS:

1. INTENTS:
   - "greeting": Solo saluda sin pedir nada → human_response amistoso de bienvenida, order=null
   - "full_menu": Pide ver TODO el menú → human_response con el menú completo bien formateado con categorías, precios y códigos, order=null
   - "menu_query": Pregunta por UNA categoría específica → human_response con solo esa categoría formateada, order=null
   - "order": Quiere PEDIR algo → human_response de confirmación del pedido, order con los datos estructurados
   - "other": Otra cosa (reclamo, horario, etc.) → human_response empático y útil, order=null

2. Para "order":
   - Solo incluye products cuyo ID exista exactamente en el menú
   - El cliente puede pedir por nombre O por código numérico (ej: "dame un 24" = item con Código:"24")
   - Si no especifica tipo, asume pickup
   - El human_response debe CONFIRMAR el pedido con emojis, detalles y total estimado

3. Para "full_menu" o "menu_query":
   - Formatea el human_response con categorías en negrita, bullet points, nombre, código y precio
   - Termina siempre invitando a hacer el pedido

4. Sé conversacional y natural. Nunca respondas como un robot.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Entendido. Soy Appy y estoy listo para atender al cliente.' }] },
        { role: 'user', parts: [{ text: userPrompt }] },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.4,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini Agent API error: ${response.status} — ${errText}`);
  }

  const resJson = await response.json();
  const raw = resJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!raw) throw new Error('Empty response from Gemini agent.');

  const result = JSON.parse(raw) as AgentResult;

  // Ensure order items is always an array
  if (result.order && !Array.isArray(result.order.items)) {
    result.order.items = [];
  }

  return result;
}

// =======================================================================
// 🔌 FALLBACK AGENT — Used when Gemini is unavailable
// =======================================================================
function runFallbackAgent(
  message: string,
  customerName: string,
  menuItems: DBMenuItem[]
): AgentResult {
  const msgLow = message.trim().toLowerCase();

  // Detect greeting
  const greetWords = ['hola', 'buenos', 'buenas', 'buen día', 'buen dia', 'holi', 'hey', 'hi', 'saludos'];
  if (greetWords.some((g) => msgLow.startsWith(g)) && msgLow.length < 30) {
    return {
      intent: 'greeting',
      human_response: `¡Hola, ${customerName}! 👋 Bienvenido/a. Escribe *menú* para ver nuestros platos o dinos directamente qué deseas ordenar. ¿En qué te podemos ayudar? 😊`,
      order: null,
    };
  }

  // Detect full menu or category query
  const categories = Array.from(new Set(menuItems.map((m) => m.category_name?.toLowerCase()).filter(Boolean))) as string[];
  const menuWords = ['menú', 'menu', 'carta', 'opciones', 'platos', 'qué tienen', 'que tienen'];
  const queryWords = ['tienes', 'tienen', 'hay', 'muéstrame', 'muestrame', 'lista', 'qué', 'que', 'ver', 'opciones'];

  for (const cat of categories) {
    if (msgLow.includes(cat) && queryWords.some((w) => msgLow.includes(w))) {
      const filtered = menuItems.filter((m) => m.category_name?.toLowerCase() === cat);
      const lines = [`¡Claro, ${customerName}! Aquí tienes nuestra sección de *${cat.toUpperCase()}*: 🍽️\n`];
      filtered.forEach((i) => {
        const code = i.code ? ` _(Cód: ${i.code})_` : '';
        lines.push(`  • ${i.name}${code} — *$${Number(i.price).toFixed(2)}*`);
        if (i.description) lines.push(`    _${i.description}_`);
      });
      lines.push('\nEscríbenos qué deseas ordenar. 🛒');
      return { intent: 'menu_query', human_response: lines.join('\n'), order: null };
    }
  }

  if (menuWords.some((w) => msgLow.includes(w)) && !msgLow.includes('quiero') && !msgLow.includes('pedir')) {
    const grouped: Record<string, DBMenuItem[]> = {};
    for (const item of menuItems) {
      const cat = item.category_name || 'General';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    }
    const lines = [`¡Aquí está nuestro menú completo, ${customerName}! 🍽️\n`];
    for (const [cat, items] of Object.entries(grouped)) {
      lines.push(`*📂 ${cat.toUpperCase()}*`);
      items.forEach((i) => {
        const code = i.code ? ` _(Cód: ${i.code})_` : '';
        lines.push(`  • ${i.name}${code} — *$${Number(i.price).toFixed(2)}*`);
      });
      lines.push('');
    }
    lines.push('Para pedir, escríbenos qué deseas. 🛒');
    return { intent: 'full_menu', human_response: lines.join('\n'), order: null };
  }

  // Try to parse as an order using the old fallback parser
  const parsedOrder = runFallbackParser(message, menuItems);
  if (parsedOrder.items.length > 0) {
    return {
      intent: 'order',
      human_response: `¡Pedido recibido, ${customerName}! ✅ Estamos procesando tu orden. Te confirmamos en breve.`,
      order: parsedOrder,
    };
  }

  return {
    intent: 'other',
    human_response: `¡Hola, ${customerName}! 😊 Gracias por escribirnos. Por el momento puedo ayudarte a ver el *menú* o tomar tu *pedido*. ¿En qué te puedo ayudar?`,
    order: null,
  };
}

// parseOrderWithGemini was replaced by the unified runAIAgent function above.

// Fallback Natural Language Parser in case Gemini is offline or API key is not configured
function runFallbackParser(message: string, menuItems: DBMenuItem[]): ParsedOrder {
  console.log('Running Fallback NLP Parser...');
  const msgLower = message.toLowerCase();
  const parsedItems: ParsedOrderItem[] = [];

  for (const item of menuItems) {
    const itemName = item.name.toLowerCase();
    const itemCode = item.code?.toLowerCase();
    
    let isMatched = false;
    
    // Match by code first
    if (itemCode && (
      msgLower === itemCode ||
      msgLower.includes(` ${itemCode} `) ||
      msgLower.startsWith(`${itemCode} `) ||
      msgLower.endsWith(` ${itemCode}`) ||
      msgLower.includes(`plato ${itemCode}`) ||
      msgLower.includes(`codigo ${itemCode}`) ||
      msgLower.includes(`código ${itemCode}`)
    )) {
      isMatched = true;
    } else if (msgLower.includes(itemName)) {
      isMatched = true;
    } else if (itemName.includes('cazuela de ave') && (msgLower.includes('cazuela ave') || (msgLower.includes('cazuela') && msgLower.includes('ave')))) {
      isMatched = true;
    } else if (itemName.includes('cazuela de vacuno') && (msgLower.includes('cazuela vacuno') || (msgLower.includes('cazuela') && msgLower.includes('vacuno')))) {
      isMatched = true;
    } else if (itemName.includes('cazuela') && msgLower.includes('cazuela') && !msgLower.includes('vacuno') && !msgLower.includes('ave')) {
      // Default to Cazuela de Ave if they just say "cazuela" and it's the first in loop
      if (item.name === 'Cazuela de Ave') isMatched = true;
    } else if (itemName.includes('fanta') && msgLower.includes('fanta')) {
      isMatched = true;
    } else if (itemName.includes('coca-cola') && (msgLower.includes('coca cola') || msgLower.includes('cocacola') || msgLower.includes('coke'))) {
      isMatched = true;
    }

    if (isMatched) {
      // Basic quantity extraction matching common spanish word representations
      let quantity = 1;
      const match = msgLower.match(new RegExp(`(\\d+|un|una|dos|tres|cuatro|cinco)\\s+${itemName.substring(0, 5)}`));
      if (match) {
        const qtyStr = match[1];
        if (qtyStr === 'dos') quantity = 2;
        else if (qtyStr === 'tres') quantity = 3;
        else if (qtyStr === 'cuatro') quantity = 4;
        else if (qtyStr === 'cinco') quantity = 5;
        else if (qtyStr === 'una' || qtyStr === 'un') quantity = 1;
        else quantity = parseInt(qtyStr, 10) || 1;
      } else {
        // Look for digit after name (e.g. "cazuela x2")
        const matchAfter = msgLower.match(new RegExp(`${itemName.substring(0, 5)}[^\\d]*(\\d+)`));
        if (matchAfter) {
          quantity = parseInt(matchAfter[1], 10) || 1;
        }
      }

      // Notes extraction
      let notes: string | null = null;
      if (msgLower.includes('sin sal')) {
        notes = 'sin sal';
      } else if (msgLower.includes('con hielo')) {
        notes = 'con hielo';
      } else if (msgLower.includes('sin cebolla')) {
        notes = 'sin cebolla';
      }

      parsedItems.push({
        product_id: item.id,
        quantity,
        notes,
      });
    }
  }

  // Determine order type
  let orderType: 'dine_in' | 'delivery' | 'pickup' = 'pickup';
  let tableNumber: string | null = null;
  let deliveryAddress: string | null = null;

  if (msgLower.includes('mesa')) {
    orderType = 'dine_in';
    const tableMatch = msgLower.match(/mesa\s*(\d+)/);
    tableNumber = tableMatch ? tableMatch[1] : '1';
  } else if (
    msgLower.includes('domicilio') ||
    msgLower.includes('envio') ||
    msgLower.includes('enviar') ||
    msgLower.includes('dirección') ||
    msgLower.includes('direccion')
  ) {
    orderType = 'delivery';
    // Mock address extraction if they mention a direction
    const addrMatch = message.match(/(?:direccion|dirección|en|calle)\s*[:=]?\s*([^,.\n]+)/i);
    deliveryAddress = addrMatch ? addrMatch[1].trim() : 'Dirección indicada por el cliente';
  }

  return {
    items: parsedItems,
    order_type: orderType,
    delivery_address: deliveryAddress,
    table_number: tableNumber,
    notes: null,
  };
}

