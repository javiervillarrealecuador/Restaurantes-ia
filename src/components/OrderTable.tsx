'use client';

import React, { useState } from 'react';
import { Order, OrderStatus } from '@/types';
import { 
  Clock, 
  MapPin, 
  Smartphone, 
  Coffee, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  X, 
  AlertCircle, 
  Loader2, 
  UtensilsCrossed
} from 'lucide-react';

interface OrderTableProps {
  orders: Order[];
  onUpdateStatus: (orderId: string, status: OrderStatus) => Promise<boolean>;
  onUpdatePayment: (orderId: string, isPaid: boolean) => Promise<boolean>;
  loading: boolean;
  role: string | null;
  readOnly?: boolean;
}

export default function OrderTable({ orders, onUpdateStatus, onUpdatePayment, loading, role, readOnly = false }: OrderTableProps) {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const toggleExpand = (orderId: string) => {
    setExpandedOrders(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const handleStatusChange = async (orderId: string, nextStatus: OrderStatus) => {
    setUpdatingId(orderId + '-status');
    await onUpdateStatus(orderId, nextStatus);
    setUpdatingId(null);
  };

  const handlePaymentToggle = async (orderId: string, currentPaid: boolean) => {
    if (readOnly || role === 'cocinero' || role === 'repartidor') {
      console.warn('Unauthorized payment status modification.');
      return;
    }
    setUpdatingId(orderId + '-payment');
    await onUpdatePayment(orderId, !currentPaid);
    setUpdatingId(null);
  };

  // Filter orders based on status tab and search text
  const filteredOrders = orders.filter(order => {
    const matchesStatus = filterStatus === 'all' || order.status === filterStatus;
    const matchesSearch = 
      order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      order.customer_phone.includes(searchQuery);
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: OrderStatus) => {
    const styles: Record<OrderStatus, string> = {
      pending: 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
      confirmed: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
      preparing: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
      ready: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
      delivering: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
      delivered: 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20',
      cancelled: 'bg-rose-500/10 text-rose-500 border border-rose-500/20',
    };

    const labels: Record<OrderStatus, string> = {
      pending: 'Pendiente',
      confirmed: 'Confirmado',
      preparing: 'Preparando',
      ready: 'Listo',
      delivering: 'En camino',
      delivered: 'Entregado',
      cancelled: 'Cancelado',
    };

    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'dine_in':
        return <Coffee className="h-4 w-4 text-pink-400" />;
      case 'delivery':
        return <MapPin className="h-4 w-4 text-emerald-400" />;
      default:
        return <Smartphone className="h-4 w-4 text-blue-400" />;
    }
  };

  const getTypeLabel = (order: Order) => {
    switch (order.type) {
      case 'dine_in':
        return `En Mesa - Mesa ${order.table_number || 'S/N'}`;
      case 'delivery':
        return `A domicilio - ${order.delivery_address || 'Dirección no indicada'}`;
      default:
        return 'Para retirar (Takeaway)';
    }
  };

  const getActionButton = (order: Order) => {
    // Read-only mode: no action buttons shown
    if (readOnly) return null;

    const isWorking = updatingId?.startsWith(order.id);

    if (isWorking) {
      return (
        <button disabled className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-500 text-xs border border-zinc-700/50">
          <Loader2 className="h-3 w-3 animate-spin" /> Procesando
        </button>
      );
    }

    // Role restrictions for action buttons
    if (role === 'cocinero') {
      if (order.status === 'confirmed') {
        return (
          <button 
            onClick={() => handleStatusChange(order.id, 'preparing')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all shadow-md"
          >
            <Loader2 className="h-3 w-3 animate-spin" /> Preparar
          </button>
        );
      }
      if (order.status === 'preparing') {
        return (
          <button 
            onClick={() => handleStatusChange(order.id, 'ready')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all shadow-md"
          >
            <Check className="h-3.5 w-3.5" /> Listo
          </button>
        );
      }
      return null;
    }

    if (role === 'repartidor') {
      if (order.status === 'ready' && order.type === 'delivery') {
        return (
          <button 
            onClick={() => handleStatusChange(order.id, 'delivering')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-all shadow-md shadow-cyan-950/20"
          >
            <Check className="h-3.5 w-3.5" /> Despachar
          </button>
        );
      }
      if (order.status === 'delivering') {
        return (
          <button 
            onClick={() => handleStatusChange(order.id, 'delivered')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-all shadow-md"
          >
            <Check className="h-3.5 w-3.5" /> Entregar
          </button>
        );
      }
      return null;
    }

    // Default admin_general or vendedor_cajero actions
    switch (order.status) {
      case 'pending':
        if (order.payment_method === 'undecided') {
          return (
            <span className="text-[10px] text-zinc-500 bg-zinc-900 border border-zinc-850 px-2.5 py-1.5 rounded-lg font-medium select-none">
              Aguardando método pago...
            </span>
          );
        }
        if (order.payment_method === 'transfer' && !order.is_paid) {
          return (
            <div className="flex items-center gap-1.5">
              {order.payment_receipt_url ? (
                <button 
                  onClick={() => handlePaymentToggle(order.id, false)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-all shadow-md shadow-amber-950/20"
                >
                  <Check className="h-3 w-3" /> Confirmar Pago
                </button>
              ) : (
                <span className="text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg font-medium">
                  Esperando Captura
                </span>
              )}
              <button 
                onClick={() => handleStatusChange(order.id, 'cancelled')}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-rose-950/45 text-rose-455 text-xs font-medium transition-all"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        }
        return (
          <div className="flex gap-1.5">
            <button 
              onClick={() => handleStatusChange(order.id, 'confirmed')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-all shadow-md shadow-emerald-950/20"
            >
              <Check className="h-3 w-3" /> Aceptar
            </button>
            <button 
              onClick={() => handleStatusChange(order.id, 'cancelled')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-rose-950/40 text-rose-400 text-xs font-medium transition-all"
            >
              <X className="h-3 w-3" /> Rechazar
            </button>
          </div>
        );
      case 'confirmed':
        return (
          <button 
            onClick={() => handleStatusChange(order.id, 'preparing')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all shadow-md"
          >
            <Loader2 className="h-3 w-3 animate-spin" /> Preparar
          </button>
        );
      case 'preparing':
        return (
          <button 
            onClick={() => handleStatusChange(order.id, 'ready')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all shadow-md"
          >
            <Check className="h-3.5 w-3.5" /> Listo
          </button>
        );
      case 'ready':
        if (order.type === 'delivery') {
          return (
            <button 
              onClick={() => handleStatusChange(order.id, 'delivering')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-all shadow-md shadow-cyan-950/20"
            >
              <Check className="h-3.5 w-3.5" /> Despachar
            </button>
          );
        }
        return (
          <button 
            onClick={() => handleStatusChange(order.id, 'delivered')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-all shadow-md"
          >
            <Check className="h-3.5 w-3.5" /> Entregar
          </button>
        );
      case 'delivering':
        return (
          <button 
            onClick={() => handleStatusChange(order.id, 'delivered')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-all shadow-md"
          >
            <Check className="h-3.5 w-3.5" /> Entregar
          </button>
        );
      default:
        return null;
    }
  };

  const formatTime = (timeString: string) => {
    const date = new Date(timeString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatFullDate = (timeString: string) => {
    const date = new Date(timeString);
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="w-full flex flex-col space-y-4">
      {/* Search & Tabs Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-950/40 border border-zinc-800/80 p-3.5 rounded-2xl backdrop-blur-md">
        
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Buscar por cliente o teléfono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-3.5 pr-10 py-2 bg-zinc-900/60 border border-zinc-850 hover:border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm text-zinc-100 placeholder-zinc-500 rounded-xl outline-none transition-all"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-200">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          {['all', 'pending', 'confirmed', 'preparing', 'ready', 'delivering', 'delivered', 'cancelled'].map((tab) => {
            const labels: Record<string, string> = {
              all: 'Todos',
              pending: 'Pendientes',
              confirmed: 'Confirmados',
              preparing: 'Cocina',
              ready: 'Listos',
              delivering: 'En camino',
              delivered: 'Entregados',
              cancelled: 'Cancelados',
            };
            const active = filterStatus === tab;
            return (
              <button
                key={tab}
                onClick={() => setFilterStatus(tab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  active 
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/20' 
                    : 'bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-850 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Orders List / Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-zinc-950/20 border border-zinc-900 rounded-2xl">
          <Loader2 className="h-8 w-8 text-emerald-500 animate-spin mb-3" />
          <p className="text-zinc-500 text-sm">Cargando pedidos en tiempo real...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-zinc-950/20 border border-zinc-850 rounded-2xl text-center px-4">
          <UtensilsCrossed className="h-10 w-10 text-zinc-600 mb-3" />
          <p className="text-zinc-400 font-medium">No se encontraron pedidos</p>
          <p className="text-zinc-650 text-xs mt-1 max-w-sm">
            {searchQuery || filterStatus !== 'all' 
              ? 'Prueba modificando tus filtros o término de búsqueda.' 
              : 'Los pedidos creados por WhatsApp se verán reflejados aquí automáticamente.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredOrders.map((order) => {
            const isExpanded = expandedOrders[order.id];
            const orderTime = formatTime(order.created_at);
            const orderDate = formatFullDate(order.created_at);

            return (
              <div 
                key={order.id} 
                className={`overflow-hidden rounded-2xl border transition-all duration-300 ${
                  isExpanded 
                    ? 'bg-zinc-900/70 border-zinc-700/60 shadow-xl' 
                    : 'bg-zinc-950/40 hover:bg-zinc-900/40 border-zinc-850 hover:border-zinc-800'
                }`}
              >
                {/* Header Row */}
                <div 
                  onClick={() => toggleExpand(order.id)}
                  className="flex flex-wrap md:flex-nowrap items-center justify-between p-4 cursor-pointer gap-4"
                >
                  {/* Left Block: Client & Time */}
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                      {getTypeIcon(order.type)}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-100 flex items-center flex-wrap gap-1.5">
                        <span>{order.customer_name}</span>
                        {order.order_code && (
                          <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-900/30 px-2 py-0.5 rounded-lg select-all">
                            {order.order_code}
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-zinc-600" />
                        <span>{orderDate}, {orderTime}</span>
                        <span className="text-zinc-700">•</span>
                        <span>{order.customer_phone}</span>
                      </p>
                    </div>
                  </div>

                  {/* Middle Block: Items brief & Total */}
                  <div className="hidden lg:block flex-1 max-w-md mx-6">
                    <p className="text-xs text-zinc-400 line-clamp-1">
                      {order.order_items?.map(item => `${item.quantity}x ${item.menu_items?.name || 'Item'}`).join(', ')}
                    </p>
                    {order.notes && (
                      <p className="text-[11px] text-amber-500/80 italic mt-0.5 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        <span className="line-clamp-1">{order.notes}</span>
                      </p>
                    )}
                  </div>

                  {/* Right Block: Status, Price, and Actions */}
                  <div className="flex items-center gap-4 ml-auto">
                    {/* Price and Payment Status */}
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-zinc-100">${Number(order.total_price).toFixed(2)}</div>
                      <button
                        disabled={readOnly || role === 'cocinero' || role === 'repartidor'}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePaymentToggle(order.id, order.is_paid);
                        }}
                        className={`text-[10px] font-semibold mt-0.5 uppercase tracking-wider px-1.5 py-0.5 rounded border transition-colors ${
                          order.is_paid 
                            ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/50 hover:bg-emerald-900/30' 
                            : 'bg-rose-950/40 text-rose-400 border-rose-900/50 hover:bg-rose-900/30'
                        } ${ (readOnly || role === 'cocinero' || role === 'repartidor') ? 'opacity-50 cursor-not-allowed' : '' }`}
                      >
                        {order.is_paid ? 'Pagado' : 'Por Pagar'}
                      </button>
                    </div>

                    {/* Status Badge */}
                    <div className="shrink-0">
                      {getStatusBadge(order.status)}
                    </div>

                    {/* Action buttons */}
                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      {getActionButton(order)}
                    </div>

                    {/* Expand icon */}
                    <div className="text-zinc-650 shrink-0">
                      {isExpanded ? <ChevronUp className="h-4.5 w-4.5" /> : <ChevronDown className="h-4.5 w-4.5" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Details Panel */}
                {isExpanded && (
                  <div className="border-t border-zinc-800 bg-zinc-900/30 px-6 py-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      
                      {/* Items details */}
                      <div className="md:col-span-2 space-y-3">
                        <h5 className="text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-850 pb-2">
                          Detalle del Pedido
                        </h5>
                        <div className="divide-y divide-zinc-850/60">
                          {order.order_items?.map((item) => (
                            <div key={item.id} className="py-2.5 flex justify-between items-start text-sm">
                              <div>
                                <div className="font-medium text-zinc-100">
                                  {item.quantity}x {item.menu_items?.name || 'Plato del Menú'}
                                  <span className="text-zinc-650 ml-2 font-normal">
                                    (${Number(item.unit_price).toFixed(2)} c/u)
                                  </span>
                                </div>
                                {item.notes && (
                                  <p className="text-xs text-amber-500/80 italic mt-1 flex items-start gap-1">
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                    <span>Nota: {item.notes}</span>
                                  </p>
                                )}
                              </div>
                              <span className="font-semibold text-zinc-200">
                                ${(item.quantity * Number(item.unit_price)).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Customer / Order Metadata */}
                      <div className="space-y-4 bg-zinc-900/60 border border-zinc-850 p-4 rounded-xl">
                        <div>
                          <h5 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">
                            Detalles de Entrega
                          </h5>
                          <p className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                            {getTypeIcon(order.type)}
                            <span>{order.type === 'dine_in' ? 'Comer en Mesa' : order.type === 'delivery' ? 'Domicilio' : 'Retiro local'}</span>
                          </p>
                          <p className="text-xs text-zinc-400 mt-1 pl-6">
                            {getTypeLabel(order)}
                          </p>
                          {order.type === 'delivery' && order.delivery_address && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 mt-2 ml-6 text-[10px] bg-emerald-650/15 hover:bg-emerald-600/25 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-lg transition-all font-medium cursor-pointer"
                            >
                              <MapPin className="h-3 w-3 shrink-0" /> Ver en Google Maps
                            </a>
                          )}
                        </div>

                        <div className="border-t border-zinc-850 pt-3">
                          <h5 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">
                            Detalles de Pago
                          </h5>
                          <div className="space-y-1.5">
                            <p className="text-xs text-zinc-300">
                              Método: <span className="font-semibold text-zinc-150">
                                {order.payment_method === 'undecided' ? 'Por decidir (Delivery)' : 
                                 order.payment_method === 'transfer' ? 'Transferencia bancaria' : 'Efectivo'}
                              </span>
                            </p>
                            <p className="text-xs text-zinc-300">
                              Estado: <span className={`font-bold ${order.is_paid ? 'text-emerald-400' : 'text-rose-450'}`}>
                                {order.is_paid ? 'Pagado ✅' : 'Por Pagar ❌'}
                              </span>
                            </p>
                            
                            {order.payment_method === 'transfer' && (
                              <div className="mt-2 space-y-2">
                                {order.payment_receipt_url ? (
                                  <div className="space-y-1.5">
                                    <span className="text-[10px] block text-emerald-450 font-bold uppercase tracking-wider">¡Comprobante Subido!</span>
                                    <div className="flex gap-2">
                                      <a
                                        href={order.payment_receipt_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-750 px-2 py-1 rounded-lg transition-all font-medium cursor-pointer"
                                      >
                                        Ver Comprobante
                                      </a>
                                      {!order.is_paid && role !== 'cocinero' && role !== 'repartidor' && (
                                        <button
                                          onClick={() => handlePaymentToggle(order.id, order.is_paid)}
                                          className="inline-flex items-center gap-1 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded-lg transition-all font-semibold cursor-pointer"
                                        >
                                          Confirmar Pago
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-amber-550/5 border border-amber-500/10 p-2 rounded-lg text-amber-500 text-[10px] flex items-start gap-1">
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                    <span>Esperando captura de transferencia por WhatsApp...</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {order.notes && (
                          <div className="border-t border-zinc-850 pt-3">
                            <h5 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                              Nota General
                            </h5>
                            <p className="text-xs text-amber-500 bg-amber-500/5 border border-amber-500/10 p-2 rounded-lg italic">
                              &quot;{order.notes}&quot;
                            </p>
                          </div>
                        )}

                        <div className="border-t border-zinc-850 pt-3 space-y-1.5 text-xs text-zinc-400">
                          <div className="flex justify-between">
                            <span>Subtotal:</span>
                            <span className="font-medium text-zinc-250">${Number(order.subtotal).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>IVA (10%):</span>
                            <span className="font-medium text-zinc-250">${Number(order.tax).toFixed(2)}</span>
                          </div>
                          {Number(order.delivery_fee) > 0 && (
                            <div className="flex justify-between">
                              <span>Envío:</span>
                              <span className="font-medium text-zinc-250">${Number(order.delivery_fee).toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm font-bold text-zinc-100 border-t border-zinc-850 pt-2">
                            <span>Total del Pedido:</span>
                            <span className="text-emerald-400">${Number(order.total_price).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
