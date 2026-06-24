'use client';

import React, { useState, useEffect } from 'react';
import { Order, OrderStatus, Kitchen } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CheckCircle, ChefHat, AlertTriangle, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

interface KitchenDisplayProps {
  orders: Order[];
  onUpdateStatus: (orderId: string, status: OrderStatus) => Promise<boolean>;
  restaurantId?: string;
}

export default function KitchenDisplay({ orders, onUpdateStatus, restaurantId }: KitchenDisplayProps) {
  const { kitchenId: userKitchenId } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [kitchens, setKitchens] = useState<Kitchen[]>([]);
  const [selectedKitchenId, setSelectedKitchenId] = useState<string | 'all'>(userKitchenId || 'all');

  // Sync selectedKitchenId when userKitchenId becomes available (it arrives async from AuthContext)
  useEffect(() => {
    if (userKitchenId) {
      setSelectedKitchenId(userKitchenId);
    }
  }, [userKitchenId]);

  // Fetch kitchens
  useEffect(() => {
    if (restaurantId) {
      supabase
        .from('kitchens')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .then(({ data, error }) => {
          if (!error && data) {
            setKitchens(data);
          }
        });
    }
  }, [restaurantId]);

  // Update time every minute to refresh waiting times
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const handleStatusChange = async (orderId: string, currentStatus: OrderStatus) => {
    setUpdatingId(orderId);
    let nextStatus: OrderStatus = 'preparing';
    
    if (currentStatus === 'pending' || currentStatus === 'confirmed') {
      nextStatus = 'preparing';
    } else if (currentStatus === 'preparing') {
      nextStatus = 'ready';
    } else if (currentStatus === 'ready') {
      toast.success('El pedido ya está listo para entrega');
      setUpdatingId(null);
      return;
    }

    const success = await onUpdateStatus(orderId, nextStatus);
    if (success) {
      if (nextStatus === 'preparing') toast.success('Pedido en preparación');
      if (nextStatus === 'ready') toast.success('¡Pedido listo!');
    }
    setUpdatingId(null);
  };

  // Filter orders relevant for kitchen AND the selected kitchen
  const kitchenOrders = orders
    .filter(o => ['pending', 'confirmed', 'preparing'].includes(o.status))
    .map(order => {
      // If a specific kitchen is selected, filter the order items
      if (selectedKitchenId !== 'all') {
        const filteredItems = order.order_items?.filter(
          item => item.menu_items?.kitchen_id === selectedKitchenId
        );
        return { ...order, order_items: filteredItems };
      }
      return order;
    })
    // Only keep orders that have at least one item after filtering
    .filter(order => order.order_items && order.order_items.length > 0)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const getWaitTimeMinutes = (createdAt: string) => {
    const orderTime = new Date(createdAt).getTime();
    const now = currentTime.getTime();
    return Math.floor((now - orderTime) / 60000);
  };

  const getCardColor = (minutes: number, status: OrderStatus) => {
    if (status === 'preparing') return 'border-blue-500 bg-blue-50 dark:bg-blue-900/20';
    if (minutes >= 30) return 'border-red-500 bg-red-50 dark:bg-red-900/20';
    if (minutes >= 15) return 'border-amber-500 bg-amber-50 dark:bg-amber-900/20';
    return 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20';
  };

  const getTimeColor = (minutes: number) => {
    if (minutes >= 30) return 'text-red-600 dark:text-red-400';
    if (minutes >= 15) return 'text-amber-600 dark:text-amber-400';
    return 'text-emerald-600 dark:text-emerald-400';
  };

  return (
    <div className="space-y-4">
      {/* Kitchen Filter / Assigned Kitchen Info */}
      {(kitchens.length > 0 || userKitchenId) && (
        <div className="flex items-center gap-3 bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          {userKitchenId ? (
            <>
              <ChefHat className="w-5 h-5 text-emerald-500" />
              <span className="font-bold text-gray-900 dark:text-white">
                Cocina Asignada: {kitchens.find(k => k.id === userKitchenId)?.name || 'Específica'}
              </span>
              <span className="text-xs text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full dark:bg-emerald-900/30 dark:text-emerald-400">
                Solo ves los platos de tu área
              </span>
            </>
          ) : (
            <>
              <Filter className="w-5 h-5 text-gray-500" />
              <span className="font-medium text-gray-700 dark:text-gray-300">Filtrar por Cocina:</span>
              <select
                value={selectedKitchenId}
                onChange={(e) => setSelectedKitchenId(e.target.value)}
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
              >
                <option value="all">Todas las Cocinas</option>
                {kitchens.map(k => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </select>
            </>
          )}
        </div>
      )}

      {kitchenOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <ChefHat className="w-16 h-16 text-gray-400 mb-4" />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">¡Cocina Libre!</h3>
          <p className="text-gray-500 dark:text-gray-400 mt-2">No hay pedidos pendientes por preparar para esta selección.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence>
            {kitchenOrders.map((order) => {
              const waitTime = getWaitTimeMinutes(order.created_at);
              const isUpdating = updatingId === order.id;

              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`flex flex-col rounded-xl border-2 p-4 shadow-sm transition-colors ${getCardColor(waitTime, order.status)}`}
                >
                  {/* Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        Pedido #{order.order_number || order.order_code?.substring(0, 4)}
                      </h3>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-300 flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span>{order.type === 'dine_in' ? `Mesa: ${order.table_number}` : order.type === 'delivery' ? 'Delivery' : 'Para Llevar'}</span>
                        <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                          order.source === 'waiter' 
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' 
                            : order.source === 'caja'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                            : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                        }`}>
                          {order.source === 'waiter' ? 'Mesero' : order.source === 'caja' ? 'Caja' : 'WhatsApp'}
                        </span>
                      </p>
                    </div>
                    <div className={`flex items-center font-bold ${getTimeColor(waitTime)}`}>
                      <Clock className="w-5 h-5 mr-1" />
                      {waitTime} min
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="flex-1 bg-white/60 dark:bg-gray-800/60 rounded-lg p-3 mb-4 space-y-2">
                    {order.order_items?.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start border-b border-gray-200 dark:border-gray-700 last:border-0 pb-2 last:pb-0">
                        <div className="flex gap-2">
                          <span className="font-bold text-gray-900 dark:text-white">{item.quantity}x</span>
                          <div>
                            <span className="text-gray-800 dark:text-gray-200 font-bold block">
                              {item.menu_items?.name || 'Item Desconocido'}
                            </span>
                            {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {item.selected_modifiers.map((mod: any, mIdx: number) => (
                                  <span 
                                    key={mIdx} 
                                    className="text-[10px] font-extrabold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded tracking-wide border border-amber-200/20"
                                  >
                                    + {mod.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            {item.notes && (
                              <p className="text-sm text-red-600 dark:text-red-400 font-semibold mt-1 flex items-start gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                {item.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Action Button */}
                  <button
                    disabled={isUpdating}
                    onClick={() => handleStatusChange(order.id, order.status)}
                    className={`w-full py-4 rounded-lg font-bold text-lg text-white shadow-sm transition-all flex justify-center items-center gap-2
                      ${isUpdating ? 'opacity-70 cursor-not-allowed' : 'hover:scale-[1.02]'}
                      ${order.status === 'preparing' 
                        ? 'bg-emerald-600 hover:bg-emerald-700' 
                        : 'bg-blue-600 hover:bg-blue-700'
                      }
                    `}
                  >
                    {isUpdating ? (
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : order.status === 'preparing' ? (
                      <>
                        <CheckCircle className="w-6 h-6" />
                        ¡PLATO LISTO!
                      </>
                    ) : (
                      <>
                        <ChefHat className="w-6 h-6" />
                        INICIAR PREPARACIÓN
                      </>
                    )}
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
