'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Order, OrderStatus } from '@/types';
import { toast } from 'sonner';

export function useOrders(restaurantId: string | null) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Track the latest data version to detect staleness
  const versionRef = useRef<number>(0);
  // Track if component is mounted
  const mountedRef = useRef(true);

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
      if (!silent && mountedRef.current) setLoading(false);
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
      
      if (mountedRef.current) {
        versionRef.current += 1;
        setOrders((data as unknown as Order[]) || []);
      }
    } catch (err: unknown) {
      console.error('Error fetching orders:', err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Unknown error fetching orders');
      }
    } finally {
      clearTimeout(safetyTimer);
      if (!silent && mountedRef.current) setLoading(false);
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
  const updateOrderPaymentStatus = useCallback(async (orderId: string, isPaid: boolean, paymentReference?: string | null, paymentReceiptUrl?: string | null): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ 
          is_paid: isPaid,
          payment_reference: paymentReference,
          payment_receipt_url: paymentReceiptUrl
        })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to update payment status');
      }

      // Optimistically update local state
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === orderId
            ? { 
                ...order, 
                is_paid: isPaid, 
                payment_reference: paymentReference !== undefined ? paymentReference : order.payment_reference,
                payment_receipt_url: paymentReceiptUrl !== undefined ? paymentReceiptUrl : order.payment_receipt_url,
                updated_at: new Date().toISOString() 
              }
            : order
        )
      );
      return true;
    } catch (err: unknown) {
      console.error(`Error updating payment status for order ${orderId}:`, err);
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error('Error al actualizar el estado de pago');
      }
      return false;
    }
  }, []);

  // Set up real-time listeners (orders + order_items) and polling fallback
  useEffect(() => {
    if (!restaurantId) return;

    mountedRef.current = true;

    fetchOrders(false);

    // ── Channel 1: Subscribe to changes on the ORDERS table ──
    const ordersChannel = supabase
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
          if (!mountedRef.current) return;

          const { eventType, new: newRecord, old: oldRecord } = payload;

          if (eventType === 'INSERT') {
            // Fetch detailed order with items and update state
            const detailed = await fetchDetailedOrder(newRecord.id);
            if (detailed && mountedRef.current) {
              setOrders((prev) => {
                // Prevent duplicate insertions
                if (prev.some((o) => o.id === detailed.id)) return prev;
                return [detailed, ...prev];
              });
            }
          } else if (eventType === 'UPDATE') {
            // Fetch detailed order to ensure everything matches
            const detailed = await fetchDetailedOrder(newRecord.id);
            if (detailed && mountedRef.current) {
              setOrders((prev) =>
                prev.map((order) => (order.id === detailed.id ? detailed : order))
              );
            } else if (mountedRef.current) {
              // Fallback to updating just the basic order fields in state
              setOrders((prev) =>
                prev.map((order) =>
                  order.id === newRecord.id ? { ...order, ...newRecord } : order
                )
              );
            }
          } else if (eventType === 'DELETE') {
            if (mountedRef.current) {
              setOrders((prev) => prev.filter((order) => order.id !== oldRecord.id));
            }
          }
        }
      )
      .subscribe((status) => {
        console.log(`Supabase Realtime subscription status for orders (${restaurantId}): ${status}`);
        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          // Force a full refetch when the channel encounters errors
          console.warn('Orders realtime channel error, forcing full refetch...');
          setTimeout(() => {
            if (mountedRef.current) fetchOrders(true);
          }, 1000);
        }
      });

    // ── Channel 2: Subscribe to changes on the ORDER_ITEMS table ──
    // When items are added/updated/removed on any order for this restaurant,
    // we re-fetch the affected order so the UI reflects the change immediately.
    const orderItemsChannel = supabase
      .channel(`restaurant-order-items-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_items',
        },
        async (payload) => {
          if (!mountedRef.current) return;

          const record = (payload.new || payload.old) as any;
          const orderId: string | undefined = record?.order_id;
          if (!orderId) return;

          // Only process if this order belongs to the current restaurant
          setOrders((prev) => {
            const exists = prev.some((o) => o.id === orderId);
            if (!exists) return prev; // Not our order, ignore
            // Trigger a detailed refetch for this specific order
            fetchDetailedOrder(orderId).then((detailed) => {
              if (detailed && mountedRef.current) {
                setOrders((current) =>
                  current.map((o) => (o.id === detailed.id ? detailed : o))
                );
              }
            });
            return prev;
          });
        }
      )
      .subscribe((status) => {
        console.log(`Supabase Realtime subscription status for order_items (${restaurantId}): ${status}`);
      });

    // ── Polling fallback every 5 seconds to guarantee updates if Realtime fails ──
    const intervalId = setInterval(() => {
      if (mountedRef.current) fetchOrders(true);
    }, 5000);

    // ── Visibility change handler: refetch when user returns to the tab ──
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mountedRef.current) {
        console.log('Tab became visible, refreshing orders...');
        fetchOrders(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ── Online handler: refetch when network reconnects ──
    const handleOnline = () => {
      if (mountedRef.current) {
        console.log('Network reconnected, refreshing orders...');
        fetchOrders(true);
      }
    };
    window.addEventListener('online', handleOnline);

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(orderItemsChannel);
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
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
