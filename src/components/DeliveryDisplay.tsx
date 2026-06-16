import React from 'react';
import { Order, OrderStatus } from '@/types';
import { MapPin, CheckCircle, Navigation, Phone, Clock, ShoppingBag } from 'lucide-react';

interface DeliveryDisplayProps {
  orders: Order[];
  onUpdateStatus: (orderId: string, status: OrderStatus) => Promise<boolean>;
}

export default function DeliveryDisplay({ orders, onUpdateStatus }: DeliveryDisplayProps) {
  const readyOrders = orders.filter((o) => o.status === 'ready');
  const deliveringOrders = orders.filter((o) => o.status === 'delivering');

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getWaitTimeMinutes = (isoString: string) => {
    const diffMs = new Date().getTime() - new Date(isoString).getTime();
    return Math.floor(diffMs / 60000);
  };

  const handleOpenMaps = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
  };

  const OrderCard = ({ order, isReady }: { order: Order; isReady: boolean }) => {
    const waitTime = getWaitTimeMinutes(order.updated_at || order.created_at);
    
    return (
      <div className="bg-zinc-50/50 dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800/30 rounded-xl p-4 flex flex-col gap-4">
        {/* Header Info */}
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-emerald-500" />
              Pedido #{order.order_code ? order.order_code.substring(order.order_code.length - 4) : order.id.substring(0,4)}
            </h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">{order.customer_name}</p>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${
            isReady ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/30' : 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/30'
          }`}>
            {isReady ? 'Esperando Recogida' : 'En Ruta'}
          </div>
        </div>

        {/* Details */}
        <div className="space-y-2 bg-white dark:bg-zinc-950/40 border border-zinc-100 dark:border-zinc-900/35 rounded-lg p-3">
          <div className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
            <MapPin className="h-4 w-4 text-rose-500 shrink-0" />
            <span className="line-clamp-2">{order.delivery_address || 'Sin dirección'}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
            <Phone className="h-4 w-4 text-emerald-500 shrink-0" />
            <a href={`tel:${order.customer_phone}`} className="text-emerald-600 dark:text-emerald-400 underline">{order.customer_phone}</a>
          </div>
          <div className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
            <Clock className="h-4 w-4 text-blue-500 shrink-0" />
            <span>Esperando: <strong className={waitTime > 30 ? 'text-rose-600 dark:text-rose-400' : ''}>{waitTime} min</strong> (desde {formatTime(order.updated_at)})</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 mt-2">
          {!isReady && order.delivery_address && (
            <button
              onClick={() => handleOpenMaps(order.delivery_address!)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-white border border-zinc-200 dark:border-zinc-700 rounded-lg font-semibold transition-colors active:scale-95"
            >
              <Navigation className="h-5 w-5" />
              Abrir en Maps
            </button>
          )}

          {isReady ? (
            <button
              onClick={() => onUpdateStatus(order.id, 'delivering')}
              className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-sm transition-colors active:scale-95 text-base cursor-pointer"
            >
              <ShoppingBag className="h-5 w-5" />
              Iniciar Viaje
            </button>
          ) : (
            <button
              onClick={() => onUpdateStatus(order.id, 'delivered')}
              className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold shadow-sm transition-colors active:scale-95 text-base cursor-pointer"
            >
              <CheckCircle className="h-5 w-5" />
              Marcar Entregado
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-md mx-auto pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-zinc-850 dark:text-white">Logística de Entregas 🛵</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Gestiona tus viajes y entregas en tiempo real.</p>
      </div>

      <div className="space-y-8">
        {/* En Ruta */}
        <section>
          <h2 className="text-sm font-bold text-zinc-500 dark:text-zinc-550 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
            En Ruta ({deliveringOrders.length})
          </h2>
          {deliveringOrders.length === 0 ? (
            <div className="bg-zinc-50/50 dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800/30 rounded-xl p-6 text-center text-zinc-500 dark:text-zinc-400">
              No tienes pedidos en ruta actualmente.
            </div>
          ) : (
            <div className="space-y-4">
              {deliveringOrders.map(order => <OrderCard key={order.id} order={order} isReady={false} />)}
            </div>
          )}
        </section>

        {/* Listos para Recoger */}
        <section>
          <h2 className="text-sm font-bold text-zinc-500 dark:text-zinc-550 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500"></span>
            Listos para Recoger ({readyOrders.length})
          </h2>
          {readyOrders.length === 0 ? (
            <div className="bg-zinc-50/50 dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800/30 rounded-xl p-6 text-center text-zinc-500 dark:text-zinc-400">
              No hay pedidos listos en cocina.
            </div>
          ) : (
            <div className="space-y-4">
              {readyOrders.map(order => <OrderCard key={order.id} order={order} isReady={true} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
