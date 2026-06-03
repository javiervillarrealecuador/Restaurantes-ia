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
  const fetchOrders = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    setError(null);
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
      setOrders((data as unknown as Order[]) || []);
    } catch (err: unknown) {
      const errorObj = err as Error;
      setError(errorObj.message || 'Error loading orders');
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  // Update order status
  const updateOrderStatus = useCallback(async (orderId: string, status: OrderStatus): Promise<boolean> => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
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

  // Update order payment status
  const updateOrderPaymentStatus = useCallback(async (orderId: string, isPaid: boolean): Promise<boolean> => {
    try {
      const { error: updateErr } = await supabase
        .from('orders')
        .update({ is_paid: isPaid, updated_at: new Date().toISOString() })
        .eq('id', orderId);

      if (updateErr) throw updateErr;

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

  // Set up real-time listener
  useEffect(() => {
    if (!restaurantId) return;

    fetchOrders();

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, fetchOrders, fetchDetailedOrder]);

  return {
    orders,
    loading,
    error,
    updateOrderStatus,
    updateOrderPaymentStatus,
    refreshOrders: fetchOrders,
  };
}
