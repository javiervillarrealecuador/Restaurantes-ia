'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Order, OrderStatus } from '@/types';

export function useOrders(restaurantId: string | null) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Helper function to fetch a single detailed order (with items and menu item details)
  const fetchDetailedOrder = useCallback(async (orderId: string): Promise<Order | null> => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            id,
            order_id,
            menu_item_id,
            quantity,
            unit_price,
            notes,
            menu_items (
              id,
              name,
              description,
              price,
              image_url
            )
          )
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;
      return data as Order;
    } catch (err: unknown) {
      console.error(`Error fetching detailed order ${orderId}:`, err);
      return null;
    }
  }, []);

  // Fetch all orders for the restaurant
  const fetchOrders = useCallback(async (silent = false) => {
    if (!restaurantId) return;
    if (!silent) setLoading(true);
    setError(null);
    
    // Safety fallback to prevent infinite loading
    const safetyTimer = setTimeout(() => {
      if (!silent) setLoading(false);
    }, 12000);

    try {
      const { data, error: fetchErr } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            id,
            order_id,
            menu_item_id,
            quantity,
            unit_price,
            notes,
            menu_items (
              id,
              name,
              description,
              price,
              image_url
            )
          )
        `)
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (fetchErr) throw fetchErr;
      
      setOrders((prev) => {
        // Prevent state updates and re-renders if the fetched data is identical to the current local state
        if (JSON.stringify(prev) === JSON.stringify(data)) {
          return prev;
        }
        return (data as unknown as Order[]) || [];
      });
    } catch (err: unknown) {
      console.error('Error fetching orders:', err);
      setError(err instanceof Error ? err.message : 'Unknown error fetching orders');
    } finally {
      clearTimeout(safetyTimer);
      if (!silent) setLoading(false);
    }
  }, [restaurantId]);

  // Update order status
  const updateOrderStatus = useCallback(async (orderId: string, status: OrderStatus): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        throw new Error(`API returned error code ${res.status}`);
      }

      // Optimistically update local state
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === orderId
            ? { ...order, status, updated_at: new Date().toISOString() }
            : order
        )
      );
      return true;
    } catch (err: unknown) {
      console.error(`Error updating status for order ${orderId}:`, err);
      return false;
    }
  }, []);

  // Libera la mesa asociada a un pedido cuando se entrega o cancela
  const freeTableForOrder = useCallback(async (orderId: string): Promise<boolean> => {
    try {
      // Obtener datos del pedido para identificar la mesa
      const { data: orderData, error: orderErr } = await supabase
        .from('orders')
        .select('table_number, restaurant_id, branch_id')
        .eq('id', orderId)
        .single();
      if (orderErr) throw orderErr;
      if (!orderData?.table_number) return true; // No hay mesa asignada

      const { error: updateErr } = await supabase
        .from('restaurant_tables')
        .update({ status: 'free', current_order_id: null })
        .eq('restaurant_id', orderData.restaurant_id)
        .eq('branch_id', orderData.branch_id)
        .eq('table_number', orderData.table_number);
      if (updateErr) throw updateErr;
      return true;
    } catch (err) {
      console.error(`Error freeing table for order ${orderId}:`, err);
      return false;
    }
  }, []);


  // Update order payment status
  const updateOrderPaymentStatus = useCallback(async (orderId: string, isPaid: boolean): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ is_paid: isPaid })
      });
      if (!response.ok) {
        throw new Error('Failed to update payment status');
      }

      // Optimistically update local state
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === orderId
            ? { ...order, is_paid: isPaid, updated_at: new Date().toISOString() }
            : order
        )
      );
      return true;
    } catch (err: unknown) {
      console.error(`Error updating payment status for order ${orderId}:`, err);
      return false;
    }
  }, []);

  // Set up real-time listener and polling fallback
  useEffect(() => {
    if (!restaurantId) return;

    fetchOrders(false);

    // Subscribe to changes on the orders table for this restaurant
    const channel = supabase
      .channel(`restaurant-orders-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        async (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;

          if (eventType === 'INSERT') {
            // Fetch detailed order with items and update state
            const detailed = await fetchDetailedOrder(newRecord.id);
            if (detailed) {
              setOrders((prev) => {
                // Prevent duplicate insertions
                if (prev.some((o) => o.id === detailed.id)) return prev;
                return [detailed, ...prev];
              });
            }
          } else if (eventType === 'UPDATE') {
            // Fetch detailed order to ensure everything matches
            const detailed = await fetchDetailedOrder(newRecord.id);
            if (detailed) {
              setOrders((prev) =>
                prev.map((order) => (order.id === detailed.id ? detailed : order))
              );
            } else {
              // Fallback to updating just the basic order fields in state
              setOrders((prev) =>
                prev.map((order) =>
                  order.id === newRecord.id ? { ...order, ...newRecord } : order
                )
              );
            }
          } else if (eventType === 'DELETE') {
            setOrders((prev) => prev.filter((order) => order.id !== oldRecord.id));
          }
        }
      )
      .subscribe((status) => {
        console.log(`Supabase Realtime subscription status for orders (${restaurantId}): ${status}`);
      });

    // Polling fallback every 8 seconds to guarantee updates if Realtime fails
    const intervalId = setInterval(() => {
      fetchOrders(true);
    }, 8000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(intervalId);
    };
  }, [restaurantId, fetchOrders, fetchDetailedOrder]);

  return {
    orders,
    loading,
    error,
    updateOrderStatus,
    updateOrderPaymentStatus,
    freeTableForOrder,
    refreshOrders: fetchOrders,
  };
}
