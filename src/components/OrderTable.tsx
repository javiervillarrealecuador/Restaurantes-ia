'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  UtensilsCrossed,
  Banknote,
  Landmark,
  ShoppingBag,
  Printer
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { ReceiptPrinter } from './ReceiptPrinter';

const getMapDestination = (address: string) => {
  if (!address) return '';
  const match = address.match(/Latitud\s*([-\d.]+),\s*Longitud\s*([-\d.]+)/);
  if (match) {
    return `${match[1]},${match[2]}`;
  }
  return address;
};

const formatOrderCode = (code: string | null): string => {
  if (!code || code.length < 13) return code || '';
  const year = code.slice(0, 4);
  const month = code.slice(4, 6);
  const day = code.slice(6, 8);
  const seq = code.slice(8);
  return `${year}-${month}-${day}-${seq}`;
};

interface OrderTableProps {
  orders: Order[];
  onUpdateStatus: (orderId: string, status: OrderStatus) => Promise<boolean>;
  onUpdatePayment: (orderId: string, isPaid: boolean) => Promise<boolean>;
  loading: boolean;
  role: string | null;
  readOnly?: boolean;
  restaurantAddress?: string;
}

export default function OrderTable({ orders, onUpdateStatus, onUpdatePayment, loading, role, readOnly = false, restaurantAddress = '' }: OrderTableProps) {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const componentRef = React.useRef<HTMLDivElement>(null);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  // Track whether we are ready to trigger print (after state settles)
  const shouldPrintRef = useRef(false);

  const handlePrintAction = useReactToPrint({
    contentRef: componentRef,
    onAfterPrint: () => setPrintingOrder(null)
  });

  // Trigger print only after printingOrder state has settled in the DOM
  useEffect(() => {
    if (printingOrder && shouldPrintRef.current) {
      shouldPrintRef.current = false;
      handlePrintAction();
    }
  }, [printingOrder, handlePrintAction]);

  const handlePrint = (order: Order) => {
    shouldPrintRef.current = true;
    setPrintingOrder(order);
  };

  const toggleExpand = (orderId: string) => {
    setExpandedOrders(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const handleStatusChange = async (orderId: string, nextStatus: OrderStatus) => {
    setUpdatingId(orderId + '-status');
    const success = await onUpdateStatus(orderId, nextStatus);
    setUpdatingId(null);
    if (!success) {
      // Browser-level fallback alert since toast is not imported here
      console.error(`Failed to update order ${orderId} status to ${nextStatus}`);
    }
  };

  const handlePaymentToggle = async (orderId: string, currentPaid: boolean) => {
    if (role === 'cocinero' || role === 'repartidor') {
      console.warn('Unauthorized payment status modification.');
      return;
    }
    setUpdatingId(orderId + '-payment');
    const success = await onUpdatePayment(orderId, !currentPaid);
    setUpdatingId(null);
    if (!success) {
      console.error(`Failed to update payment status for order ${orderId}`);
    }
  };

  // Filter orders based on status tab and search text
  const filteredOrders = orders.filter(order => {
    const matchesStatus = filterStatus === 'all' || order.status === filterStatus;
    const safeName = order.customer_name || '';
    const safePhone = order.customer_phone || '';
    const safeCode = formatOrderCode(order.order_code) || '';
    
    const matchesSearch = 
      safeName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      safePhone.includes(searchQuery) ||
      safeCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.source || 'whatsapp').toLowerCase().includes(searchQuery.toLowerCase());
      
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
      draft: 'bg-gray-500/10 text-gray-400 border border-gray-500/20',
    };

    const labels: Record<OrderStatus, string> = {
      pending: 'Pendiente',
      confirmed: 'Confirmado',
      preparing: 'Preparando',
      ready: 'Listo',
      delivering: 'En camino',
      delivered: 'Entregado',
      cancelled: 'Cancelado',
      draft: 'Borrador',
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
      <ReceiptPrinter ref={componentRef} order={printingOrder} />
      {/* Search & Tabs Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-50 dark:bg-zinc-900/10 border border-zinc-150 dark:border-zinc-850/50 p-4.5 rounded-xl">
        
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Buscar por cliente o teléfono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-3.5 pr-10 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-750 focus:border-emerald-500 text-sm text-zinc-800 dark:text-zinc-100 placeholder-zinc-550 rounded-xl outline-none transition-all"
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
                    ? 'bg-emerald-600 text-white shadow-sm' 
                    : 'bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-650 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="flex flex-col items-center justify-center py-20 bg-zinc-50 dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800/60 rounded-xl">
            <Loader2 className="h-8 w-8 text-emerald-500 animate-spin mb-3" />
            <p className="text-zinc-500 text-sm">Cargando pedidos en tiempo real...</p>
          </div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-zinc-50 dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800/60 rounded-xl text-center px-4">
          <UtensilsCrossed className="h-10 w-10 text-zinc-400 dark:text-zinc-600 mb-3" />
          <p className="text-zinc-800 dark:text-zinc-300 font-bold">No se encontraron pedidos</p>
          <p className="text-zinc-550 dark:text-zinc-450 text-xs mt-1 max-w-sm">
            {searchQuery || filterStatus !== 'all' 
              ? 'Prueba modificando tus filtros o término de búsqueda.' 
              : 'Los pedidos creados por WhatsApp se verán reflejados aquí automáticamente.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {filteredOrders.map((order) => {
            const isExpanded = expandedOrders[order.id];
            const orderTime = formatTime(order.created_at);
            const orderDate = formatFullDate(order.created_at);

            return (
              <div 
                key={order.id} 
                className={`overflow-hidden border-b border-zinc-150 dark:border-zinc-850 transition-all duration-300 ${
                  isExpanded 
                    ? 'bg-zinc-50/50 dark:bg-zinc-900/10' 
                    : 'hover:bg-zinc-50/30 dark:hover:bg-zinc-900/5'
                }`}
              >
                {/* Header Row */}
                <div 
                  onClick={() => toggleExpand(order.id)}
                  className="flex flex-wrap md:flex-nowrap items-center justify-between p-4 cursor-pointer gap-4"
                >
                  {/* Left Block: Client & Time */}
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0">
                      {getTypeIcon(order.type)}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center flex-wrap gap-1.5">
                        <span>{order.customer_name}</span>
                        {order.order_code && (
                          <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/30 px-2 py-0.5 rounded-lg select-all">
                            {formatOrderCode(order.order_code)}
                          </span>
                        )}
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-1 ${
                          order.source === 'waiter' 
                            ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-250 dark:border-blue-850/40' 
                            : order.source === 'caja'
                            ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-250 dark:border-amber-850/40'
                            : 'bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 border border-green-250 dark:border-green-850/40'
                        }`}>
                          {order.source === 'waiter' ? 'Camarero' : order.source === 'caja' ? 'Caja' : 'WhatsApp'}
                        </span>
                        
                        {/* Order Type Badge */}
                        {order.type === 'delivery' && order.delivery_address ? (
                          <a 
                            href={`https://www.google.com/maps/dir/?api=1${restaurantAddress ? `&origin=${encodeURIComponent(restaurantAddress)}` : ''}&destination=${encodeURIComponent(getMapDestination(order.delivery_address))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                            title="Abrir Ruta en Google Maps"
                          >
                            <MapPin className="h-3 w-3" /> Domicilio
                          </a>
                        ) : (
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-1 ${
                            order.type === 'dine_in' ? 'bg-pink-50 dark:bg-pink-950/20 text-pink-600 dark:text-pink-400 border border-pink-200 dark:border-pink-850/40' :
                            order.type === 'delivery' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-850/40' :
                            'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40'
                          }`}>
                            {order.type === 'dine_in' ? <Coffee className="h-3 w-3" /> : 
                             order.type === 'delivery' ? <MapPin className="h-3 w-3" /> : 
                             <ShoppingBag className="h-3 w-3" />}
                            {order.type === 'dine_in' ? 'En Mesa' : 
                             order.type === 'delivery' ? 'Domicilio' : 'Retiro local'}
                          </span>
                        )}

                        {/* Payment Method Badge */}
                        {order.payment_method === 'transfer' && order.payment_receipt_url ? (
                          <a
                            href={order.payment_receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
                            title="Ver Comprobante de Transferencia"
                          >
                            <Landmark className="h-3 w-3" /> Transferencia
                          </a>
                        ) : (
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-1 ${
                            order.payment_method === 'transfer' ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-850/40' :
                            order.payment_method === 'cash' ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-250 dark:border-amber-850/40' :
                            'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-450 border border-zinc-200 dark:border-zinc-800'
                          }`}>
                            {order.payment_method === 'transfer' ? <Landmark className="h-3 w-3" /> : 
                             order.payment_method === 'cash' ? <Banknote className="h-3 w-3" /> : 
                             <AlertCircle className="h-3 w-3" />}
                            {order.payment_method === 'transfer' ? 'Transferencia' : 
                             order.payment_method === 'cash' ? 'Efectivo' : 'Por decidir'}
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-zinc-550 dark:text-zinc-450 mt-0.5 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-650" />
                        <span>{orderDate}, {orderTime}</span>
                        <span className="text-zinc-350 dark:text-zinc-700">•</span>
                        <span>{order.customer_phone}</span>
                      </p>
                    </div>
                  </div>

                  {/* Middle Block: Items brief & Total */}
                  <div className="hidden lg:block flex-1 max-w-md mx-6">
                    <p className="text-xs text-zinc-650 dark:text-zinc-400 line-clamp-1">
                      {order.order_items?.map(item => `${item.quantity}x ${item.menu_items?.name || 'Item'}`).join(', ')}
                    </p>
                    {order.notes && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-450 italic mt-0.5 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        <span className="line-clamp-1">{order.notes}</span>
                      </p>
                    )}
                  </div>

                  {/* Right Block: Status, Price, and Actions */}
                  <div className="flex items-center gap-4 ml-auto">
                    {/* Price and Payment Status */}
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">${Number(order.total_price).toFixed(2)}</div>
                      <button
                        disabled={readOnly || role === 'cocinero' || role === 'repartidor'}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePaymentToggle(order.id, order.is_paid);
                        }}
                        className={`text-[10px] font-semibold mt-0.5 uppercase tracking-wider px-1.5 py-0.5 rounded border transition-colors ${
                          order.is_paid 
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/30' 
                            : 'bg-rose-50 dark:bg-rose-955/40 text-rose-600 dark:text-rose-455 border-rose-200 dark:border-rose-900/50 hover:bg-rose-100 dark:hover:bg-rose-900/30'
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
                    <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {getActionButton(order)}
                      <button 
                        onClick={(e) => { e.stopPropagation(); handlePrint(order); }}
                        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white dark:bg-zinc-805 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 transition-all shadow-sm"
                        title="Imprimir Ticket"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Expand icon */}
                    <div className="text-zinc-400 dark:text-zinc-655 shrink-0">
                      {isExpanded ? <ChevronUp className="h-4.5 w-4.5" /> : <ChevronDown className="h-4.5 w-4.5" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Details Panel */}
                {isExpanded && (
                  <div className="border-t border-zinc-200 dark:border-zinc-850 bg-zinc-50/30 dark:bg-zinc-955/20 px-6 py-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      
                      {/* Items details */}
                      <div className="md:col-span-2 space-y-3">
                        <h5 className="text-xs font-bold text-zinc-555 dark:text-zinc-400 uppercase tracking-widest border-b border-zinc-200 dark:border-zinc-850 pb-2">
                          Detalle del Pedido
                        </h5>
                        <div className="divide-y divide-zinc-200 dark:divide-zinc-850/60">
                          {order.order_items?.map((item) => (
                            <div key={item.id} className="py-2.5 flex justify-between items-start text-sm">
                              <div>
                                <div className="font-medium text-zinc-800 dark:text-zinc-100">
                                  {item.quantity}x {item.menu_items?.name || 'Plato del Menú'}
                                  <span className="text-zinc-500 dark:text-zinc-550 ml-2 font-normal">
                                    (${Number(item.unit_price).toFixed(2)} c/u)
                                  </span>
                                </div>
                                {item.notes && (
                                  <p className="text-xs text-amber-600 dark:text-amber-500/80 italic mt-1 flex items-start gap-1">
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                    <span>Nota: {item.notes}</span>
                                  </p>
                                )}
                              </div>
                              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                                ${(item.quantity * Number(item.unit_price)).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Customer / Order Metadata */}
                      <div className="space-y-4 bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-850 p-4 rounded-xl shadow-sm">
                        <div>
                          <h5 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-2">
                            Detalles de Entrega
                          </h5>
                          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                            {getTypeIcon(order.type)}
                            <span>{order.type === 'dine_in' ? 'Comer en Mesa' : order.type === 'delivery' ? 'Domicilio' : 'Retiro local'}</span>
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 pl-6">
                            {getTypeLabel(order)}
                          </p>
                          {order.type === 'delivery' && order.delivery_address && (
                            <a
                              href={`https://www.google.com/maps/dir/?api=1${restaurantAddress ? `&origin=${encodeURIComponent(restaurantAddress)}` : ''}&destination=${encodeURIComponent(order.delivery_address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 mt-2 ml-6 text-[10px] bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-450 border border-emerald-200 dark:border-emerald-800/30 px-2.5 py-1 rounded-lg transition-all font-medium cursor-pointer"
                            >
                              <MapPin className="h-3 w-3 shrink-0" /> Ver Ruta en Google Maps
                            </a>
                          )}
                        </div>

                        <div className="border-t border-zinc-200 dark:border-zinc-850 pt-3">
                          <h5 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-2">
                            Detalles de Pago
                          </h5>
                          <div className="space-y-1.5">
                            <p className="text-xs text-zinc-600 dark:text-zinc-350">
                              Método: <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                                {order.payment_method === 'undecided' ? 'Por decidir (Delivery)' : 
                                 order.payment_method === 'transfer' ? 'Transferencia bancaria' : 'Efectivo'}
                              </span>
                            </p>
                            <p className="text-xs text-zinc-650 dark:text-zinc-350">
                              Estado: <span className={`font-bold ${order.is_paid ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-455'}`}>
                                {order.is_paid ? 'Pagado ✅' : 'Por Pagar ❌'}
                              </span>
                            </p>
                            
                            {order.payment_method === 'transfer' && (
                              <div className="mt-2 space-y-2">
                                {order.payment_receipt_url ? (
                                  <div className="space-y-1.5">
                                    <span className="text-[10px] block text-emerald-600 dark:text-emerald-450 font-bold uppercase tracking-wider flex items-center gap-1">
                                      ¡Comprobante Subido! 
                                      <Check className="h-3 w-3" />
                                    </span>
                                    <div className="flex flex-col gap-2">
                                      <a
                                        href={order.payment_receipt_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group relative block w-full max-w-[200px] overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-750"
                                      >
                                        <img 
                                          src={order.payment_receipt_url} 
                                          alt="Comprobante de pago" 
                                          className="w-full h-32 object-cover transition-transform group-hover:scale-105"
                                        />
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                          <span className="text-white text-[10px] font-bold bg-black/60 px-2 py-1 rounded">Abrir Completo</span>
                                        </div>
                                      </a>
                                      {!order.is_paid && role !== 'cocinero' && role !== 'repartidor' && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handlePaymentToggle(order.id, order.is_paid);
                                          }}
                                          disabled={updatingId === order.id + '-payment'}
                                          className={`inline-flex items-center justify-center gap-1 text-[10px] text-white px-3 py-1.5 rounded-lg transition-all font-semibold max-w-[200px] ${
                                            updatingId === order.id + '-payment' ? 'bg-emerald-600/50 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 cursor-pointer'
                                          }`}
                                        >
                                          {updatingId === order.id + '-payment' ? (
                                            <>
                                              <Loader2 className="h-3 w-3 animate-spin" />
                                              Procesando...
                                            </>
                                          ) : (
                                            'Validar y Confirmar Pago'
                                          )}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-amber-50 dark:bg-amber-955/20 border border-amber-200 dark:border-amber-900/30 p-2 rounded-lg text-amber-600 dark:text-amber-505 text-[10px] flex items-start gap-1">
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                    <span>Esperando captura de transferencia por WhatsApp...</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {order.notes && (
                          <div className="border-t border-zinc-200 dark:border-zinc-850 pt-3">
                            <h5 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-1.5">
                              Nota General
                            </h5>
                            <p className="text-xs text-amber-600 dark:text-amber-505 bg-amber-50 dark:bg-amber-955/20 border border-amber-200 dark:border-amber-900/30 p-2 rounded-lg italic">
                              &quot;{order.notes}&quot;
                            </p>
                          </div>
                        )}

                        <div className="border-t border-zinc-200 dark:border-zinc-850 pt-3 space-y-1.5 text-xs text-zinc-550 dark:text-zinc-450">
                          <div className="flex justify-between">
                            <span>Subtotal:</span>
                            <span className="font-medium text-zinc-800 dark:text-zinc-200">${Number(order.subtotal).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>IVA (10%):</span>
                            <span className="font-medium text-zinc-800 dark:text-zinc-200">${Number(order.tax).toFixed(2)}</span>
                          </div>
                          {Number(order.delivery_fee) > 0 && (
                            <div className="flex justify-between">
                              <span>Envío:</span>
                              <span className="font-medium text-zinc-800 dark:text-zinc-200">${Number(order.delivery_fee).toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm font-bold text-zinc-900 dark:text-zinc-100 border-t border-zinc-200 dark:border-zinc-850 pt-2">
                            <span>Total del Pedido:</span>
                            <span className="text-emerald-600 dark:text-emerald-450">${Number(order.total_price).toFixed(2)}</span>
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
