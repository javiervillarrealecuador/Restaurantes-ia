'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Order, MenuCategory, MenuItem } from '@/types';
import * as XLSX from 'xlsx';
import { 
  BarChart3, 
  TrendingUp, 
  Clock, 
  ShoppingBag, 
  DollarSign, 
  Download, 
  Printer, 
  Search, 
  Filter, 
  Coffee, 
  Truck, 
  ChevronDown,
  Percent,
  ListFilter
} from 'lucide-react';

interface ReportsPanelProps {
  orders: Order[];
  loading: boolean;
  restaurantId: string | null;
}

const formatOrderCode = (code: string | null): string => {
  if (!code) return '';
  const match = code.match(/(\d{13})/);
  if (!match) return code;
  
  const numCode = match[1];
  const year = numCode.slice(0, 4);
  const month = numCode.slice(4, 6);
  const day = numCode.slice(6, 8);
  const seq = numCode.slice(8);
  return code.replace(numCode, `${year}-${month}-${day}-${seq}`);
};

export default function ReportsPanel({ orders, loading, restaurantId }: ReportsPanelProps) {
  // Database catalog states
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState<boolean>(false);

  // Filter States
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('month');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  
  const [startHour, setStartHour] = useState<number>(0);
  const [endHour, setEndHour] = useState<number>(23);
  
  const [customerQuery, setCustomerQuery] = useState<string>('');
  
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['dine_in', 'delivery', 'pickup']);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([
    'pending', 'confirmed', 'preparing', 'ready', 'delivering', 'delivered', 'cancelled'
  ]);
  
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [selectedProds, setSelectedProds] = useState<string[]>([]);
  
  const [paymentMethod, setPaymentMethod] = useState<string>('all'); // 'all', 'cash', 'whatsapp', etc.
  const [paidStatus, setPaidStatus] = useState<string>('all'); // 'all', 'paid', 'unpaid'

  // Toggle dropdown states for filter groups
  const [openFilterSec, setOpenFilterSec] = useState<string | null>(null);

  // Load menu categories and items for filtering catalog
  useEffect(() => {
    if (!restaurantId) return;
    
    const fetchMenuCatalog = async () => {
      setCatalogLoading(true);
      try {
        const { data: cats, error: catErr } = await supabase
          .from('menu_categories')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .order('sort_order', { ascending: true });
          
        if (catErr) throw catErr;
        setCategories(cats || []);

        if (cats && cats.length > 0) {
          const catIds = cats.map(c => c.id);
          const { data: items, error: itemErr } = await supabase
            .from('menu_items')
            .select('*')
            .in('category_id', catIds)
            .order('name', { ascending: true });
            
          if (itemErr) throw itemErr;
          setMenuItems(items || []);
        }
      } catch (err) {
        console.error('Error fetching menu items for filters:', err);
      } finally {
        setCatalogLoading(false);
      }
    };

    fetchMenuCatalog();
  }, [restaurantId]);

  const formatLocalDate = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Set default dates based on preset
  useEffect(() => {
    const today = new Date();
    
    if (datePreset === 'today') {
      const dateStr = formatLocalDate(today);
      setCustomStartDate(dateStr);
      setCustomEndDate(dateStr);
    } else if (datePreset === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const dateStr = formatLocalDate(yesterday);
      setCustomStartDate(dateStr);
      setCustomEndDate(dateStr);
    } else if (datePreset === 'week') {
      const weekAgo = new Date(today);
      weekAgo.setDate(today.getDate() - 7);
      setCustomStartDate(formatLocalDate(weekAgo));
      setCustomEndDate(formatLocalDate(today));
    } else if (datePreset === 'month') {
      const monthAgo = new Date(today);
      monthAgo.setDate(today.getDate() - 30);
      setCustomStartDate(formatLocalDate(monthAgo));
      setCustomEndDate(formatLocalDate(today));
    }
  }, [datePreset]);

  // Filter handlers
  const toggleTypeFilter = (type: string) => {
    setSelectedTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const toggleStatusFilter = (status: string) => {
    setSelectedStatuses(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const toggleCategoryFilter = (catId: string) => {
    setSelectedCats(prev => 
      prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId]
    );
  };

  const toggleProductFilter = (prodId: string) => {
    setSelectedProds(prev => 
      prev.includes(prodId) ? prev.filter(p => p !== prodId) : [...prev, prodId]
    );
  };

  const clearAllFilters = () => {
    setDatePreset('month');
    setStartHour(0);
    setEndHour(23);
    setCustomerQuery('');
    setSelectedTypes(['dine_in', 'delivery', 'pickup']);
    setSelectedStatuses(['pending', 'confirmed', 'preparing', 'ready', 'delivering', 'delivered', 'cancelled']);
    setSelectedCats([]);
    setSelectedProds([]);
    setPaymentMethod('all');
    setPaidStatus('all');
  };

  // MULTI-DIMENSIONAL DATA CRUNCHING (MEMOIZED)
  const filteredData = useMemo(() => {
    if (!orders || orders.length === 0) return { orders: [], items: [] };

    // 1. Filter Orders
    const filteredOrders = orders.filter(order => {
      // Date range check
      if (customStartDate) {
        const orderDate = new Date(order.created_at);
        const start = new Date(customStartDate + 'T00:00:00');
        if (orderDate < start) return false;
      }
      if (customEndDate) {
        const orderDate = new Date(order.created_at);
        const end = new Date(customEndDate + 'T23:59:59');
        if (orderDate > end) return false;
      }

      // Hour check
      const orderHour = new Date(order.created_at).getHours();
      if (orderHour < startHour || orderHour > endHour) return false;

      // Customer search
      if (customerQuery.trim()) {
        const query = customerQuery.toLowerCase();
        const matchesName = order.customer_name.toLowerCase().includes(query);
        const matchesPhone = order.customer_phone.includes(query);
        if (!matchesName && !matchesPhone) return false;
      }

      // Order type
      if (!selectedTypes.includes(order.type)) return false;

      // Order status
      if (!selectedStatuses.includes(order.status)) return false;

      // Payment method
      if (paymentMethod !== 'all' && order.payment_method !== paymentMethod) return false;

      // Paid status
      if (paidStatus !== 'all') {
        const isPaidReq = paidStatus === 'paid';
        if (order.is_paid !== isPaidReq) return false;
      }

      // Product & Category Filters
      // If we filtered by category or product, we need to inspect the items inside the order
      if (selectedCats.length > 0 || selectedProds.length > 0) {
        const items = order.order_items || [];
        const hasMatchingItem = items.some(item => {
          const menuInfo = item.menu_items;
          if (!menuInfo) return false;
          
          const matchesProd = selectedProds.length === 0 || selectedProds.includes(menuInfo.id);
          const matchesCat = selectedCats.length === 0 || selectedCats.includes(menuInfo.category_id);
          
          return matchesProd && matchesCat;
        });
        if (!hasMatchingItem) return false;
      }

      return true;
    });

    // 2. Extract itemized sales records from those filtered orders
    const itemizedSales: Array<{
      orderId: string;
      orderNumber: number;
      createdAt: string;
      customerName: string;
      customerPhone: string;
      type: string;
      status: string;
      itemId: string;
      itemName: string;
      categoryId: string;
      categoryName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }> = [];

    filteredOrders.forEach(order => {
      const items = order.order_items || [];
      items.forEach(item => {
        const menuInfo = item.menu_items;
        if (!menuInfo) return;

        // Verify if this specific item fits the category/product filters (if active)
        if (selectedCats.length > 0 && !selectedCats.includes(menuInfo.category_id)) return;
        if (selectedProds.length > 0 && !selectedProds.includes(menuInfo.id)) return;

        const catInfo = categories.find(c => c.id === menuInfo.category_id);
        const catName = catInfo ? catInfo.name : 'Sin Categoría';

        itemizedSales.push({
          orderId: order.id,
          orderNumber: order.order_number,
          createdAt: order.created_at,
          customerName: order.customer_name,
          customerPhone: order.customer_phone,
          type: order.type,
          status: order.status,
          itemId: menuInfo.id,
          itemName: menuInfo.name,
          categoryId: menuInfo.category_id,
          categoryName: catName,
          quantity: item.quantity,
          unitPrice: Number(item.unit_price),
          totalPrice: item.quantity * Number(item.unit_price)
        });
      });
    });

    return {
      orders: filteredOrders,
      items: itemizedSales
    };
  }, [orders, customStartDate, customEndDate, startHour, endHour, customerQuery, selectedTypes, selectedStatuses, selectedCats, selectedProds, paymentMethod, paidStatus, categories]);

  // ANALYTICS & METRICS CALCULATIONS
  const reportStats = useMemo(() => {
    const { orders: filteredOrders, items: filteredItems } = filteredData;
    
    let totalRevenue = 0;
    let completedRevenue = 0;
    let totalDeliveryFees = 0;
    let nonCancelledOrdersCount = 0;
    let totalEstimatedPrepTime = 0;
    let totalItemsPrepCount = 0;

    filteredOrders.forEach(order => {
      const isCancelled = order.status === 'cancelled';
      
      // Calculate revenue from non-cancelled orders
      if (!isCancelled) {
        totalRevenue += Number(order.total_price);
        nonCancelledOrdersCount++;
      }
      
      if (order.status === 'delivered') {
        completedRevenue += Number(order.total_price);
      }

      totalDeliveryFees += Number(order.delivery_fee || 0);

      // Average prep time estimation
      const items = order.order_items || [];
      items.forEach(it => {
        if (it.menu_items?.estimated_prep_time) {
          totalEstimatedPrepTime += it.menu_items.estimated_prep_time * it.quantity;
          totalItemsPrepCount += it.quantity;
        }
      });
    });

    const averageTicket = nonCancelledOrdersCount > 0 ? totalRevenue / nonCancelledOrdersCount : 0;
    const averagePrepTime = totalItemsPrepCount > 0 ? totalEstimatedPrepTime / totalItemsPrepCount : 15;

    // 1. Group Sales by Date for Trend
    const salesByDate: Record<string, { date: string, sales: number, count: number }> = {};
    filteredOrders.forEach(order => {
      if (order.status === 'cancelled') return;
      const dateKey = new Date(order.created_at).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short'
      });
      if (!salesByDate[dateKey]) {
        salesByDate[dateKey] = { date: dateKey, sales: 0, count: 0 };
      }
      salesByDate[dateKey].sales += Number(order.total_price);
      salesByDate[dateKey].count += 1;
    });
    // Sort chronological dates (or order of insertion in filtered list, reversed because orders is desc)
    const trendData = Object.values(salesByDate).reverse();

    // 2. Group Sales by Hour
    const salesByHour: number[] = Array(24).fill(0);
    const ordersByHour: number[] = Array(24).fill(0);
    filteredOrders.forEach(order => {
      if (order.status === 'cancelled') return;
      const hour = new Date(order.created_at).getHours();
      salesByHour[hour] += Number(order.total_price);
      ordersByHour[hour] += 1;
    });

    // 3. Group by Type (Donut Chart)
    const typeDistribution = {
      dine_in: { label: 'Mesa', count: 0, sales: 0 },
      delivery: { label: 'A Domicilio', count: 0, sales: 0 },
      pickup: { label: 'Llevar', count: 0, sales: 0 }
    };
    filteredOrders.forEach(order => {
      if (order.status === 'cancelled') return;
      if (typeDistribution[order.type]) {
        typeDistribution[order.type].count += 1;
        typeDistribution[order.type].sales += Number(order.total_price);
      }
    });

    // 4. Top Selling Products
    const productStats: Record<string, { name: string, qty: number, sales: number }> = {};
    filteredItems.forEach(item => {
      if (item.status === 'cancelled') return;
      if (!productStats[item.itemId]) {
        productStats[item.itemId] = { name: item.itemName, qty: 0, sales: 0 };
      }
      productStats[item.itemId].qty += item.quantity;
      productStats[item.itemId].sales += item.totalPrice;
    });
    const topProducts = Object.values(productStats)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    // 5. Category breakdown
    const categoryBreakdown: Record<string, { name: string, sales: number, qty: number }> = {};
    filteredItems.forEach(item => {
      if (item.status === 'cancelled') return;
      if (!categoryBreakdown[item.categoryId]) {
        categoryBreakdown[item.categoryId] = { name: item.categoryName, sales: 0, qty: 0 };
      }
      categoryBreakdown[item.categoryId].sales += item.totalPrice;
      categoryBreakdown[item.categoryId].qty += item.quantity;
    });
    const categoryStats = Object.values(categoryBreakdown).sort((a, b) => b.sales - a.sales);

    return {
      totalRevenue,
      completedRevenue,
      totalDeliveryFees,
      ordersCount: filteredOrders.length,
      activeOrdersCount: nonCancelledOrdersCount,
      cancelledCount: filteredOrders.filter(o => o.status === 'cancelled').length,
      averageTicket,
      averagePrepTime,
      trendData,
      salesByHour,
      ordersByHour,
      typeDistribution,
      topProducts,
      categoryStats
    };
  }, [filteredData]);

  // EXCEL EXPORTERS (Using xlsx library)
  const exportSummaryExcel = () => {
    const { orders: filteredOrders } = filteredData;
    if (filteredOrders.length === 0) {
      alert('No hay datos en el rango seleccionado para exportar.');
      return;
    }

    const exportData = filteredOrders.map(o => {
      const dateObj = new Date(o.created_at);
      return {
        'Nº Pedido': o.order_number,
        'Código': formatOrderCode(o.order_code) || '',
        'Fecha': dateObj.toLocaleDateString('es-ES'),
        'Hora': dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        'Cliente': o.customer_name,
        'Teléfono': o.customer_phone,
        'Tipo de Entrega': o.type === 'dine_in' ? 'Mesa' : o.type === 'delivery' ? 'Domicilio' : 'Llevar',
        'Estado': o.status.toUpperCase(),
        'Mesa': o.table_number || '',
        'Dirección Entrega': o.delivery_address || '',
        'Subtotal': Number(o.subtotal),
        'Envío': Number(o.delivery_fee),
        'Impuesto': Number(o.tax),
        'Total': Number(o.total_price),
        'Método de Pago': o.payment_method.toUpperCase(),
        'Pagado': o.is_paid ? 'SÍ' : 'NO',
        'Notas': o.notes || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resumen_Pedidos');
    XLSX.writeFile(workbook, `Reporte_Pedidos_Resumen_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportDetailedExcel = () => {
    const { items: filteredItems } = filteredData;
    if (filteredItems.length === 0) {
      alert('No hay productos vendidos en el rango seleccionado para exportar.');
      return;
    }

    const exportData = filteredItems.map(it => {
      const dateObj = new Date(it.createdAt);
      return {
        'Nº Pedido': it.orderNumber,
        'Fecha': dateObj.toLocaleDateString('es-ES'),
        'Hora': dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        'Cliente': it.customerName,
        'Teléfono': it.customerPhone,
        'Categoría': it.categoryName,
        'Producto': it.itemName,
        'Cantidad': it.quantity,
        'Precio Unitario': Number(it.unitPrice),
        'Total Item': Number(it.totalPrice),
        'Tipo de Entrega': it.type === 'dine_in' ? 'Mesa' : it.type === 'delivery' ? 'Domicilio' : 'Llevar',
        'Estado Pedido': it.status.toUpperCase()
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas_Productos');
    XLSX.writeFile(workbook, `Reporte_Ventas_Productos_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // TRIGGER BROWSER NATIVE PRINT
  const handlePrintPDF = () => {
    window.print();
  };

  // Helper calculation for donut path
  const getDonutSegments = () => {
    const dist = reportStats.typeDistribution;
    const totalSales = (dist.dine_in.sales + dist.delivery.sales + dist.pickup.sales) || 1;
    
    let currentPercent = 0;
    return [
      { id: 'dine_in', label: 'Mesa', color: '#ec4899', sales: dist.dine_in.sales, pct: dist.dine_in.sales / totalSales },
      { id: 'delivery', label: 'Domicilio', color: '#10b981', sales: dist.delivery.sales, pct: dist.delivery.sales / totalSales },
      { id: 'pickup', label: 'Llevar', color: '#3b82f6', sales: dist.pickup.sales, pct: dist.pickup.sales / totalSales },
    ].map(seg => {
      const strokeDashoffset = 100 - (seg.pct * 100);
      const rotation = currentPercent * 360;
      currentPercent += seg.pct;
      return { ...seg, strokeDashoffset, rotation };
    });
  };

  // SVG dimensions for Trend Line chart
  const trendSvgInfo = useMemo(() => {
    const data = reportStats.trendData;
    if (data.length === 0) return { path: '', area: '', points: [] };
    
    const width = 600;
    const height = 180;
    const padding = 25;
    
    const maxVal = Math.max(...data.map(d => d.sales), 100);
    const xStep = data.length > 1 ? (width - padding * 2) / (data.length - 1) : width - padding * 2;
    
    const points = data.map((d, index) => {
      const x = padding + index * xStep;
      const y = height - padding - ((d.sales / maxVal) * (height - padding * 2));
      return { x, y, sales: d.sales, date: d.date };
    });

    if (data.length === 1) {
      return {
        path: `M ${points[0].x} ${points[0].y} L ${width - padding} ${points[0].y}`,
        area: `M ${points[0].x} ${points[0].y} L ${width - padding} ${points[0].y} L ${width - padding} ${height - padding} L ${points[0].x} ${height - padding} Z`,
        points
      };
    }

    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const area = `${path} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;
    
    return { path, area, points };
  }, [reportStats.trendData]);

  // Hourly Peak times SVG bars calculations
  const maxHourValue = useMemo(() => {
    return Math.max(...reportStats.ordersByHour, 1);
  }, [reportStats.ordersByHour]);

  // Show loading spinner while fetching orders
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 bg-[#09090b] border border-zinc-900 rounded-3xl">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        <p className="text-zinc-400 text-xs mt-3 font-medium">Cargando reporte ejecutivo...</p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col space-y-6 print-container">
      
      {/* 1. FILTER CONTROLLER - Hidden when printing */}
      <div className="bg-zinc-950/45 border border-zinc-900 rounded-3xl p-5 backdrop-blur-md space-y-4 no-print shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4.5 w-4.5 text-emerald-400" />
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-widest">Generador de Reportes Cruzados</h3>
          </div>
          <button 
            onClick={clearAllFilters}
            className="text-[11px] font-bold text-zinc-500 hover:text-rose-450 transition-colors uppercase tracking-wider flex items-center gap-1 bg-zinc-900/50 hover:bg-rose-950/15 border border-zinc-850 px-2.5 py-1 rounded-xl cursor-pointer"
          >
            Limpiar Filtros
          </button>
        </div>

        {/* Primary Filter Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          
          {/* Date range selection */}
          <div className="space-y-1.5">
            <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Rango de Fecha</label>
            <div className="grid grid-cols-5 gap-1">
              {(['today', 'yesterday', 'week', 'month', 'custom'] as const).map(id => {
                const labelMap = { today: 'Hoy', yesterday: 'Ayer', week: '7D', month: '30D', custom: 'Esp' };
                return (
                  <button
                    key={id}
                    onClick={() => setDatePreset(id)}
                    className={`py-1.5 text-center font-semibold rounded-lg transition-colors border ${
                      datePreset === id 
                        ? 'bg-emerald-600/10 text-emerald-400 border-emerald-500/35' 
                        : 'bg-zinc-900 border-zinc-850 text-zinc-450 hover:bg-zinc-850'
                    }`}
                  >
                    {labelMap[id]}
                  </button>
                );
              })}
            </div>
            {datePreset === 'custom' && (
              <div className="grid grid-cols-2 gap-1.5 mt-2 animate-fadeIn">
                <input 
                  type="date" 
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-zinc-900 border border-zinc-850 rounded-lg p-2 text-zinc-200 outline-none focus:border-emerald-500 text-[11px]"
                />
                <input 
                  type="date" 
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-zinc-900 border border-zinc-850 rounded-lg p-2 text-zinc-200 outline-none focus:border-emerald-500 text-[11px]"
                />
              </div>
            )}
          </div>

          {/* Hour range selection */}
          <div className="space-y-1.5">
            <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] flex justify-between">
              <span>Rango Horario</span>
              <span className="text-emerald-400 font-semibold">{String(startHour).padStart(2, '0')}:00 a {String(endHour).padStart(2, '0')}:59</span>
            </label>
            <div className="flex items-center gap-2 mt-2 px-1">
              <input 
                type="range" 
                min="0" 
                max="23" 
                value={startHour}
                onChange={(e) => setStartHour(Math.min(Number(e.target.value), endHour))}
                className="w-full h-1 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <span className="text-zinc-600 font-bold">a</span>
              <input 
                type="range" 
                min="0" 
                max="23" 
                value={endHour}
                onChange={(e) => setEndHour(Math.max(Number(e.target.value), startHour))}
                className="w-full h-1 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
            <p className="text-[10px] text-zinc-500">Aísla ventas de almuerzo, cena u horas pico.</p>
          </div>

          {/* Customer filter query */}
          <div className="space-y-1.5">
            <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Filtrar Cliente</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Nombre o teléfono..."
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-zinc-900 border border-zinc-850 focus:border-emerald-500 text-zinc-200 rounded-xl outline-none placeholder-zinc-650"
              />
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-650" />
            </div>
            <p className="text-[10px] text-zinc-500">Cruza compras de un cliente específico.</p>
          </div>

          {/* Payment & Paid Status filters */}
          <div className="space-y-1.5">
            <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Pago & Liquidez</label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="bg-zinc-900 border border-zinc-850 rounded-xl p-2 text-zinc-350 outline-none focus:border-emerald-500"
              >
                <option value="all">Cualquier Pago</option>
                <option value="cash">Efectivo (Cash)</option>
                <option value="transfer">Transferencia</option>
                <option value="card">Tarjeta</option>
              </select>
              <select
                value={paidStatus}
                onChange={(e) => setPaidStatus(e.target.value)}
                className="bg-zinc-900 border border-zinc-850 rounded-xl p-2 text-zinc-350 outline-none focus:border-emerald-500"
              >
                <option value="all">Todos (Cobro)</option>
                <option value="paid">Pagados</option>
                <option value="unpaid">Pendientes de Pago</option>
              </select>
            </div>
          </div>
        </div>

        {/* Collapsible Accordion Filters (Order Types, Statuses, Catalog Categories/Products) */}
        <div className="border-t border-zinc-900 pt-3 flex flex-wrap gap-2 text-xs">
          
          {/* Order types toggle dropdown */}
          <div className="relative">
            <button
              onClick={() => setOpenFilterSec(openFilterSec === 'types' ? null : 'types')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-semibold ${
                selectedTypes.length < 3 
                  ? 'bg-blue-600/10 text-blue-400 border-blue-500/35' 
                  : 'bg-zinc-900 border-zinc-850 text-zinc-350 hover:bg-zinc-850'
              }`}
            >
              <span>Canal: {selectedTypes.length === 3 ? 'Todos' : `${selectedTypes.length} sel.`}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {openFilterSec === 'types' && (
              <div className="absolute left-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-2xl p-3 shadow-2xl z-20 space-y-2 animate-fadeIn">
                <p className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest border-b border-zinc-800 pb-1">Tipos de Entrega</p>
                {[
                  { id: 'dine_in', label: 'Consumo en Mesa' },
                  { id: 'delivery', label: 'Domicilio / Delivery' },
                  { id: 'pickup', label: 'Retiro en Local' }
                ].map(t => (
                  <label key={t.id} className="flex items-center gap-2 text-zinc-300 hover:text-zinc-100 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={selectedTypes.includes(t.id)}
                      onChange={() => toggleTypeFilter(t.id)}
                      className="rounded border-zinc-700 text-emerald-600 focus:ring-0 cursor-pointer"
                    />
                    <span>{t.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Order statuses toggle dropdown */}
          <div className="relative">
            <button
              onClick={() => setOpenFilterSec(openFilterSec === 'statuses' ? null : 'statuses')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-semibold ${
                selectedStatuses.length < 7 
                  ? 'bg-amber-600/10 text-amber-400 border-amber-500/35' 
                  : 'bg-zinc-900 border-zinc-850 text-zinc-350 hover:bg-zinc-850'
              }`}
            >
              <span>Estados: {selectedStatuses.length === 7 ? 'Todos' : `${selectedStatuses.length} sel.`}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {openFilterSec === 'statuses' && (
              <div className="absolute left-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-2xl p-3 shadow-2xl z-20 space-y-2 max-h-60 overflow-y-auto animate-fadeIn">
                <p className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest border-b border-zinc-800 pb-1">Estado de Pedidos</p>
                {[
                  { id: 'pending', label: 'Pendiente' },
                  { id: 'confirmed', label: 'Confirmado' },
                  { id: 'preparing', label: 'Preparando' },
                  { id: 'ready', label: 'Listo' },
                  { id: 'delivering', label: 'Despachado' },
                  { id: 'delivered', label: 'Entregado' },
                  { id: 'cancelled', label: 'Cancelado' }
                ].map(s => (
                  <label key={s.id} className="flex items-center gap-2 text-zinc-300 hover:text-zinc-100 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={selectedStatuses.includes(s.id)}
                      onChange={() => toggleStatusFilter(s.id)}
                      className="rounded border-zinc-700 text-emerald-600 focus:ring-0 cursor-pointer"
                    />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Menu Categories toggle dropdown */}
          <div className="relative">
            <button
              onClick={() => setOpenFilterSec(openFilterSec === 'cats' ? null : 'cats')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-semibold ${
                selectedCats.length > 0 
                  ? 'bg-purple-600/10 text-purple-400 border-purple-500/35' 
                  : 'bg-zinc-900 border-zinc-850 text-zinc-350 hover:bg-zinc-850'
              }`}
            >
              <span>Categorías: {selectedCats.length === 0 ? 'Todas' : `${selectedCats.length} sel.`}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {openFilterSec === 'cats' && (
              <div className="absolute left-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-2xl p-3 shadow-2xl z-20 space-y-2 max-h-60 overflow-y-auto animate-fadeIn">
                <p className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest border-b border-zinc-800 pb-1">Filtrar por Categoría</p>
                {catalogLoading ? (
                  <p className="text-[10px] text-zinc-650">Cargando...</p>
                ) : categories.length === 0 ? (
                  <p className="text-[10px] text-zinc-650">No hay categorías</p>
                ) : (
                  categories.map(c => (
                    <label key={c.id} className="flex items-center gap-2 text-zinc-300 hover:text-zinc-100 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={selectedCats.includes(c.id)}
                        onChange={() => toggleCategoryFilter(c.id)}
                        className="rounded border-zinc-700 text-emerald-600 focus:ring-0 cursor-pointer"
                      />
                      <span className="line-clamp-1">{c.name}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Menu Items / Products toggle dropdown */}
          <div className="relative">
            <button
              onClick={() => setOpenFilterSec(openFilterSec === 'prods' ? null : 'prods')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-semibold ${
                selectedProds.length > 0 
                  ? 'bg-pink-600/10 text-pink-400 border-pink-500/35' 
                  : 'bg-zinc-900 border-zinc-850 text-zinc-350 hover:bg-zinc-850'
              }`}
            >
              <span>Platos: {selectedProds.length === 0 ? 'Todos' : `${selectedProds.length} sel.`}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {openFilterSec === 'prods' && (
              <div className="absolute left-0 mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-2xl p-3 shadow-2xl z-20 space-y-2 max-h-60 overflow-y-auto animate-fadeIn">
                <p className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest border-b border-zinc-800 pb-1">Filtrar por Platillo</p>
                {catalogLoading ? (
                  <p className="text-[10px] text-zinc-650">Cargando...</p>
                ) : menuItems.length === 0 ? (
                  <p className="text-[10px] text-zinc-650">No hay platos del menú</p>
                ) : (
                  menuItems.map(p => {
                    const cat = categories.find(c => c.id === p.category_id);
                    return (
                      <label key={p.id} className="flex items-start gap-2 text-zinc-300 hover:text-zinc-100 cursor-pointer py-0.5">
                        <input 
                          type="checkbox" 
                          checked={selectedProds.includes(p.id)}
                          onChange={() => toggleProductFilter(p.id)}
                          className="rounded border-zinc-700 text-emerald-600 focus:ring-0 mt-0.5 cursor-pointer"
                        />
                        <div>
                          <p className="text-xs leading-tight font-medium line-clamp-1">{p.name}</p>
                          <span className="text-[8px] text-zinc-550 uppercase font-semibold">{cat?.name || 'S/C'}</span>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Active filter count badges */}
          {(selectedCats.length > 0 || selectedProds.length > 0 || datePreset !== 'month' || customerQuery.trim()) && (
            <div className="ml-auto flex items-center gap-1.5 text-[10px] bg-emerald-950/20 text-emerald-450 px-3 py-1 rounded-xl border border-emerald-900/30 font-bold uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-450 animate-pulse"></span>
              Filtro Activo
            </div>
          )}

          {/* Click away closer overlay */}
          {openFilterSec && (
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setOpenFilterSec(null)}
            />
          )}
        </div>
      </div>

      {/* 2. REPORT HEADER & ACTION BUTTONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-900 pb-4">
        <div>
          <h2 className="text-xl font-black text-zinc-100 tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-emerald-500" />
            Reporte Ejecutivo de Ventas
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Periodo analizado: <span className="font-bold text-zinc-350">{new Date(customStartDate + 'T00:00:00').toLocaleDateString('es-ES')}</span> al <span className="font-bold text-zinc-350">{new Date(customEndDate + 'T23:59:59').toLocaleDateString('es-ES')}</span> ({filteredData.orders.length} pedidos procesados)
          </p>
        </div>

        {/* Action downloads buttons */}
        <div className="flex flex-wrap items-center gap-2 no-print">
          {/* Download summary excel */}
          <button
            onClick={exportSummaryExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-850 hover:border-zinc-800 text-xs font-semibold shadow-md transition-all cursor-pointer"
            title="Exporta cada pedido en una fila"
          >
            <Download className="h-4 w-4 text-zinc-400" />
            <span>Excel Pedidos</span>
          </button>

          {/* Download detailed excel */}
          <button
            onClick={exportDetailedExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-850 hover:border-zinc-800 text-xs font-semibold shadow-md transition-all cursor-pointer"
            title="Exporta cada producto vendido en una fila para análisis de recetas/inventario"
          >
            <Download className="h-4 w-4 text-emerald-400" />
            <span>Excel Productos</span>
          </button>

          {/* Print PDF */}
          <button
            onClick={handlePrintPDF}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950/20 transition-all cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span>Guardar PDF / Imprimir</span>
          </button>
        </div>
      </div>

      {/* 3. BUSINESS KPIS CARDS */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total revenue */}
        <div className="bg-zinc-950/40 border border-zinc-900 p-4.5 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-wider">Facturación Neta</span>
            <div className="p-1.5 rounded-lg bg-emerald-600/10 text-emerald-400 border border-emerald-550/15">
              <DollarSign className="h-3.5 w-3.5" />
            </div>
          </div>
          <h3 className="text-xl font-black text-zinc-100 mt-2">${reportStats.totalRevenue.toFixed(2)}</h3>
          <p className="text-[9px] text-zinc-500 mt-1">Excluye pedidos cancelados</p>
        </div>

        {/* Order count */}
        <div className="bg-zinc-950/40 border border-zinc-900 p-4.5 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-wider">Pedidos Totales</span>
            <div className="p-1.5 rounded-lg bg-blue-600/10 text-blue-400 border border-blue-550/15">
              <ShoppingBag className="h-3.5 w-3.5" />
            </div>
          </div>
          <h3 className="text-xl font-black text-zinc-100 mt-2">{reportStats.ordersCount}</h3>
          <p className="text-[9px] text-zinc-500 mt-1">
            {reportStats.cancelledCount} cancelados ({((reportStats.cancelledCount / (reportStats.ordersCount || 1)) * 100).toFixed(0)}%)
          </p>
        </div>

        {/* Average Ticket */}
        <div className="bg-zinc-950/40 border border-zinc-900 p-4.5 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-wider">Ticket Promedio</span>
            <div className="p-1.5 rounded-lg bg-purple-600/10 text-purple-400 border border-purple-550/15">
              <Percent className="h-3.5 w-3.5" />
            </div>
          </div>
          <h3 className="text-xl font-black text-zinc-100 mt-2">${reportStats.averageTicket.toFixed(2)}</h3>
          <p className="text-[9px] text-zinc-500 mt-1">Por cliente recurrente</p>
        </div>

        {/* Total Delivery Fees */}
        <div className="bg-zinc-950/40 border border-zinc-900 p-4.5 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-wider">Costos de Envío</span>
            <div className="p-1.5 rounded-lg bg-amber-600/10 text-amber-400 border border-amber-550/15">
              <Truck className="h-3.5 w-3.5" />
            </div>
          </div>
          <h3 className="text-xl font-black text-zinc-100 mt-2">${reportStats.totalDeliveryFees.toFixed(2)}</h3>
          <p className="text-[9px] text-zinc-500 mt-1">Recaudado por delivery</p>
        </div>

        {/* Average Prep Time */}
        <div className="bg-zinc-950/40 border border-zinc-900 p-4.5 rounded-2xl backdrop-blur-sm col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-wider">Prep. Promedio</span>
            <div className="p-1.5 rounded-lg bg-indigo-600/10 text-indigo-400 border border-indigo-550/15">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <h3 className="text-xl font-black text-zinc-100 mt-2">{reportStats.averagePrepTime.toFixed(0)} min</h3>
          <p className="text-[9px] text-zinc-500 mt-1">Estimación operativa</p>
        </div>
      </section>

      {/* 4. CHARTS SECTION */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Sales trend Area chart */}
        <div className="bg-zinc-950/40 border border-zinc-900 p-5 rounded-3xl backdrop-blur-sm lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
            <h4 className="text-xs font-bold text-zinc-350 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              Tendencia de Ventas (Facturación Diaria)
            </h4>
            <span className="text-[10px] text-zinc-500">Montos acumulados</span>
          </div>

          {reportStats.trendData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-zinc-650">
              No hay datos suficientes para graficar la tendencia.
            </div>
          ) : (
            <div className="w-full pt-4">
              <svg viewBox="0 0 600 200" className="w-full h-48 overflow-visible">
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.00" />
                  </linearGradient>
                </defs>

                {/* Grid horizontal helper lines */}
                <line x1="25" y1="25" x2="575" y2="25" stroke="#18181b" strokeWidth="1" strokeDasharray="3" />
                <line x1="25" y1="80" x2="575" y2="80" stroke="#18181b" strokeWidth="1" strokeDasharray="3" />
                <line x1="25" y1="135" x2="575" y2="135" stroke="#18181b" strokeWidth="1" strokeDasharray="3" />
                <line x1="25" y1="155" x2="575" y2="155" stroke="#27272a" strokeWidth="1" />

                {/* Fill Area under the line */}
                {trendSvgInfo.area && (
                  <path d={trendSvgInfo.area} fill="url(#salesGrad)" />
                )}

                {/* Trend line */}
                {trendSvgInfo.path && (
                  <path 
                    d={trendSvgInfo.path} 
                    fill="none" 
                    stroke="#10b981" 
                    strokeWidth="3" 
                    strokeLinecap="round"
                    strokeLinejoin="round" 
                  />
                )}

                {/* Data Points */}
                {trendSvgInfo.points.map((p, i) => (
                  <g key={i} className="group cursor-pointer">
                    <circle 
                      cx={p.x} 
                      cy={p.y} 
                      r="4" 
                      fill="#09090b" 
                      stroke="#10b981" 
                      strokeWidth="2.5" 
                      className="transition-all duration-300 hover:r-6 hover:fill-emerald-450"
                    />
                    {/* Tooltip on hover */}
                    <rect 
                      x={p.x - 40} 
                      y={p.y - 30} 
                      width="80" 
                      height="20" 
                      rx="4" 
                      fill="#18181b" 
                      stroke="#27272a" 
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                    />
                    <text 
                      x={p.x} 
                      y={p.y - 17} 
                      textAnchor="middle" 
                      fill="#e4e4e7" 
                      fontSize="9" 
                      fontWeight="bold" 
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none font-sans"
                    >
                      ${p.sales.toFixed(2)}
                    </text>

                    {/* Date labels on horizontal axis */}
                    {(trendSvgInfo.points.length < 15 || i % Math.ceil(trendSvgInfo.points.length / 8) === 0) && (
                      <text 
                        x={p.x} 
                        y="175" 
                        textAnchor="middle" 
                        fill="#71717a" 
                        fontSize="9"
                        fontWeight="semibold"
                        className="font-sans"
                      >
                        {p.date}
                      </text>
                    )}
                  </g>
                ))}
              </svg>
            </div>
          )}
        </div>

        {/* Order Type Distribution Donut chart */}
        <div className="bg-zinc-950/40 border border-zinc-900 p-5 rounded-3xl backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
            <h4 className="text-xs font-bold text-zinc-350 uppercase tracking-wider flex items-center gap-1.5">
              <Coffee className="h-4 w-4 text-emerald-400" />
              Canales de Distribución (Ventas)
            </h4>
            <span className="text-[10px] text-zinc-500">Porcentaje total</span>
          </div>

          <div className="flex flex-col items-center justify-center py-2">
            {reportStats.totalRevenue === 0 ? (
              <div className="h-40 flex items-center justify-center text-xs text-zinc-650">
                No hay ventas para calcular canales.
              </div>
            ) : (
              <div className="flex items-center justify-around w-full gap-2">
                {/* SVG Donut */}
                <div className="relative h-32 w-32 shrink-0">
                  <svg viewBox="0 0 36 36" className="h-full w-full">
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="#18181b" strokeWidth="3" />
                    
                    {getDonutSegments().map((seg) => {
                      if (seg.pct === 0) return null;
                      return (
                        <circle 
                          key={seg.id}
                          cx="18" 
                          cy="18" 
                          r="15.915" 
                          fill="none" 
                          stroke={seg.color} 
                          strokeWidth="3.2" 
                          strokeDasharray={`${seg.pct * 100} ${100 - (seg.pct * 100)}`}
                          strokeDashoffset={seg.strokeDashoffset}
                          transform={`rotate(${seg.rotation - 90} 18 18)`}
                          className="transition-all duration-300 hover:stroke-[3.8]"
                        />
                      );
                    })}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest leading-none">Ventas</span>
                    <span className="text-sm font-black text-zinc-150 mt-1">${reportStats.totalRevenue.toFixed(0)}</span>
                  </div>
                </div>

                {/* Donut Legend */}
                <div className="space-y-2 text-xs">
                  {getDonutSegments().map(seg => (
                    <div key={seg.id} className="flex items-start gap-2">
                      <span className="h-3 w-3 rounded-md shrink-0 mt-0.5" style={{ backgroundColor: seg.color }} />
                      <div>
                        <p className="font-bold text-zinc-200 leading-tight">{seg.label}</p>
                        <p className="text-[10px] text-zinc-500">
                          ${seg.sales.toFixed(2)} ({Math.round(seg.pct * 100)}%)
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 5. LEADERBOARD BREAKDOWNS SECTION */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Top 5 selling products bar charts */}
        <div className="bg-zinc-950/40 border border-zinc-900 p-5 rounded-3xl backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
            <h4 className="text-xs font-bold text-zinc-350 uppercase tracking-wider flex items-center gap-1.5">
              <ListFilter className="h-4 w-4 text-emerald-400" />
              Top 5 Platillos Más Vendidos
            </h4>
            <span className="text-[10px] text-zinc-500">Por unidades vendidas</span>
          </div>

          {reportStats.topProducts.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-650">No hay ventas registradas.</div>
          ) : (
            <div className="space-y-4">
              {reportStats.topProducts.map((prod, index) => {
                const maxQty = Math.max(...reportStats.topProducts.map(p => p.qty), 1);
                const pct = (prod.qty / maxQty) * 100;
                const colors = ['bg-emerald-500', 'bg-teal-500', 'bg-blue-500', 'bg-indigo-500', 'bg-purple-500'];

                return (
                  <div key={index} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-zinc-200 line-clamp-1">{index + 1}. {prod.name}</span>
                      <span className="text-zinc-400 shrink-0 ml-2">
                        {prod.qty} u. <span className="text-zinc-650">(${prod.sales.toFixed(2)})</span>
                      </span>
                    </div>
                    <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${colors[index] || 'bg-zinc-600'} rounded-full transition-all duration-1000`} 
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Category Share break down */}
        <div className="bg-zinc-950/40 border border-zinc-900 p-5 rounded-3xl backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
            <h4 className="text-xs font-bold text-zinc-350 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              Facturación por Categoría de Menú
            </h4>
            <span className="text-[10px] text-zinc-500">Monto total</span>
          </div>

          {reportStats.categoryStats.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-650">No hay ventas registradas.</div>
          ) : (
            <div className="space-y-4 max-h-60 overflow-y-auto pr-1">
              {reportStats.categoryStats.map((cat, index) => {
                const maxSales = Math.max(...reportStats.categoryStats.map(c => c.sales), 1);
                const pct = (cat.sales / maxSales) * 100;
                const colors = ['bg-pink-500', 'bg-rose-500', 'bg-amber-500', 'bg-orange-500', 'bg-zinc-550'];

                return (
                  <div key={index} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-zinc-200 line-clamp-1">{cat.name}</span>
                      <span className="text-emerald-400 shrink-0 ml-2">
                        ${cat.sales.toFixed(2)} <span className="text-zinc-550">({cat.qty} u.)</span>
                      </span>
                    </div>
                    <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${colors[index % colors.length]} rounded-full transition-all duration-1000`} 
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 6. HOURLY SALES BAR GRAPH (PEAK HOURS) */}
      <section className="bg-zinc-950/40 border border-zinc-900 p-5 rounded-3xl backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
          <h4 className="text-xs font-bold text-zinc-350 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-emerald-400" />
            Distribución de Pedidos por Hora (Detección de Horas Pico)
          </h4>
          <span className="text-[10px] text-zinc-500">Frecuencia de pedidos recibidos por hora</span>
        </div>

        {reportStats.totalRevenue === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-650">No hay ventas registradas en el rango.</div>
        ) : (
          <div className="space-y-2">
            {/* SVG Histogram */}
            <div className="w-full pt-4">
              <svg viewBox="0 0 720 120" className="w-full h-32 overflow-visible">
                {/* Horizontal ground line */}
                <line x1="20" y1="100" x2="700" y2="100" stroke="#27272a" strokeWidth="1" />

                {/* 24 Bar segments */}
                {reportStats.ordersByHour.map((count, hr) => {
                  const x = 25 + hr * 28;
                  const barHeight = count > 0 ? (count / maxHourValue) * 80 : 0;
                  const y = 100 - barHeight;
                  
                  return (
                    <g key={hr} className="group cursor-pointer">
                      {/* Interactive rect */}
                      <rect 
                        x={x} 
                        y={y} 
                        width="18" 
                        height={barHeight || 1} 
                        rx="3"
                        fill={count > 0 ? 'url(#barGrad)' : '#18181b'} 
                        className="transition-all duration-300 hover:fill-emerald-400"
                      />
                      
                      {/* Tooltip on hover */}
                      {count > 0 && (
                        <>
                          <rect 
                            x={x - 20} 
                            y={y - 22} 
                            width="58" 
                            height="18" 
                            rx="4" 
                            fill="#18181b" 
                            stroke="#27272a" 
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                          />
                          <text 
                            x={x + 9} 
                            y={y - 10} 
                            textAnchor="middle" 
                            fill="#10b981" 
                            fontSize="8.5" 
                            fontWeight="bold" 
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none font-sans"
                          >
                            {count} ped.
                          </text>
                        </>
                      )}

                      {/* Hour labels */}
                      {(hr % 2 === 0) && (
                        <text 
                          x={x + 9} 
                          y="114" 
                          textAnchor="middle" 
                          fill="#52525b" 
                          fontSize="8.5"
                          fontWeight="bold"
                          className="font-mono"
                        >
                          {String(hr).padStart(2, '0')}
                        </text>
                      )}
                    </g>
                  );
                })}

                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="flex justify-between text-[10px] text-zinc-550 font-bold px-2 uppercase tracking-wider">
              <span>Mañana (00:00 - 11:59)</span>
              <span>Tarde / Almuerzo (12:00 - 17:59)</span>
              <span>Noche / Cena (18:00 - 23:59)</span>
            </div>
          </div>
        )}
      </section>

      {/* 7. DRILLED DOWN ORDERS TABLE */}
      <div className="bg-zinc-950/40 border border-zinc-900 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-zinc-900 flex justify-between items-center bg-zinc-950/20">
          <h4 className="text-xs font-bold text-zinc-350 uppercase tracking-widest">
            Detalle de Pedidos Filtrados ({filteredData.orders.length})
          </h4>
          <span className="text-[10px] text-zinc-550 bg-zinc-900 border border-zinc-850 px-2 py-0.5 rounded-lg">
            Ordenado por Fecha (Reciente Primero)
          </span>
        </div>

        {filteredData.orders.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-600 bg-zinc-900/10">
            No hay registros que coincidan con la selección de filtros actual.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-900 text-zinc-500 uppercase tracking-wider text-[9px] font-black bg-zinc-950/30">
                  <th className="p-4.5">Nº</th>
                  <th className="p-4.5">Cliente</th>
                  <th className="p-4.5">Canal</th>
                  <th className="p-4.5">Detalle Productos</th>
                  <th className="p-4.5 text-right">Total</th>
                  <th className="p-4.5">Pago</th>
                  <th className="p-4.5 text-center">Estado</th>
                  <th className="p-4.5">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/60">
                {filteredData.orders.map(o => {
                  const isCancelled = o.status === 'cancelled';
                  const orderDate = new Date(o.created_at).toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  return (
                    <tr 
                      key={o.id} 
                      className={`hover:bg-zinc-900/35 transition-colors ${
                        isCancelled ? 'opacity-50 line-through text-zinc-600' : 'text-zinc-300'
                      }`}
                    >
                      <td className="p-4.5 font-mono font-bold text-zinc-400">
                        #{o.order_number}
                      </td>
                      <td className="p-4.5">
                        <p className="font-semibold text-zinc-150">{o.customer_name}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{o.customer_phone}</p>
                      </td>
                      <td className="p-4.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                          o.type === 'dine_in' 
                            ? 'bg-pink-950/20 text-pink-400 border-pink-950/50' 
                            : o.type === 'delivery' 
                            ? 'bg-emerald-950/20 text-emerald-400 border-emerald-950/50' 
                            : 'bg-blue-950/20 text-blue-400 border-blue-950/50'
                        }`}>
                          {o.type === 'dine_in' ? 'Mesa' : o.type === 'delivery' ? 'Domicilio' : 'Llevar'}
                        </span>
                      </td>
                      <td className="p-4.5 text-zinc-400 max-w-xs">
                        <p className="line-clamp-2 text-[11px] leading-relaxed">
                          {o.order_items?.map(it => `${it.quantity}x ${it.menu_items?.name}`).join(', ') || 'Sin Platillos'}
                        </p>
                      </td>
                      <td className="p-4.5 text-right font-bold text-zinc-100">
                        ${Number(o.total_price).toFixed(2)}
                      </td>
                      <td className="p-4.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${o.is_paid ? 'text-emerald-450' : 'text-rose-450'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${o.is_paid ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                          {o.is_paid ? 'Cobrado' : 'Por Cobrar'}
                        </span>
                        <p className="text-[9px] text-zinc-500 uppercase mt-0.5 font-bold tracking-wider">{o.payment_method}</p>
                      </td>
                      <td className="p-4.5 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                          o.status === 'delivered' 
                            ? 'bg-emerald-950/20 text-emerald-400 border-emerald-950/60' 
                            : o.status === 'cancelled'
                            ? 'bg-rose-950/20 text-rose-450 border-rose-950/60'
                            : 'bg-zinc-850 text-zinc-400 border-zinc-800'
                        }`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="p-4.5 text-zinc-500 font-medium">
                        {orderDate}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
