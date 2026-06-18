import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendWhatsAppMessage, sendWhatsAppTypingIndicator } from '@/lib/whatsapp';

interface ParsedOrderItem {
  product_id: string;
  quantity: number;
  notes: string | null;
  modifiers?: { name: string; price: number }[] | null;
}

interface ParsedOrder {
  items: ParsedOrderItem[];
  order_type: 'dine_in' | 'delivery' | 'pickup';
  delivery_address: string | null;
  table_number: string | null;
  payment_method: 'cash' | 'transfer' | null;
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

// Helper function to format order_code from YYYYMMDDXXXXX to YYYY-MM-DD-XXXXX
function formatOrderCode(code: string | null): string {
  if (!code) return '';
  // Extract the 13-digit numeric part (e.g., from "Para llevar 2026060200016")
  const match = code.match(/(\d{13})/);
  if (!match) return code;
  
  const numCode = match[1];
  const year = numCode.slice(0, 4);
  const month = numCode.slice(4, 6);
  const day = numCode.slice(6, 8);
  const seq = numCode.slice(8);
  
  // Replace the 13-digit number in the original string with the formatted one
  return code.replace(numCode, `${year}-${month}-${day}-${seq}`);
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
  try {
    const payload = await req.json();
    console.log('Incoming WhatsApp Payload:', JSON.stringify(payload, null, 2));

    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message || (message.type !== 'text' && message.type !== 'image' && message.type !== 'location')) {
      return NextResponse.json({ status: 'ignored', message: 'No valid message type found.' });
    }

    const whatsappMsgId = message.id;

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

    // TRIGGER BACKGROUND PROCESSING TO PREVENT VERCEL TIMEOUTS
    waitUntil(
      processMessageInBackground(
        payload,
        message,
        whatsappMsgId,
        customerPhone,
        customerName,
        whatsappPhoneId
      ).catch((err) => {
        console.error('Background Webhook Processing Error:', err);
      })
    );

    // IMMEDIATELY RETURN 200 OK TO META
    return NextResponse.json({ status: 'processing_in_background' }, { status: 200 });

  } catch (error: any) {
    console.error('Critical Webhook Entry Error:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

async function processMessageInBackground(
  payload: any,
  message: any,
  whatsappMsgId: string,
  customerPhone: string,
  customerName: string,
  whatsappPhoneId: string
) {
  let webhookLogId: string | null = null;
  let restaurantId: string | null = null;
  let customAiPrompt: string | null = null;

  try {
    // Send typing indicator to let the user know we are processing
    if (whatsappMsgId) {
      await sendWhatsAppTypingIndicator(whatsappPhoneId, whatsappMsgId);
    }

    // 2. Fetch or create a restaurant in a multi-tenant fashion
    const { data: settingsData } = await supabaseAdmin
      .from('settings')
      .select('restaurant_id, ai_system_instruction')
      .eq('whatsapp_phone_number_id', whatsappPhoneId)
      .limit(1);

    if (settingsData && settingsData.length > 0) {
      restaurantId = settingsData[0].restaurant_id;
      customAiPrompt = settingsData[0].ai_system_instruction;
    } else {
      const restaurant = await getOrCreateRestaurant();
      restaurantId = restaurant.id;
    }

    // 2b. Check if the restaurant account is suspended
    const { data: restaurantObj } = await supabaseAdmin
      .from('restaurants')
      .select('status')
      .eq('id', restaurantId)
      .single();

    if (restaurantObj && restaurantObj.status === 'suspended') {
      const suspensionMsg = `Estimado cliente, los servicios de este asistente virtual se encuentran temporalmente suspendidos. Por favor, comuníquese directamente con el local para realizar su pedido o consulta. ¡Lamentamos los inconvenientes!`;
      await sendWhatsAppMessage(customerPhone, suspensionMsg, whatsappPhoneId);
      
      // Log this message as suspended
      if (whatsappMsgId) {
        await supabaseAdmin.from('whatsapp_webhook_logs').insert({
          whatsapp_message_id: whatsappMsgId,
          restaurant_id: restaurantId,
          sender_phone: customerPhone,
          message_body: message.type === 'text' ? message.text.body : `[Mensaje tipo: ${message.type}]`,
          raw_payload: payload,
          status: 'suspended_blocking_msg'
        });
      }
      return;
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
          let receiptUrl: string | null = null;
          
          try {
            const mediaId = message.image.id;
            const waToken = process.env.WHATSAPP_ACCESS_TOKEN;
            if (waToken && mediaId) {
              // 1. Get media URL from Meta
              const metaRes = await fetch(`https://graph.facebook.com/v17.0/${mediaId}`, {
                headers: { Authorization: `Bearer ${waToken}` }
              });
              const metaData = await metaRes.json();
              if (metaData.url) {
                // 2. Download actual media bytes
                const mediaRes = await fetch(metaData.url, {
                  headers: { Authorization: `Bearer ${waToken}` }
                });
                const blob = await mediaRes.blob();
                
                // 3. Upload to Supabase Storage
                const formattedCode = activePendingOrder.order_code ? formatOrderCode(activePendingOrder.order_code) : activePendingOrder.id.substring(0, 8);
                const fileName = `TR-${formattedCode}.jpg`;
                const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
                  .from('receipts')
                  .upload(fileName, blob, { contentType: blob.type, upsert: true });
                  
                if (!uploadErr && uploadData) {
                  const { data: publicUrlData } = supabaseAdmin.storage.from('receipts').getPublicUrl(fileName);
                  receiptUrl = publicUrlData.publicUrl;
                } else {
                  console.error('Receipt upload error:', uploadErr);
                }
              }
            }
          } catch (e) {
            console.error('Error processing WhatsApp image:', e);
          }

          if (!receiptUrl) {
            // Upload failed — ask customer to resend instead of storing fake data
            const retryMsg = `Lo sentimos, hubo un error al procesar tu comprobante. Por favor, envía la imagen nuevamente.`;
            await sendWhatsAppMessage(customerPhone, retryMsg, whatsappPhoneId);
            return;
          }

          const { error: updateErr } = await supabaseAdmin
            .from('orders')
            .update({ payment_receipt_url: receiptUrl })
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

          const orderCodeText = activePendingOrder.order_code ? ` para el pedido *${formatOrderCode(activePendingOrder.order_code)}*` : '';
          const replyMsg = `¡Comprobante de pago recibido con éxito! 📄✨\n\nEl administrador verificará tu depósito${orderCodeText} por un valor total de *Monto: $${Number(activePendingOrder.total_price).toFixed(2)}*. Una vez confirmado el pago, el pedido ingresará a la cocina y empezaremos a prepararlo. ¡Te avisaremos cuando el repartidor vaya en camino!`;
          await sendWhatsAppMessage(customerPhone, replyMsg, whatsappPhoneId);

          return NextResponse.json({ success: true, status: 'receipt_uploaded', reply_message: replyMsg });
        } else {
          const replyMsg = `Recibimos tu imagen, pero en este momento no tenemos ningún pedido pendiente esperando comprobante. Si deseas realizar un pedido, por favor escríbelo en texto.`;
          await sendWhatsAppMessage(customerPhone, replyMsg, whatsappPhoneId);
          return NextResponse.json({ status: 'ignored_image', reply_message: replyMsg });
        }
      }
      // Case C: Customer sent text but order is already waiting for receipt image
      if (message.type === 'text' && activePendingOrder.payment_method === 'transfer' && !activePendingOrder.payment_receipt_url) {
        const textBody = (message.text.body || '').trim().toLowerCase();
        
        // Check if customer wants to cancel/discard the order (avoiding 'cancelar' since it means 'to pay' locally)
        const cancellationKeywords = ['eliminar', 'descartar', 'borrar', 'delete', 'anular', 'descartar el pedido actual'];
        const wantsToCancel = cancellationKeywords.some(keyword => textBody.includes(keyword));
        
        if (wantsToCancel) {
          const { error: cancelErr } = await supabaseAdmin
            .from('orders')
            .update({ status: 'cancelled' })
            .eq('id', activePendingOrder.id);
            
          if (cancelErr) throw cancelErr;
          
          if (whatsappMsgId) {
            await supabaseAdmin.from('whatsapp_webhook_logs').insert({
              whatsapp_message_id: whatsappMsgId,
              restaurant_id: restaurantId,
              sender_phone: customerPhone,
              message_body: message.text.body,
              raw_payload: payload,
              status: 'order_cancelled_by_customer',
            });
          }
          
          const orderCodeText = activePendingOrder.order_code ? ` *${formatOrderCode(activePendingOrder.order_code)}*` : '';
          const replyMsg = `¡Entendido! Hemos descartado tu pedido pendiente${orderCodeText}. Si deseas iniciar un nuevo pedido, escríbeme lo que te gustaría ordenar y con gusto te ayudaré. 🍽️✨`;
          await sendWhatsAppMessage(customerPhone, replyMsg, whatsappPhoneId);
          return NextResponse.json({ status: 'order_cancelled', reply_message: replyMsg });
        }

        const orderCodeText = activePendingOrder.order_code ? ` del pedido *${formatOrderCode(activePendingOrder.order_code)}*` : '';
        const replyMsg = `Aún estamos esperando que nos envíes la captura o foto del comprobante de transferencia bancaria${orderCodeText} por un total de *$${Number(activePendingOrder.total_price).toFixed(2)}* para poder confirmar el pedido y enviarlo a cocina. Por favor, envíanos la imagen. PERO SI NO LO NECESITAS ESCRIBE EXACTAMENTE: DESCARTAR EL PEDIDO ACTUAL`;
        await sendWhatsAppMessage(customerPhone, replyMsg, whatsappPhoneId);
        return NextResponse.json({ status: 'awaiting_receipt_image', reply_message: replyMsg });
      }
    }

    // If customer sent an image but has no pending order, ignore it
    if (message.type !== 'text' && message.type !== 'location') {
      return NextResponse.json({ status: 'ignored', message: 'No new text or location order message found.' });
    }

    let customerMessage = '';
    if (message.type === 'location') {
      customerMessage = `[Ubicación Compartida: Latitud ${message.location.latitude}, Longitud ${message.location.longitude}${message.location.address ? ', Dirección: ' + message.location.address : ''}]`;
    } else {
      customerMessage = message.text.body;
    }

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
        const orderCodeText = targetOrder.order_code ? ` *${formatOrderCode(targetOrder.order_code)}*` : '';
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

    // Fetch modifiers from database
    const { data: dbModifiersData } = await supabaseAdmin
      .from('menu_modifiers')
      .select('*');
    const dbModifiers = dbModifiersData || [];

    // --- 4. CRM & RUN AI AGENT ---
    // Fetch customer CRM data
    const { data: customerData } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('phone', customerPhone)
      .maybeSingle();

    // Check if human handoff is active (bot paused)
    if (customerData && customerData.bot_active === false) {
      console.log(`Bot is paused for customer ${customerPhone}. Logging message and ignoring AI.`);
      if (webhookLogId) {
        await supabaseAdmin
          .from('whatsapp_webhook_logs')
          .update({ status: 'handoff_active_logged' })
          .eq('id', webhookLogId);
      }
      return NextResponse.json({ success: true, status: 'bot_paused_for_human_handoff' });
    }

    let crmContext = 'Este es un cliente nuevo. Dale una cálida bienvenida.';
    if (customerData) {
      crmContext = `Este es un cliente recurrente llamado ${customerData.name || customerName}. Ha realizado ${customerData.total_orders} pedidos en el pasado y ha gastado un total de $${customerData.total_spent}. ${customerData.preferences ? 'Preferencias: ' + customerData.preferences : ''}. Salúdalo de nuevo calurosamente (ej: "¡Hola de nuevo Juan!").`;
    }

    // Fetch conversation history and active cart
    const { data: logsData } = await supabaseAdmin
      .from('whatsapp_webhook_logs')
      .select('message_body, ai_parsed_response, created_at, status')
      .eq('sender_phone', customerPhone)
      .eq('restaurant_id', restaurantId) // Critical: isolate history by restaurant
      .order('created_at', { ascending: false })
      .limit(6);
      
    let historyContext = 'No hay mensajes previos.';
    let cartContext = 'El carrito está vacío.';
    
    if (logsData && logsData.length > 0) {
      // Find the index of the last confirmed order to cut off older history
      const lastOrderIndex = logsData.findIndex(l => 
        l.status === 'order_created' || 
        (l.ai_parsed_response && (l.ai_parsed_response as AgentResult).intent === 'confirm_order')
      );

      // Only keep messages after the last order
      const sessionLogs = lastOrderIndex >= 0 ? logsData.slice(0, lastOrderIndex) : logsData;

      const msgs = sessionLogs.reverse().map(l => `- Cliente: ${l.message_body}`);
      historyContext = msgs.join('\n');
      
      // Find the latest active cart (add_to_order) within the current session
      const lastCartLog = [...sessionLogs].reverse().find(l => {
        const parsed = l.ai_parsed_response as AgentResult | null;
        return parsed && parsed.intent === 'add_to_order' && parsed.order && parsed.order.items.length > 0;
      });
      
      if (lastCartLog) {
        const cartOrder = (lastCartLog.ai_parsed_response as AgentResult).order;
        if (cartOrder) {
           cartContext = JSON.stringify(cartOrder.items);
        }
      }
    }

    const deepseekKey = process.env.DEEPSEEK_API_KEY;

    let agentResult: AgentResult;

    if (!deepseekKey || deepseekKey === 'tu_api_key_de_deepseek') {
      console.warn('DeepSeek API key not configured. Using fallback agent.');
      agentResult = runFallbackAgent(customerMessage, customerName, menuItems);
    } else {
      try {
        agentResult = await runAIAgent(
          customerMessage, 
          customerName, 
          menuItems, 
          dbModifiers,
          deepseekKey, 
          historyContext, 
          cartContext, 
          crmContext,
          customAiPrompt
        );
      } catch (agentError: unknown) {
        const agentErr = agentError as Error;
        console.error('AI Agent failed, using fallback:', agentErr);
        // Fallback to basic agent if AI fails, but append the error so the user can debug it!
        agentResult = runFallbackAgent(customerMessage, customerName, menuItems);
        agentResult.human_response += `\n\n[DIAGNÓSTICO TÉCNICO DE DEEPSEEK]: ${agentErr.message}`;
      }
    }

    // --- STRICT BACKEND ENFORCEMENT ---
    // If the AI hallucinates and tries to confirm the order prematurely, we forcefully intercept it.
    if (agentResult.intent === 'confirm_order' && agentResult.order) {
      if (!agentResult.order.order_type) {
        agentResult.intent = 'add_to_order';
        agentResult.human_response = '¡Casi listo! Pero antes de confirmar... ¿tu pedido es para consumir en la mesa, para retirar en el local, o para envío a domicilio?';
      } else if (agentResult.order.order_type === 'delivery' && !agentResult.order.delivery_address) {
        agentResult.intent = 'add_to_order';
        agentResult.human_response = '¡Excelente! Para enviarte el pedido, por favor escríbeme tu dirección exacta o envíame tu Ubicación Compartida por WhatsApp.';
      } else if (!agentResult.order.payment_method) {
        agentResult.intent = 'add_to_order';
        agentResult.human_response = '¡Entendido! Por último, ¿cómo deseas cancelar tu pedido? ¿En Efectivo o mediante Transferencia Bancaria?';
      }
    }

    // If it's just adding to order, save to logs and ask if they want more
    if (agentResult.intent === 'add_to_order' && agentResult.order) {
      await sendWhatsAppMessage(customerPhone, agentResult.human_response, whatsappPhoneId);
      if (webhookLogId) {
        await supabaseAdmin
          .from('whatsapp_webhook_logs')
          .update({ status: 'drafting_order', ai_parsed_response: agentResult })
          .eq('id', webhookLogId);
      }
      return NextResponse.json({
        status: 'drafting_order',
        reply_message: agentResult.human_response,
      });
    }

    // Handle transfer_to_human intent (human handoff request)
    if (agentResult.intent === 'transfer_to_human') {
      await supabaseAdmin
        .from('customers')
        .update({ bot_active: false })
        .eq('restaurant_id', restaurantId)
        .eq('phone', customerPhone);

      await supabaseAdmin
        .from('admin_alerts')
        .insert({
          restaurant_id: restaurantId,
          type: 'human_request',
          title: 'Solicitud de Atención Humana',
          message: `El cliente ${customerName} (+${customerPhone}) ha solicitado hablar con un agente humano.`,
          customer_phone: customerPhone,
          customer_name: customerName,
          status: 'pending'
        });

      await sendWhatsAppMessage(customerPhone, agentResult.human_response, whatsappPhoneId);

      if (webhookLogId) {
        await supabaseAdmin
          .from('whatsapp_webhook_logs')
          .update({ status: 'human_handoff_triggered', ai_parsed_response: agentResult })
          .eq('id', webhookLogId);
      }

      return NextResponse.json({
        status: 'human_handoff_triggered',
        reply_message: agentResult.human_response,
      });
    }

    // Handle special_event intent (buffet or event catering inquiry)
    if (agentResult.intent === 'special_event') {
      await supabaseAdmin
        .from('admin_alerts')
        .insert({
          restaurant_id: restaurantId,
          type: 'buffet_inquiry',
          title: 'Consulta de Buffet / Evento Especial',
          message: `El cliente ${customerName} (+${customerPhone}) consultó sobre: "${customerMessage.substring(0, 150)}"`,
          customer_phone: customerPhone,
          customer_name: customerName,
          status: 'pending'
        });

      await sendWhatsAppMessage(customerPhone, agentResult.human_response, whatsappPhoneId);

      // Notify admin if phone is configured
      const { data: restData } = await supabaseAdmin
        .from('restaurants')
        .select('phone')
        .eq('id', restaurantId)
        .single();

      if (restData && restData.phone) {
        const adminMsg = `🚨 *Alerta de Evento Especial/Buffet* 🚨\n\nEl cliente *${customerName}* (+${customerPhone}) está solicitando cotización o información sobre comidas especiales o catering.\n\nMensaje del cliente: "${customerMessage}"`;
        try {
          await sendWhatsAppMessage(restData.phone, adminMsg, whatsappPhoneId);
        } catch (waErr) {
          console.error('Failed to notify admin via WhatsApp:', waErr);
        }
      }

      if (webhookLogId) {
        await supabaseAdmin
          .from('whatsapp_webhook_logs')
          .update({ status: 'special_event_alert_triggered', ai_parsed_response: agentResult })
          .eq('id', webhookLogId);
      }

      return NextResponse.json({
        status: 'special_event_alert_triggered',
        reply_message: agentResult.human_response,
      });
    }

    // If the agent decided this is NOT an order, just reply and exit
    if (agentResult.intent !== 'order' && agentResult.intent !== 'confirm_order' || !agentResult.order || agentResult.order.items.length === 0) {
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
      selected_modifiers?: { name: string; price: number }[];
    }[] = [];
    const itemsDetailForMessage: string[] = [];

    for (const parsedItem of parsedOrder.items) {
      const dbItem = menuItems.find((item) => item.id === parsedItem.product_id);
      if (dbItem) {
        const basePrice = Number(dbItem.price);
        const itemModifiers = parsedItem.modifiers || [];
        const modifiersPriceSum = itemModifiers.reduce((sum, m) => sum + Number(m.price || 0), 0);
        const itemPrice = basePrice + modifiersPriceSum;
        const itemSubtotal = parsedItem.quantity * itemPrice;
        subtotal += itemSubtotal;

        orderItemsToInsert.push({
          menu_item_id: dbItem.id,
          quantity: parsedItem.quantity,
          unit_price: basePrice,
          notes: parsedItem.notes || null,
          selected_modifiers: itemModifiers.map(m => ({ name: m.name, price: Number(m.price || 0) }))
        });

        const modifiersText = itemModifiers.length > 0 ? ` (+ ${itemModifiers.map(m => m.name).join(', ')})` : '';
        itemsDetailForMessage.push(
          `- ${parsedItem.quantity}x ${dbItem.name}${modifiersText} (${parsedItem.notes ? `Nota: ${parsedItem.notes}` : 'Sin notas'})`
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
        payment_method: parsedOrder.payment_method || 'cash',
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

    // --- CRM Update ---
    await supabaseAdmin.from('customers').upsert({
      restaurant_id: restaurantId,
      phone: customerPhone,
      name: customerName,
    }, { onConflict: 'restaurant_id, phone' }).select().single().then(async ({ data: existingCrm }) => {
      if (existingCrm) {
        await supabaseAdmin.from('customers').update({
          total_orders: (existingCrm.total_orders || 0) + 1,
          total_spent: Number((Number(existingCrm.total_spent || 0) + total).toFixed(2)),
          last_visit: new Date().toISOString()
        }).eq('id', existingCrm.id);
      }
    });

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
    const orderCodeStr = order?.order_code ? `*Código de Pedido:* ${formatOrderCode(order.order_code)}\n\n` : '';

    if (parsedOrder.payment_method === 'transfer') {
      confirmationMessage = `¡Gracias, ${customerName}! Hemos registrado tu pedido con éxito. 📝🍽\n\n${orderCodeStr}*Detalle del pedido:*\n${itemsDetailForMessage.join('\n')}\n\n*Resumen financiero:*\n- Subtotal: $${subtotal.toFixed(2)}\n- IVA (10%): $${tax.toFixed(2)}${isDelivery ? `\n- Costo Envío: $${deliveryFee.toFixed(2)}` : ''}\n*Total a Pagar: $${total.toFixed(2)}*\n\n*Tipo de pedido:* ${isDelivery ? `Domicilio (${parsedOrder.delivery_address || 'Sin dirección'})` : parsedOrder.order_type === 'dine_in' ? `Consumo en Mesa` : 'Retiro en Local'}\n*Método de Pago:* Transferencia Bancaria\n\n⚠️ *Para procesar tu pedido, por favor envíanos la FOTO DEL COMPROBANTE de transferencia por este medio.* Quedamos a la espera.`;
    } else {
      confirmationMessage = `¡Gracias, ${customerName}! Hemos registrado tu pedido con éxito. 📝🍽\n\n${orderCodeStr}*Detalle del pedido:*\n${itemsDetailForMessage.join('\n')}\n\n*Resumen financiero:*\n- Subtotal: $${subtotal.toFixed(2)}\n- IVA (10%): $${tax.toFixed(2)}${isDelivery ? `\n- Costo Envío: $${deliveryFee.toFixed(2)}` : ''}\n*Total a Pagar: $${total.toFixed(2)}*\n\n*Tipo de pedido:* ${isDelivery ? `Domicilio (${parsedOrder.delivery_address || 'Sin dirección'})` : parsedOrder.order_type === 'dine_in' ? `Consumo en Mesa` : 'Retiro en Local'}\n*Método de Pago:* Efectivo al ${isDelivery ? 'recibir' : 'entregar'}\n\nTu pedido está siendo procesado en cocina. Te notificaremos por aquí cuando cambie su estado. ¡Buen provecho!`;
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
  intent: 'order' | 'add_to_order' | 'confirm_order' | 'menu_query' | 'full_menu' | 'greeting' | 'other' | 'transfer_to_human' | 'special_event';
  human_response: string;  // The natural language message to send the customer
  order: ParsedOrder | null;  // Structured order data, only when intent === 'order'
}

async function runAIAgent(
  message: string,
  customerName: string,
  menuItems: DBMenuItem[],
  modifiers: any[],
  apiKey: string,
  historyContext: string,
  cartContext: string,
  crmContext: string,
  customPrompt: string | null = null
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
      const rows = items.map((i) => {
        const itemModifiers = modifiers.filter(m => m.menu_item_id === i.id);
        const modString = itemModifiers.length > 0 
          ? ` | Opciones/Modificadores disponibles: [${itemModifiers.map(m => `"${m.name}" (+$${Number(m.price).toFixed(2)})`).join(', ')}]`
          : '';
        return `    - ID:"${i.id}" | Código:"${i.code || ''}" | Nombre:"${i.name}" | Precio:$${i.price} | Desc:"${i.description || ''}"${modString}`;
      });
      return `  📂 ${cat}:\n${rows.join('\n')}`;
    })
    .join('\n\n');

  // Categoría names for menu display formatting
  const categoryNames = Object.keys(grouped);

  const basePrompt = `Eres *Appy*, el asistente virtual inteligente de un restaurante latinoamericano. 
Eres amable, cálido, eficiente y conoces el menú a la perfección.
Atiendes clientes por WhatsApp en español latinoamericano.
Usas emojis con moderación y formato de WhatsApp (*negrita*, _cursiva_).
Nunca inventas platos que no estén en el menú.`;

  const systemPrompt = customPrompt ? customPrompt : basePrompt;

  const fullSystemPrompt = `${systemPrompt}

=== MENÚ DEL RESTAURANTE ===
${menuContext}
=== FIN DEL MENÚ ===

CATEGORÍAS DISPONIBLES: ${categoryNames.join(', ')}

NOMBRE DEL CLIENTE: ${customerName}

=== PERFIL DEL CLIENTE (CRM) ===
${crmContext}

=== MEMORIA DE LA CONVERSACIÓN ===
${historyContext}

=== ESTADO DEL CARRITO ACTUAL ===
${cartContext}`;

  const userPrompt = `MENSAJE DEL CLIENTE: "${message}"

Analiza el mensaje y responde ÚNICAMENTE con un JSON con esta estructura exacta (sin bloques de código, sin texto extra):

{
  "intent": "add_to_order" | "confirm_order" | "menu_query" | "full_menu" | "greeting" | "transfer_to_human" | "special_event" | "other",
  "human_response": "Tu respuesta completa y natural para enviar al cliente por WhatsApp",
  "order": {
    "items": [
      { 
        "product_id": "UUID exacto del menú", 
        "quantity": 1, 
        "notes": null, 
        "modifiers": [
          { "name": "Nombre del modificador", "price": 0.00 }
        ]
      }
    ],
    "order_type": "pickup" | "delivery" | "dine_in" | null,
    "delivery_address": null,
    "table_number": null,
    "payment_method": "cash" | "transfer" | null,
    "notes": null
  } | null
}

REGLAS CRÍTICAS:

1. INTENTS:
   - "greeting": Solo saluda.
   - "full_menu": Pide ver TODO el menú.
   - "menu_query": Pregunta por UNA categoría específica.
   - "add_to_order": El cliente está pidiendo comida, PERO AÚN NO HA TERMINADO o simplemente está agregando cosas.
   - "confirm_order": El cliente explícitamente dice que ya no quiere nada más, que eso es todo, o que procedas a cobrar.
   - "transfer_to_human": El cliente explícitamente solicita hablar con un humano, persona real, administrador, soporte técnico o agente de servicio.
   - "special_event": El cliente pregunta sobre buffets, catering, preparación de banquetes, comidas especiales para eventos, contratos grandes, etc.
   - "other": Otra cosa.

2. Para "add_to_order" y "confirm_order":
   - El arreglo "items" dentro de "order" DEBE contener SIEMPRE el pedido completo (es decir, TODOS los items que ya estaban en el ESTADO DEL CARRITO ACTUAL + los nuevos items que haya solicitado el cliente ahora). NUNCA borres los items anteriores.
   - Si es "add_to_order", el human_response debe listar lo que lleva hasta ahora y preguntar explícitamente: "¿Deseas agregar algo más a tu pedido o confirmamos?"

3. Para "confirm_order":
   - ES OBLIGATORIO que el JSON final incluya "order_type", "delivery_address" (si aplica) y "payment_method".
   - NUNCA uses "confirm_order" si aún no conoces la modalidad (order_type) o la forma de pago (payment_method). Si falta alguno, mantén el intent en "add_to_order" y pregúntaselo.
   - Si el cliente NO ha especificado la modalidad de entrega, es OBLIGATORIO preguntarle explícitamente: "¿Su pedido es para consumir en la mesa, para retirar en el local, o para envío a domicilio? (También puedes enviarme tu ubicación de WhatsApp si es para domicilio)".
   - EXCEPCIÓN y REGLA DE ORO: Si el cliente ya indica la modalidad (ej. dice "es a domicilio", "para llevar", "en la mesa", o envía una dirección o [Ubicación Compartida]), DEDUCE inmediatamente el "order_type" (delivery, pickup, dine_in). NO VUELVAS a preguntarle si es para mesa/llevar/domicilio. Si es "delivery" y falta la dirección, pídesela. Si ya tienes la modalidad (y dirección si aplica), pasa directo a preguntar el método de pago.
   - Una vez tengas el tipo de pedido (y la dirección si aplica), pregúntale SIEMPRE por su método de pago de forma muy empática y cortés (Efectivo o Transferencia) manteniendo el intent "add_to_order".
   - SOLO cuando el cliente te confirme el método de pago (ej. responde "efectivo" o "transferencia"), puedes cambiar el intent a "confirm_order".
   - El human_response de "confirm_order" debe ser un mensaje breve y amable despidiéndose, indicando que el pedido está siendo generado.

4. Para "full_menu" o "menu_query":
   - ES OBLIGATORIO usar listas verticales. Cada plato debe ir en una nueva línea.
   - Formato exacto esperado:
     *Categoría*
     - Plato 1 ($X.XX)
     - Plato 2 ($X.XX)
   - NUNCA respondas con los platos separados por comas en un solo párrafo, es ilegible.

6. GESTIÓN DE CALIFICACIONES (POST-ENTREGA):
   - Si el cliente envía un número del 1 al 5, estrellas (⭐), o un comentario evaluativo corto (ej. "Todo rico", "Estuvo malo", "5") justo después de que se le entregó su pedido, el intent debe ser "other".
   - Tu human_response debe ser un agradecimiento muy amable por la calificación. Si la nota es baja (1-3), pide disculpas sinceramente e indica que trabajarán para mejorar. No ofrezcas ni intentes tomar un nuevo pedido en este momento.

7. GESTIÓN DE MODIFICADORES Y PERSONALIZACIÓN DE PLATOS:
   - Si el cliente solicita opciones adicionales, términos de carne, o extras (ej. "con extra de papas", "término medio"), y estas opciones están listadas en los "Opciones/Modificadores disponibles" del plato correspondiente, DEBES extraerlos e incluirlos en el arreglo "modifiers" con su nombre y precio exactos.
   - Si el cliente menciona personalizaciones que NO están en la lista oficial de modificadores del plato (ej. "sin cebolla" cuando no existe esa opción con precio), colócalo en el campo "notes" del item (como nota de texto libre), en lugar de "modifiers".
   - NUNCA inventes modificadores en el arreglo "modifiers" que no existan en la lista oficial del plato.

8. Siempre usa los IDs exactos del menú y sé conversacional.`;

  const url = 'https://api.deepseek.com/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: fullSystemPrompt },
        { role: 'assistant', content: 'Entendido. Soy Appy y estoy listo para atender al cliente respondiendo estrictamente en formato JSON.' },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek Agent API error: ${response.status} — ${errText}`);
  }

  const resJson = await response.json();
  const raw = resJson.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error('Empty response from DeepSeek agent.');

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
    payment_method: null,
    notes: null,
  };
}

