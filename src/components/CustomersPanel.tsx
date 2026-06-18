'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
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
import { toast } from 'sonner';

interface CustomersPanelProps {
  restaurantId: string;
  orders: Order[]; // Keep this for history, but we fetch aggregate stats
  loading: boolean;
}

interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: string;
  preference: 'dine_in' | 'delivery' | 'pickup' | string;
  history: Order[];
}

export default function CustomersPanel({ restaurantId, orders, loading }: CustomersPanelProps) {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'spent' | 'count' | 'date'>('spent');
  const [expandedPhones, setExpandedPhones] = useState<Record<string, boolean>>({});
  const [dbCustomers, setDbCustomers] = useState<any[]>([]);

  useEffect(() => {
    if (!restaurantId) return;
    const fetchCustomers = async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone, total_orders, total_spent, last_visit, created_at, preferences')
        .eq('restaurant_id', restaurantId);
      if (error) {
        console.error('Error fetching customers:', error);
        toast.error('Error al cargar clientes');
      } else {
        setDbCustomers(data || []);
      }
    };
    fetchCustomers();
  }, [restaurantId, orders.length]); // Re-fetch when restaurant changes or new orders come in

  const toggleExpand = (phone: string) => {
    setExpandedPhones(prev => ({
      ...prev,
      [phone]: !prev[phone]
    }));
  };

  // Combine DB stats with order history
  const customers = useMemo(() => {
    const profiles: Record<string, CustomerProfile> = {};

    // Build a Map for O(1) lookups instead of O(n²) array.find() calls
    const dbCustomerMap = new Map(dbCustomers.map(c => [c.phone, c]));

    // Initialize with DB data if available
    dbCustomers.forEach(c => {
      if (!c.phone) return; // Skip null/undefined phones
      profiles[c.phone] = {
        id: c.id,
        name: c.name || 'Cliente WhatsApp',
        phone: c.phone,
        orderCount: c.total_orders || 0,
        totalSpent: Number(c.total_spent) || 0,
        lastOrderDate: c.last_visit || c.created_at,
        preference: c.preferences || 'pickup',
        history: []
      };
    });

    // Populate history and fallback stats from orders
    orders.forEach(order => {
      const phone = order.customer_phone;
      if (!phone) return; // Guard against null/undefined phone — don't group as 'null'
      
      if (!profiles[phone]) {
        profiles[phone] = {
          id: phone,
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
      prof.history.push(order);
      
      // If not in DB, fallback to calculate — O(1) with Map
      if (!dbCustomerMap.has(phone)) {
        prof.orderCount += 1;
        if (order.status !== 'cancelled') {
          prof.totalSpent += Number(order.total_price);
        }
        const orderDate = order.created_at ? new Date(order.created_at) : null;
        const lastDate = prof.lastOrderDate ? new Date(prof.lastOrderDate) : null;
        if (orderDate && (!lastDate || orderDate > lastDate)) {
          prof.lastOrderDate = order.created_at;
          prof.name = order.customer_name;
        }
      }
    });

    // Determine preferences based on history if not set in DB — O(1) with Map
    Object.values(profiles).forEach(prof => {
      if (!dbCustomerMap.has(prof.phone) || !prof.preference || prof.preference === 'pickup') {
        const counts = { dine_in: 0, delivery: 0, pickup: 0 };
        prof.history.forEach(o => {
          counts[o.type as keyof typeof counts] = (counts[o.type as keyof typeof counts] || 0) + 1;
        });

        if (counts.delivery >= counts.dine_in && counts.delivery >= counts.pickup) {
          prof.preference = 'delivery';
        } else if (counts.dine_in >= counts.delivery && counts.dine_in >= counts.pickup) {
          prof.preference = 'dine_in';
        } else {
          prof.preference = 'pickup';
        }
      }
    });

    return Object.values(profiles);
  }, [orders, dbCustomers]);

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

  const getPreferenceBadge = (pref: string) => {
    const configs: Record<string, any> = {
      dine_in: { label: 'Mesa', icon: <Coffee className="h-3 w-3" />, style: 'bg-pink-50 dark:bg-pink-950/20 text-pink-600 dark:text-pink-400 border border-pink-200 dark:border-pink-800/40' },
      delivery: { label: 'Delivery', icon: <MapPin className="h-3 w-3" />, style: 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40' },
      pickup: { label: 'Llevar', icon: <Smartphone className="h-3 w-3" />, style: 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40' }
    };
    const c = configs[pref] || configs.pickup;
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-50 dark:bg-zinc-900/10 border border-zinc-150 dark:border-zinc-850/50 p-4.5 rounded-xl">
        
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Buscar cliente por nombre o teléfono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-3.5 pr-10 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-750 focus:border-emerald-500 text-sm text-zinc-800 dark:text-zinc-100 placeholder-zinc-550 rounded-xl outline-none transition-all"
          />
          <Search className="absolute right-3.5 top-2.5 h-4 w-4 text-zinc-500" />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-550 dark:text-zinc-400 flex items-center gap-1 font-medium">
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
                    ? 'bg-emerald-600 text-white' 
                    : 'bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
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
        <div className="text-center py-20 bg-zinc-50 dark:bg-zinc-900/10 border border-zinc-200 dark:border-gray-850 rounded-xl">
          <p className="text-zinc-500 text-sm">Cargando base de clientes...</p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="text-center py-20 bg-zinc-50 dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800/60 rounded-xl px-4">
          <User className="h-10 w-10 text-zinc-450 dark:text-zinc-650 mx-auto mb-3" />
          <p className="text-zinc-800 dark:text-zinc-250 font-bold">No se encontraron clientes</p>
          <p className="text-zinc-500 dark:text-zinc-450 text-xs mt-1">
            Los clientes que realicen pedidos mediante WhatsApp se registrarán en esta sección.
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {filteredCustomers.map((cust) => {
            const isExpanded = expandedPhones[cust.phone];

            return (
              <div 
                key={cust.phone}
                className={`border-b border-zinc-150 dark:border-zinc-850 transition-all duration-300 ${
                  isExpanded 
                    ? 'bg-zinc-50/50 dark:bg-zinc-900/10' 
                    : 'hover:bg-zinc-50/30 dark:hover:bg-zinc-900/5'
                }`}
              >
                {/* Header Information */}
                <div 
                  onClick={() => toggleExpand(cust.phone)}
                  className="p-4 flex flex-wrap md:flex-nowrap items-center justify-between gap-4 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-600/20 to-teal-500/20 border border-emerald-250 dark:border-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 font-bold">
                      {cust.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{cust.name}</h4>
                      <p className="text-xs text-zinc-550 dark:text-zinc-450 mt-0.5 flex items-center gap-1.5">
                        <Phone className="h-3 w-3" />
                        <span>{cust.phone}</span>
                      </p>
                    </div>
                  </div>

                  {/* Customer stats */}
                  <div className="flex items-center gap-6 md:gap-10 ml-auto">
                    {/* Orders count */}
                    <div className="text-center md:text-left">
                      <p className="text-[10px] text-zinc-450 dark:text-zinc-500 font-bold uppercase tracking-wider">Pedidos</p>
                      <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mt-0.5 flex items-center gap-1 justify-center md:justify-start">
                        <ShoppingBag className="h-3.5 w-3.5 text-zinc-450 dark:text-zinc-500" />
                        {cust.orderCount}
                      </p>
                    </div>

                    {/* Total spent */}
                    <div className="text-center md:text-left">
                      <p className="text-[10px] text-zinc-450 dark:text-zinc-500 font-bold uppercase tracking-wider">Total Compras</p>
                      <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-0.5 justify-center md:justify-start">
                        <DollarSign className="h-3.5 w-3.5 shrink-0" />
                        {cust.totalSpent.toFixed(2)}
                      </p>
                    </div>

                    {/* Preferences */}
                    <div className="hidden sm:block text-left">
                      <p className="text-[10px] text-zinc-450 dark:text-zinc-500 font-bold uppercase tracking-wider mb-1">Preferencia</p>
                      {getPreferenceBadge(cust.preference)}
                    </div>

                    {/* Last purchase date */}
                    <div className="hidden lg:block text-left">
                      <p className="text-[10px] text-zinc-450 dark:text-zinc-500 font-bold uppercase tracking-wider">Última compra</p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-355 mt-1 flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-zinc-450 dark:text-zinc-600" />
                        {formatDate(cust.lastOrderDate)}
                      </p>
                    </div>

                    {/* Expand icon */}
                    <div className="text-zinc-400 dark:text-zinc-600 shrink-0">
                      {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                  </div>
                </div>

                {/* Expanded customer orders timeline */}
                {isExpanded && (
                  <div className="border-t border-zinc-200 dark:border-zinc-850/60 bg-zinc-50/30 dark:bg-zinc-950/20 p-5 space-y-4">
                    <h5 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest border-b border-zinc-200 dark:border-zinc-800/60 pb-2">
                      Historial de Pedidos ({cust.history.length})
                    </h5>
                    
                    <div className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
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
                            className="py-3 flex items-center justify-between text-sm transition-colors"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                                  ${Number(order.total_price).toFixed(2)}
                                </span>
                                <span className="text-zinc-350 dark:text-zinc-700">•</span>
                                <span className="text-xs text-zinc-550 dark:text-zinc-400">{orderDate}</span>
                                <span className="text-zinc-355 dark:text-zinc-700">•</span>
                                <span className="text-[10px] uppercase font-semibold tracking-wider text-zinc-500">
                                  {order.type === 'dine_in' ? 'Mesa' : order.type === 'delivery' ? 'Delivery' : 'Llevar'}
                                </span>
                              </div>
                              <p className="text-xs text-zinc-500 dark:text-zinc-450">
                                {order.order_items?.map(it => `${it.quantity}x ${it.menu_items?.name}`).join(', ')}
                              </p>
                            </div>

                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                              order.status === 'delivered' 
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                                : order.status === 'cancelled'
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-455 border-rose-500/20'
                                : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-650 dark:text-zinc-450 border border-zinc-200 dark:border-zinc-800'
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
