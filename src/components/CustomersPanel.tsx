'use client';

import React, { useState, useMemo } from 'react';
import { Order } from '@/types';
import { 
  User, 
  Phone, 
  ShoppingBag, 
  DollarSign, 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  Search,
  ArrowUpDown,
  Smartphone,
  MapPin,
  Coffee
} from 'lucide-react';

interface CustomersPanelProps {
  orders: Order[];
  loading: boolean;
}

interface CustomerProfile {
  name: string;
  phone: string;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: string;
  preference: 'dine_in' | 'delivery' | 'pickup';
  history: Order[];
}

export default function CustomersPanel({ orders, loading }: CustomersPanelProps) {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'spent' | 'count' | 'date'>('spent');
  const [expandedPhones, setExpandedPhones] = useState<Record<string, boolean>>({});

  const toggleExpand = (phone: string) => {
    setExpandedPhones(prev => ({
      ...prev,
      [phone]: !prev[phone]
    }));
  };

  // Process orders into customer profiles
  const customers = useMemo(() => {
    const profiles: Record<string, CustomerProfile> = {};

    orders.forEach(order => {
      const phone = order.customer_phone;
      
      if (!profiles[phone]) {
        profiles[phone] = {
          name: order.customer_name,
          phone: phone,
          orderCount: 0,
          totalSpent: 0,
          lastOrderDate: order.created_at,
          preference: 'pickup',
          history: []
        };
      }

      const prof = profiles[phone];
      prof.orderCount += 1;
      
      // Only count revenue from non-cancelled orders for total spent
      if (order.status !== 'cancelled') {
        prof.totalSpent += Number(order.total_price);
      }

      // Track history
      prof.history.push(order);

      // Latest order date
      if (new Date(order.created_at) > new Date(prof.lastOrderDate)) {
        prof.lastOrderDate = order.created_at;
        prof.name = order.customer_name; // update to newest name if changed
      }
    });

    // Determine preferences
    Object.values(profiles).forEach(prof => {
      const counts = { dine_in: 0, delivery: 0, pickup: 0 };
      prof.history.forEach(o => {
        counts[o.type] = (counts[o.type] || 0) + 1;
      });

      if (counts.delivery >= counts.dine_in && counts.delivery >= counts.pickup) {
        prof.preference = 'delivery';
      } else if (counts.dine_in >= counts.delivery && counts.dine_in >= counts.pickup) {
        prof.preference = 'dine_in';
      } else {
        prof.preference = 'pickup';
      }
    });

    return Object.values(profiles);
  }, [orders]);

  // Filter and Sort customers
  const filteredCustomers = useMemo(() => {
    return customers
      .filter(cust => 
        cust.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        cust.phone.includes(searchQuery)
      )
      .sort((a, b) => {
        if (sortBy === 'spent') {
          return b.totalSpent - a.totalSpent;
        } else if (sortBy === 'count') {
          return b.orderCount - a.orderCount;
        } else {
          return new Date(b.lastOrderDate).getTime() - new Date(a.lastOrderDate).getTime();
        }
      });
  }, [customers, searchQuery, sortBy]);

  const getPreferenceBadge = (pref: 'dine_in' | 'delivery' | 'pickup') => {
    const configs = {
      dine_in: { label: 'Mesa', icon: <Coffee className="h-3 w-3" />, style: 'bg-pink-500/10 text-pink-400 border border-pink-500/20' },
      delivery: { label: 'Delivery', icon: <MapPin className="h-3 w-3" />, style: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
      pickup: { label: 'Llevar', icon: <Smartphone className="h-3 w-3" />, style: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' }
    };
    const c = configs[pref];
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${c.style}`}>
        {c.icon} {c.label}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="w-full flex flex-col space-y-4">
      {/* Search & Sort Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-950/40 border border-zinc-800/80 p-3.5 rounded-2xl backdrop-blur-md">
        
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Buscar cliente por nombre o teléfono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-3.5 pr-10 py-2 bg-zinc-900/60 border border-zinc-850 hover:border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm text-zinc-100 placeholder-zinc-500 rounded-xl outline-none transition-all"
          />
          <Search className="absolute right-3.5 top-2.5 h-4 w-4 text-zinc-500" />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-550 flex items-center gap-1 font-medium">
            <ArrowUpDown className="h-3.5 w-3.5" /> Ordenar por:
          </span>
          <div className="flex items-center gap-1.5">
            {[
              { id: 'spent', label: 'Más Gastado' },
              { id: 'count', label: 'Frecuencia' },
              { id: 'date', label: 'Última Compra' }
            ].map(btn => (
              <button
                key={btn.id}
                onClick={() => setSortBy(btn.id as 'spent' | 'count' | 'date')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  sortBy === btn.id 
                    ? 'bg-zinc-850 text-emerald-400 border border-zinc-700 shadow-md' 
                    : 'bg-zinc-900/40 border border-zinc-850 hover:bg-zinc-800 text-zinc-400'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid Content */}
      {loading ? (
        <div className="text-center py-20 bg-zinc-950/20 border border-zinc-900 rounded-2xl">
          <p className="text-zinc-500 text-sm">Cargando base de clientes...</p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="text-center py-20 bg-zinc-950/20 border border-zinc-850 rounded-2xl px-4">
          <User className="h-10 w-10 text-zinc-650 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium">No se encontraron clientes</p>
          <p className="text-zinc-650 text-xs mt-1">
            Los clientes que realicen pedidos mediante WhatsApp se registrarán en esta sección.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredCustomers.map((cust) => {
            const isExpanded = expandedPhones[cust.phone];

            return (
              <div 
                key={cust.phone}
                className={`border rounded-2xl overflow-hidden transition-all duration-300 ${
                  isExpanded 
                    ? 'bg-zinc-900/60 border-zinc-700 shadow-xl' 
                    : 'bg-zinc-950/40 hover:bg-zinc-900/40 border-zinc-850 hover:border-zinc-800'
                }`}
              >
                {/* Header Information */}
                <div 
                  onClick={() => toggleExpand(cust.phone)}
                  className="p-4 flex flex-wrap md:flex-nowrap items-center justify-between gap-4 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-600/20 to-teal-500/20 border border-emerald-950 flex items-center justify-center text-emerald-400 shrink-0 font-bold">
                      {cust.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-100">{cust.name}</h4>
                      <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1.5">
                        <Phone className="h-3 w-3" />
                        <span>{cust.phone}</span>
                      </p>
                    </div>
                  </div>

                  {/* Customer stats */}
                  <div className="flex items-center gap-6 md:gap-10 ml-auto">
                    {/* Orders count */}
                    <div className="text-center md:text-left">
                      <p className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider">Pedidos</p>
                      <p className="text-sm font-bold text-zinc-200 mt-0.5 flex items-center gap-1 justify-center md:justify-start">
                        <ShoppingBag className="h-3.5 w-3.5 text-zinc-500" />
                        {cust.orderCount}
                      </p>
                    </div>

                    {/* Total spent */}
                    <div className="text-center md:text-left">
                      <p className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider">Total Compras</p>
                      <p className="text-sm font-bold text-emerald-400 mt-0.5 flex items-center gap-0.5 justify-center md:justify-start">
                        <DollarSign className="h-3.5 w-3.5 shrink-0" />
                        {cust.totalSpent.toFixed(2)}
                      </p>
                    </div>

                    {/* Preferences */}
                    <div className="hidden sm:block text-left">
                      <p className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider mb-1">Preferencia</p>
                      {getPreferenceBadge(cust.preference)}
                    </div>

                    {/* Last purchase date */}
                    <div className="hidden lg:block text-left">
                      <p className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider">Última compra</p>
                      <p className="text-xs text-zinc-350 mt-1 flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-zinc-650" />
                        {formatDate(cust.lastOrderDate)}
                      </p>
                    </div>

                    {/* Expand icon */}
                    <div className="text-zinc-650 shrink-0">
                      {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                  </div>
                </div>

                {/* Expanded customer orders timeline */}
                {isExpanded && (
                  <div className="border-t border-zinc-800 bg-zinc-900/30 p-5 space-y-4">
                    <h5 className="text-xs font-bold text-zinc-450 uppercase tracking-widest border-b border-zinc-850 pb-2">
                      Historial de Pedidos ({cust.history.length})
                    </h5>
                    
                    <div className="space-y-3">
                      {cust.history.map((order) => {
                        const orderDate = new Date(order.created_at).toLocaleDateString('es-ES', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        });

                        return (
                          <div 
                            key={order.id}
                            className="bg-zinc-900/50 border border-zinc-850/60 p-3.5 rounded-xl flex items-center justify-between text-sm hover:border-zinc-800 transition-colors"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-zinc-200">
                                  ${Number(order.total_price).toFixed(2)}
                                </span>
                                <span className="text-zinc-700">•</span>
                                <span className="text-xs text-zinc-400">{orderDate}</span>
                                <span className="text-zinc-700">•</span>
                                <span className="text-[10px] uppercase font-semibold tracking-wider text-zinc-500">
                                  {order.type === 'dine_in' ? 'Mesa' : order.type === 'delivery' ? 'Delivery' : 'Llevar'}
                                </span>
                              </div>
                              <p className="text-xs text-zinc-500">
                                {order.order_items?.map(it => `${it.quantity}x ${it.menu_items?.name}`).join(', ')}
                              </p>
                            </div>

                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                              order.status === 'delivered' 
                                ? 'bg-emerald-950/20 text-emerald-400 border-emerald-950/60' 
                                : order.status === 'cancelled'
                                ? 'bg-rose-950/20 text-rose-400 border-rose-950/60'
                                : 'bg-zinc-850 text-zinc-400 border-zinc-800'
                            }`}>
                              {order.status}
                            </span>
                          </div>
                        );
                      })}
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
