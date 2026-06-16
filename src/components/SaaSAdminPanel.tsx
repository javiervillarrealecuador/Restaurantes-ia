'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { 
  ShieldCheck, 
  Building, 
  Receipt, 
  Plus, 
  CreditCard, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp, 
  UserPlus, 
  Loader2, 
  X, 
  Search, 
  FileText, 
  Check,
  Percent,
  RefreshCw,
  Ban,
  Play
} from 'lucide-react';

interface RestaurantStats {
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  currentPeriodDelivered: number;
  cancellationRate: number;
  unbilledAmount: number;
}

interface SaaSInterfaceRestaurant {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  status: 'active' | 'suspended' | 'trial';
  cost_per_order: number;
  prepaid_credits: number;
  created_at: string;
  stats?: RestaurantStats;
}

interface SaaSInterfaceInvoice {
  id: string;
  restaurant_id: string;
  period_start: string;
  period_end: string;
  orders_delivered: number;
  cost_per_order: number;
  total_amount: number;
  status: 'pending' | 'paid' | 'overdue';
  created_at: string;
  restaurants?: {
    name: string;
  };
}

export default function SaaSAdminPanel() {
  const [activeSubTab, setActiveSubTab] = useState<'restaurants' | 'invoices'>('restaurants');
  const [restaurants, setRestaurants] = useState<SaaSInterfaceRestaurant[]>([]);
  const [invoices, setInvoices] = useState<SaaSInterfaceInvoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal State - Register Restaurant
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newRestName, setNewRestName] = useState('');
  const [newRestSlug, setNewRestSlug] = useState('');
  const [newRestPhone, setNewRestPhone] = useState('');
  const [newRestEmail, setNewRestEmail] = useState('');
  const [newRestAddress, setNewRestAddress] = useState('');
  const [newRestCost, setNewRestCost] = useState('0.10');
  const [newRestCredits, setNewRestCredits] = useState('0');
  const [newRestAdminName, setNewRestAdminName] = useState('');
  const [newRestAdminEmail, setNewRestAdminEmail] = useState('');
  const [newRestAdminPass, setNewRestAdminPass] = useState('');
  const [addLoading, setAddLoading] = useState<boolean>(false);

  // Modal State - Edit Billing Options
  const [editingRestaurant, setEditingRestaurant] = useState<SaaSInterfaceRestaurant | null>(null);
  const [editCost, setEditCost] = useState('0.10');
  const [editCredits, setEditCredits] = useState('0');
  const [editStatus, setEditStatus] = useState<'active' | 'suspended' | 'trial'>('active');
  const [editLoading, setEditLoading] = useState<boolean>(false);

  // Modal State - Generate Invoice (Close Cycle)
  const [invoiceRestaurant, setInvoiceRestaurant] = useState<SaaSInterfaceRestaurant | null>(null);
  const [invStartDate, setInvStartDate] = useState('');
  const [invEndDate, setInvEndDate] = useState('');
  const [invLoading, setInvLoading] = useState<boolean>(false);

  // Fetch Data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Sesión no encontrada');

      // Fetch Restaurants
      const restRes = await fetch('/api/saas/restaurants', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const restData = await restRes.json();
      if (!restRes.ok) throw new Error(restData.error || 'Error al obtener restaurantes');
      setRestaurants(restData.restaurants || []);

      // Fetch Invoices
      const invRes = await fetch('/api/saas/invoices', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const invData = await invRes.json();
      if (!invRes.ok) throw new Error(invData.error || 'Error al obtener facturas');
      setInvoices(invData.invoices || []);

    } catch (err: any) {
      toast.error(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Auto-set dates for invoice generation dialog (past month)
    const now = new Date();
    const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    
    setInvStartDate(firstDayPrevMonth.toISOString().split('T')[0]);
    setInvEndDate(lastDayPrevMonth.toISOString().split('T')[0]);
  }, [fetchData]);

  // Handle Add Restaurant
  const handleAddRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch('/api/saas/restaurants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newRestName.trim(),
          slug: newRestSlug.trim().toLowerCase().replace(/\s+/g, '-'),
          address: newRestAddress.trim(),
          phone: newRestPhone.trim(),
          email: newRestEmail.trim(),
          costPerOrder: Number(newRestCost),
          prepaidCredits: parseInt(newRestCredits, 10),
          adminName: newRestAdminName.trim(),
          adminEmail: newRestAdminEmail.trim(),
          adminPassword: newRestAdminPass
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');

      toast.success('Restaurante y administrador registrados correctamente');
      setShowAddModal(false);
      
      // Reset forms
      setNewRestName('');
      setNewRestSlug('');
      setNewRestPhone('');
      setNewRestEmail('');
      setNewRestAddress('');
      setNewRestCost('0.10');
      setNewRestCredits('0');
      setNewRestAdminName('');
      setNewRestAdminEmail('');
      setNewRestAdminPass('');
      
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Error al registrar restaurante');
    } finally {
      setAddLoading(false);
    }
  };

  // Handle Edit Billing Options
  const handleEditBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRestaurant) return;
    setEditLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`/api/saas/restaurants/${editingRestaurant.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          cost_per_order: Number(editCost),
          prepaid_credits: parseInt(editCredits, 10),
          status: editStatus
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar');

      toast.success('Facturación del restaurante actualizada correctamente');
      setEditingRestaurant(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar');
    } finally {
      setEditLoading(false);
    }
  };

  // Toggle Restaurant Suspension directly
  const handleToggleStatus = async (restaurant: SaaSInterfaceRestaurant) => {
    const newStatus = restaurant.status === 'suspended' ? 'active' : 'suspended';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`/api/saas/restaurants/${restaurant.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al cambiar estado');
      }

      toast.success(newStatus === 'active' ? 'Restaurante reactivado' : 'Restaurante suspendido');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Error al cambiar estado');
    }
  };

  // Close Billing Cycle (Generate Invoice)
  const handleGenerateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceRestaurant) return;
    setInvLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch('/api/saas/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          restaurantId: invoiceRestaurant.id,
          periodStart: new Date(invStartDate).toISOString(),
          periodEnd: new Date(invEndDate + 'T23:59:59').toISOString()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al generar factura');

      toast.success('Factura generada exitosamente. Se cerró el ciclo seleccionado.');
      setInvoiceRestaurant(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Error al generar factura');
    } finally {
      setInvLoading(false);
    }
  };

  // Mark Invoice as Paid
  const handleMarkInvoicePaid = async (invoiceId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`/api/saas/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'paid' })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al registrar pago');
      }

      toast.success('Pago confirmado y registrado en la factura');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Error al registrar pago');
    }
  };

  // Filter restaurants by search query
  const filteredRestaurants = restaurants.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    r.slug.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (r.email && r.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Compute overall KPI stats
  const totalRevenue = invoices
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + Number(i.total_amount), 0);

  const pendingRevenue = invoices
    .filter(i => i.status === 'pending')
    .reduce((sum, i) => sum + Number(i.total_amount), 0);

  const totalDeliveredOrdersAllTime = restaurants.reduce((sum, r) => sum + (r.stats?.deliveredOrders || 0), 0);
  
  const totalActiveRestaurants = restaurants.filter(r => r.status === 'active' || r.status === 'trial').length;
  const totalSuspendedRestaurants = restaurants.filter(r => r.status === 'suspended').length;

  if (loading && restaurants.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-900/10 min-h-[500px]">
        <Loader2 className="h-10 w-10 text-violet-500 animate-spin mb-4" />
        <p className="text-zinc-400 text-sm">Cargando métricas de la plataforma SaaS...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-6 max-w-7xl mx-auto text-zinc-800 dark:text-zinc-150">
      
      {/* SaaS Admin Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-200 dark:border-zinc-800/50 pb-6">
        <div>
          <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400 font-bold text-xs uppercase tracking-widest mb-1.5">
            <ShieldCheck className="h-4 w-4" />
            <span>SaaS Super Admin Platform</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-zinc-950 dark:text-white">Consola de Control de Restaurantes</h2>
          <p className="text-xs text-zinc-550 dark:text-zinc-400 mt-1">Monitorea suscripciones, créditos prepagos, tasas de cancelación y cobros por WhatsApp.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
            onClick={fetchData}
            className="flex items-center justify-center p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-850 dark:hover:text-zinc-200 transition"
            title="Refrescar datos"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold py-2.5 px-4 rounded-xl shadow-md transition-all text-xs"
          >
            <Building className="h-4 w-4" />
            <span>Registrar Restaurante</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Restaurants Card */}
        <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-900 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all relative overflow-hidden">
          <div className="absolute right-4 top-4 h-10 w-10 bg-violet-50 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800/40 rounded-xl flex items-center justify-center">
            <Building className="h-5 w-5" />
          </div>
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Restaurantes</p>
          <h3 className="text-3xl font-black mt-2 text-zinc-900 dark:text-white">{restaurants.length}</h3>
          <div className="flex gap-2 text-[10px] text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{totalActiveRestaurants} Activos</span>
            <span>•</span>
            <span className="text-rose-600 dark:text-rose-400 font-bold">{totalSuspendedRestaurants} Suspendidos</span>
          </div>
        </div>

        {/* Total Orders Card */}
        <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-900 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all relative overflow-hidden">
          <div className="absolute right-4 top-4 h-10 w-10 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 rounded-xl flex items-center justify-center">
            <TrendingUp className="h-5 w-5" />
          </div>
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Pedidos Entregados</p>
          <h3 className="text-3xl font-black mt-2 text-zinc-900 dark:text-white">{totalDeliveredOrdersAllTime}</h3>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-2 font-medium">Registrados a través de WhatsApp Bot</p>
        </div>

        {/* Collected Revenue Card */}
        <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-900 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all relative overflow-hidden">
          <div className="absolute right-4 top-4 h-10 w-10 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 rounded-xl flex items-center justify-center">
            <CheckCircle className="h-5 w-5" />
          </div>
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Ingresos Recaudados</p>
          <h3 className="text-3xl font-black mt-2 text-emerald-650 dark:text-emerald-400">${totalRevenue.toFixed(2)}</h3>
          <p className="text-[10px] text-zinc-550 dark:text-zinc-400 mt-2 font-medium">Facturas cobradas con éxito</p>
        </div>

        {/* Unpaid Commission Card */}
        <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-900 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all relative overflow-hidden">
          <div className="absolute right-4 top-4 h-10 w-10 bg-amber-50 dark:bg-amber-950/20 text-amber-650 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 rounded-xl flex items-center justify-center">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Saldo por Recaudar</p>
          <h3 className="text-3xl font-black mt-2 text-amber-600 dark:text-amber-400">${pendingRevenue.toFixed(2)}</h3>
          <p className="text-[10px] text-zinc-550 dark:text-zinc-400 mt-2 font-medium">Facturas en estado pendiente</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 gap-6">
        <button
          onClick={() => setActiveSubTab('restaurants')}
          className={`pb-3 font-semibold text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeSubTab === 'restaurants'
              ? 'border-violet-500 text-zinc-900 dark:text-white'
              : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          <Building className="h-4 w-4" />
          <span>Restaurantes Afiliados</span>
        </button>
        <button
          onClick={() => setActiveSubTab('invoices')}
          className={`pb-3 font-semibold text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeSubTab === 'invoices'
              ? 'border-violet-500 text-zinc-950 dark:text-white'
              : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          <Receipt className="h-4 w-4" />
          <span>Historial de Facturación</span>
        </button>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="flex justify-between items-center gap-4 bg-zinc-50 dark:bg-zinc-900/10 border border-zinc-150 dark:border-zinc-850/50 p-4 rounded-xl">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder={activeSubTab === 'restaurants' ? 'Buscar restaurante por nombre, slug o correo...' : 'Buscar factura...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-750 focus:border-violet-500 rounded-xl py-2 pl-9 pr-4 text-xs text-zinc-800 dark:text-white focus:outline-none transition-all placeholder:text-zinc-500"
          />
        </div>
      </div>

      {/* CONTENT TAB 1: RESTAURANTS */}
      {activeSubTab === 'restaurants' && (
        <div className="bg-white dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-4 px-5">Restaurante / Slug</th>
                  <th className="py-4 px-5">Contacto</th>
                  <th className="py-4 px-5">Tarifa / Crédito</th>
                  <th className="py-4 px-5 text-center">Pedidos Mes Actual</th>
                  <th className="py-4 px-5 text-center">Tasa Cancelado (Fraude)</th>
                  <th className="py-4 px-5 text-right">Saldo Acumulado</th>
                  <th className="py-4 px-5 text-center">Estado</th>
                  <th className="py-4 px-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRestaurants.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-zinc-500 text-sm">
                      No se encontraron restaurantes afiliados.
                    </td>
                  </tr>
                ) : (
                  filteredRestaurants.map((r) => {
                    const stats = r.stats || {
                      totalOrders: 0,
                      deliveredOrders: 0,
                      cancelledOrders: 0,
                      currentPeriodDelivered: 0,
                      cancellationRate: 0,
                      unbilledAmount: 0
                    };

                    // Flag high cancellation rate
                    const isHighCancellation = stats.cancellationRate >= 20 && stats.totalOrders >= 5;

                    return (
                      <tr key={r.id} className="border-b border-zinc-150 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/25 transition-colors">
                        <td className="py-4 px-5">
                          <div className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">{r.name}</div>
                          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">slug: {r.slug}</div>
                        </td>
                        <td className="py-4 px-5 text-zinc-750 dark:text-zinc-350">
                          <div>{r.email || 'Sin correo'}</div>
                          <div className="text-zinc-500 dark:text-zinc-450 text-[10px] mt-0.5">{r.phone || 'Sin teléfono'}</div>
                        </td>
                        <td className="py-4 px-5 text-zinc-750 dark:text-zinc-350">
                          <div className="font-medium">
                            ${Number(r.cost_per_order).toFixed(2)} / pedido
                          </div>
                          <div className="text-[10px] mt-0.5 flex items-center gap-1">
                            <span className="text-zinc-500 dark:text-zinc-400">Créditos:</span>
                            {r.prepaid_credits > 0 ? (
                              <span className="bg-indigo-50 dark:bg-indigo-950/35 text-indigo-600 dark:text-indigo-400 border border-indigo-150 dark:border-indigo-900/35 px-1 py-0.5 rounded font-black text-[9px]">
                                {r.prepaid_credits}
                              </span>
                            ) : (
                              <span className="text-zinc-500 dark:text-zinc-400 font-medium">Ilimitado (Pospago)</span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-5 text-center font-bold text-sm text-zinc-800 dark:text-zinc-200">
                          {stats.currentPeriodDelivered}
                        </td>
                        <td className="py-4 px-5 text-center">
                          <div className={`inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[10px] font-bold ${
                            isHighCancellation
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-455 border border-rose-500/20'
                              : 'bg-zinc-100 dark:bg-zinc-850 text-zinc-600 dark:text-zinc-400'
                          }`}>
                            <Percent className="h-3 w-3" />
                            <span>{stats.cancellationRate}%</span>
                            {isHighCancellation && (
                              <span title="Tasa de cancelación sospechosa (Alerta Fraude)">
                                <AlertTriangle className="h-3 w-3 text-rose-500 dark:text-rose-400 ml-0.5" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-5 text-right font-black text-sm text-amber-600 dark:text-amber-400">
                          ${stats.unbilledAmount.toFixed(2)}
                        </td>
                        <td className="py-4 px-5 text-center">
                          <span className={`inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                            r.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                              : r.status === 'trial'
                              ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/25'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              r.status === 'active' ? 'bg-emerald-500' : r.status === 'trial' ? 'bg-violet-500' : 'bg-rose-500'
                            }`}></span>
                            <span>{r.status === 'active' ? 'Activo' : r.status === 'trial' ? 'Prueba' : 'Suspendido'}</span>
                          </span>
                        </td>
                        <td className="py-4 px-5 text-right space-x-1">
                          <button
                            onClick={() => {
                              setEditingRestaurant(r);
                              setEditCost(String(r.cost_per_order));
                              setEditCredits(String(r.prepaid_credits));
                              setEditStatus(r.status);
                            }}
                            className="p-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-lg text-zinc-550 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition inline-flex items-center"
                            title="Ajustes de Cobro"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                          </button>
                          
                          <button
                            onClick={() => {
                              setInvoiceRestaurant(r);
                            }}
                            className="p-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-lg text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-305 transition inline-flex items-center"
                            title="Cerrar Ciclo y Facturar"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </button>

                          <button
                            onClick={() => handleToggleStatus(r)}
                            className={`p-1.5 border rounded-lg transition inline-flex items-center ${
                              r.status === 'suspended'
                                ? 'bg-emerald-550/10 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-450'
                                : 'bg-rose-550/10 dark:bg-rose-955/20 border-rose-200 dark:border-rose-900 text-rose-650 dark:text-rose-450'
                            }`}
                            title={r.status === 'suspended' ? 'Activar Servicio' : 'Suspender Servicio'}
                          >
                            {r.status === 'suspended' ? <Play className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONTENT TAB 2: INVOICES */}
      {activeSubTab === 'invoices' && (
        <div className="bg-white dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-4 px-5">Restaurante</th>
                  <th className="py-4 px-5">Período de Facturación</th>
                  <th className="py-4 px-5 text-center">Pedidos Entregados</th>
                  <th className="py-4 px-5 text-center">Tarifa x Pedido</th>
                  <th className="py-4 px-5 text-right">Monto Total</th>
                  <th className="py-4 px-5 text-center">Estado</th>
                  <th className="py-4 px-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-zinc-550 dark:text-zinc-500 text-sm">
                      No se han emitido facturas en la plataforma.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-zinc-150 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/25 transition-colors">
                      <td className="py-4 px-5 font-bold text-zinc-900 dark:text-white text-sm">
                        {inv.restaurants?.name || 'Local Eliminado'}
                      </td>
                      <td className="py-4 px-5 text-zinc-750 dark:text-zinc-350">
                        {new Date(inv.period_start).toLocaleDateString('es-ES')} al {new Date(inv.period_end).toLocaleDateString('es-ES')}
                      </td>
                      <td className="py-4 px-5 text-center font-semibold text-zinc-800 dark:text-zinc-200">
                        {inv.orders_delivered}
                      </td>
                      <td className="py-4 px-5 text-center text-zinc-550 dark:text-zinc-400">
                        ${Number(inv.cost_per_order).toFixed(2)}
                      </td>
                      <td className="py-4 px-5 text-right font-black text-emerald-600 dark:text-emerald-400 text-sm">
                        ${Number(inv.total_amount).toFixed(2)}
                      </td>
                      <td className="py-4 px-5 text-center">
                        <span className={`inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                          inv.status === 'paid'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : inv.status === 'pending'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                        }`}>
                          {inv.status === 'paid' ? 'Pagada' : inv.status === 'pending' ? 'Pendiente' : 'Vencida'}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-right">
                        {inv.status !== 'paid' && (
                          <button
                            onClick={() => handleMarkInvoicePaid(inv.id)}
                            className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 dark:hover:bg-emerald-500 hover:text-white border border-emerald-200 dark:border-emerald-900 font-bold py-1 px-3 rounded-lg text-[10px] transition-all"
                          >
                            <Check className="h-3 w-3 inline mr-1" />
                            Confirmar Pago
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* MODAL: REGISTER RESTAURANT */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl relative">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-white p-1"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="p-6 border-b border-zinc-900">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Building className="h-5 w-5 text-violet-400" />
                Registrar Nuevo Comercio en el SaaS
              </h3>
              <p className="text-xs text-zinc-500 mt-1">Ingresa los datos generales del restaurante y su cuenta de administración inicial.</p>
            </div>
            
            <form onSubmit={handleAddRestaurant} className="p-6 max-h-[75vh] overflow-y-auto space-y-5">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Restaurant Fields */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-violet-400 uppercase tracking-wider border-b border-zinc-900 pb-1 flex items-center gap-1.5">
                    <Building className="h-3.5 w-3.5" />
                    Datos del Local
                  </h4>
                  <div>
                    <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Nombre Comercial</label>
                    <input
                      type="text"
                      required
                      value={newRestName}
                      onChange={(e) => {
                        setNewRestName(e.target.value);
                        // Auto-generate slug
                        setNewRestSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
                      }}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
                      placeholder="Ej. Hamburguesas El Corral"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Slug URL</label>
                    <input
                      type="text"
                      required
                      value={newRestSlug}
                      onChange={(e) => setNewRestSlug(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-xl py-2 px-3 text-xs text-white focus:outline-none font-mono"
                      placeholder="el-corral"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Teléfono</label>
                      <input
                        type="text"
                        value={newRestPhone}
                        onChange={(e) => setNewRestPhone(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
                        placeholder="+5939..."
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Correo</label>
                      <input
                        type="email"
                        value={newRestEmail}
                        onChange={(e) => setNewRestEmail(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
                        placeholder="contacto@local.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Dirección Física</label>
                    <input
                      type="text"
                      value={newRestAddress}
                      onChange={(e) => setNewRestAddress(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
                      placeholder="Av. Principal y Secundaria..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Tarifa x Pedido (USD)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newRestCost}
                        onChange={(e) => setNewRestCost(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Créditos Iniciales (Prepago)</label>
                      <input
                        type="number"
                        min="0"
                        value={newRestCredits}
                        onChange={(e) => setNewRestCredits(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
                        placeholder="0 para pospago"
                      />
                      <p className="text-[9px] text-zinc-500 mt-1">Usa 0 para plan pospago.</p>
                    </div>
                  </div>
                </div>

                {/* Admin Fields */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider border-b border-zinc-900 pb-1 flex items-center gap-1.5">
                    <UserPlus className="h-3.5 w-3.5" />
                    Cuenta del Administrador General
                  </h4>
                  <div>
                    <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Nombre Completo</label>
                    <input
                      type="text"
                      required
                      value={newRestAdminName}
                      onChange={(e) => setNewRestAdminName(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
                      placeholder="Ej. Juan Pérez"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Correo Electrónico de Acceso</label>
                    <input
                      type="email"
                      required
                      value={newRestAdminEmail}
                      onChange={(e) => setNewRestAdminEmail(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-xl py-2 px-3 text-xs text-white focus:outline-none font-mono"
                      placeholder="juan@local.com"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Contraseña Inicial</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newRestAdminPass}
                      onChange={(e) => setNewRestAdminPass(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                  <div className="bg-zinc-900/60 border border-zinc-900 p-4 rounded-2xl text-[10px] text-zinc-400 leading-relaxed">
                    <span className="font-bold text-zinc-200">Nota técnica:</span> Al enviar el formulario se creará un usuario de Supabase Auth con confirmación automática de correo electrónico y se le vinculará como <span className="text-indigo-400 font-bold">Admin General</span> de este restaurante.
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-zinc-900">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 font-bold py-2 px-4 rounded-xl text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold py-2.5 px-5 rounded-xl shadow-lg transition-all text-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {addLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Registrando...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Crear Restaurante
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT BILLING OPTIONS */}
      {editingRestaurant && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative">
            <button
              onClick={() => setEditingRestaurant(null)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-white p-1"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="p-6 border-b border-zinc-900">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-violet-400" />
                Configurar Cobro: {editingRestaurant.name}
              </h3>
            </div>
            
            <form onSubmit={handleEditBilling} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Tarifa por pedido entregado (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={editCost}
                  onChange={(e) => setEditCost(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Créditos Prepago Restantes</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={editCredits}
                  onChange={(e) => setEditCredits(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
                />
                <p className="text-[9px] text-zinc-500 mt-1">Incrementa este valor cuando el cliente compre un paquete de créditos. 0 desactiva prepago y aplica pospago.</p>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Estado de la Cuenta</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
                >
                  <option value="active">Activo</option>
                  <option value="suspended">Suspendido / Corte de Servicio</option>
                  <option value="trial">Prueba Gratuita</option>
                </select>
                <p className="text-[9px] text-rose-400 mt-1.5" style={{ display: editStatus === 'suspended' ? 'block' : 'none' }}>
                  ⚠️ Al suspender la cuenta, el Bot de WhatsApp responderá avisando la inactividad y se cancelará el servicio del bot inmediatamente.
                </p>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-zinc-900">
                <button
                  type="button"
                  onClick={() => setEditingRestaurant(null)}
                  className="bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold py-2 px-4 rounded-xl text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold py-2 px-4 rounded-xl shadow-lg transition disabled:opacity-50 flex items-center gap-1.5 text-xs"
                >
                  {editLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GENERATE INVOICE (CLOSE BILLING CYCLE) */}
      {invoiceRestaurant && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative">
            <button
              onClick={() => setInvoiceRestaurant(null)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-white p-1"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="p-6 border-b border-zinc-900">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-amber-400" />
                Cerrar Ciclo de Facturación
              </h3>
              <p className="text-xs text-zinc-500 mt-1">Se generará una factura contando los pedidos entregados entre las fechas seleccionadas.</p>
            </div>
            
            <form onSubmit={handleGenerateInvoice} className="p-6 space-y-4">
              <div className="bg-zinc-900/60 border border-zinc-900 p-4 rounded-2xl text-[10px] text-zinc-400 leading-relaxed space-y-1">
                <div><span className="font-bold text-zinc-200">Restaurante:</span> {invoiceRestaurant.name}</div>
                <div><span className="font-bold text-zinc-200">Tarifa actual:</span> ${Number(invoiceRestaurant.cost_per_order).toFixed(2)} por pedido</div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Fecha Inicio</label>
                  <input
                    type="date"
                    required
                    value={invStartDate}
                    onChange={(e) => setInvStartDate(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Fecha Fin</label>
                  <input
                    type="date"
                    required
                    value={invEndDate}
                    onChange={(e) => setInvEndDate(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-zinc-900">
                <button
                  type="button"
                  onClick={() => setInvoiceRestaurant(null)}
                  className="bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold py-2 px-4 rounded-xl text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={invLoading}
                  className="bg-gradient-to-r from-amber-600 to-amber-500 text-white font-bold py-2 px-4 rounded-xl shadow-lg transition disabled:opacity-50 flex items-center gap-1.5 text-xs"
                >
                  {invLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Generar Factura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
