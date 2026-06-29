import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderId, itemsToSplit, billingDetails } = body;
    // itemsToSplit = array of { orderItemId, quantity }

    if (!orderId || !itemsToSplit || itemsToSplit.length === 0) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos.' }, { status: 400 });
    }

    // 1. Fetch original order
    const { data: originalOrder, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !originalOrder) {
      return NextResponse.json({ error: 'Orden original no encontrada.' }, { status: 404 });
    }

    // 2. Fetch original order items
    const { data: originalItems, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    if (itemsError || !originalItems || originalItems.length === 0) {
      return NextResponse.json({ error: 'Items de orden no encontrados.' }, { status: 404 });
    }

    // Prepare to calculate totals
    const taxRate = 0.15; // TODO: dynamically fetch if restaurant has sri_iva_rate, using 15% for now as standard

    // We will separate items into "remaining in original" and "moved to new"
    let newOrderItems = [];
    let updatedOriginalItems = []; // items whose quantity decreases
    let deletedOriginalItemIds = []; // items fully moved

    let newOrderTotalItemsPvp = 0;
    let remainingOrderTotalItemsPvp = 0;

    // Build map for quick access
    const splitMap = new Map();
    for (const splitReq of itemsToSplit) {
      splitMap.set(splitReq.orderItemId, splitReq.quantity);
    }

    for (const item of originalItems) {
      const splitQty = splitMap.get(item.id) || 0;
      const originalQty = item.quantity;
      const itemPrice = Number(item.unit_price);

      if (splitQty > 0) {
        if (splitQty >= originalQty) {
          // Move the entire item
          deletedOriginalItemIds.push(item.id);
          
          const { id, created_at, ...itemDataWithoutId } = item;
          newOrderItems.push({
            ...itemDataWithoutId,
            quantity: originalQty,
            // We will set order_id later once new order is created
          });
          
          newOrderTotalItemsPvp += originalQty * itemPrice;
        } else {
          // Split item
          const remainingQty = originalQty - splitQty;
          updatedOriginalItems.push({
            id: item.id,
            quantity: remainingQty
          });
          
          const { id, created_at, ...itemDataWithoutId } = item;
          newOrderItems.push({
            ...itemDataWithoutId,
            quantity: splitQty
          });
          
          newOrderTotalItemsPvp += splitQty * itemPrice;
          remainingOrderTotalItemsPvp += remainingQty * itemPrice;
        }
      } else {
        // Stays in original
        remainingOrderTotalItemsPvp += originalQty * itemPrice;
      }
    }

    // Calculate financials for New Order
    const newSubtotal = Number((newOrderTotalItemsPvp / (1 + taxRate)).toFixed(2));
    const newTax = Number((newSubtotal * taxRate).toFixed(2));
    const newTotal = Number((newSubtotal + newTax).toFixed(2));

    // Calculate financials for Remaining Order
    const remSubtotal = Number((remainingOrderTotalItemsPvp / (1 + taxRate)).toFixed(2));
    const remTax = Number((remSubtotal * taxRate).toFixed(2));
    const remTotal = Number((remSubtotal + remTax).toFixed(2));

    // 3. Create New Order (Cloned)
    const newOrderId = uuidv4();
    const newOrderCode = originalOrder.order_code + '-SPLIT-' + Math.floor(Math.random()*1000);

    const { id: _, order_number: __, created_at: ___, updated_at: ____, ...orderToClone } = originalOrder;
    const newOrderData = {
      ...orderToClone,
      id: newOrderId,
      order_code: newOrderCode,
      subtotal: newSubtotal,
      tax: newTax,
      total_price: newTotal,
      sri_requiere_factura: billingDetails?.sri_requiere_factura ?? true,
      billing_vat: billingDetails?.billing_vat || null,
      billing_name: billingDetails?.billing_name || null,
      billing_email: billingDetails?.billing_email || null,
      billing_address: billingDetails?.billing_address || null,
      forma_pago: billingDetails?.forma_pago || '01',
      // Reset SRI fields so it can be invoiced again
      sri_estado: null,
      sri_autorizacion: null,
      sri_fecha_aut: null,
      sri_mensajes: null,
      invoice_ref: null,
      invoice_auth: null,
      is_paid: true, // we assume it's paid immediately since they are checking out
      payment_method: billingDetails?.payment_method || 'efectivo',
    };

    const { error: insertOrderError } = await supabaseAdmin
      .from('orders')
      .insert(newOrderData);

    if (insertOrderError) {
      console.error('Error creating split order:', insertOrderError);
      return NextResponse.json({ error: 'Error al crear orden dividida.' }, { status: 500 });
    }

    // 4. Insert New Order Items
    const itemsToInsert = newOrderItems.map(item => ({
      ...item,
      order_id: newOrderId
    }));
    
    if (itemsToInsert.length > 0) {
      const { error: insertItemsError } = await supabaseAdmin
        .from('order_items')
        .insert(itemsToInsert);
        
      if (insertItemsError) {
        console.error('Error inserting split order items:', insertItemsError);
        return NextResponse.json({ error: 'Error al mover ítems.' }, { status: 500 });
      }
    }

    // 5. Update Original Order Totals
    const { error: updateOrderError } = await supabaseAdmin
      .from('orders')
      .update({
        subtotal: remSubtotal,
        tax: remTax,
        total_price: remTotal,
      })
      .eq('id', orderId);

    // 6. Update/Delete Original Order Items
    for (const updateItem of updatedOriginalItems) {
      await supabaseAdmin
        .from('order_items')
        .update({ quantity: updateItem.quantity })
        .eq('id', updateItem.id);
    }

    if (deletedOriginalItemIds.length > 0) {
      await supabaseAdmin
        .from('order_items')
        .delete()
        .in('id', deletedOriginalItemIds);
    }

    return NextResponse.json({ 
      success: true, 
      newOrderId,
      message: 'Orden dividida correctamente.'
    });

  } catch (error: any) {
    console.error('API /orders/split error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
