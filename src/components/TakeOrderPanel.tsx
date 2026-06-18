'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { MenuItem, MenuCategory, Branch } from '@/types';
import { toast } from 'sonner';
import { 
  Search, 
  Utensils, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  Check, 
  Loader2, 
  ArrowLeft,
  Coffee,
  MapPin,
  Clipboard,
  User,
  Hash
} from 'lucide-react';

interface TakeOrderPanelProps {
  restaurantId: string;
  activeBranchId: string | null;
}

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  notes: string;
}

export default function TakeOrderPanel({ restaurantId, activeBranchId }: TakeOrderPanelProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [itemBranches, setItemBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState('all');

  // Order Info
  const [tableNumber, setTableNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [editingItemNotes, setEditingItemNotes] = useState<{ index: number; value: string } | null>(null);

  // Fetch branches, categories, menu items, and relationships
  useEffect(() => {
    async function loadData() {
      if (!restaurantId) return;
      setLoading(true);
      try {
        // 1. Fetch branches
        const { data: branchData } = await supabase
          .from('branches')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .eq('is_active', true);
        
        const activeBranches = branchData || [];
        setBranches(activeBranches);

        // Set default branch
        if (activeBranchId) {
          setSelectedBranchId(activeBranchId);
        } else if (activeBranches.length > 0) {
          setSelectedBranchId(activeBranches[0].id);
        }

        // 2. Fetch categories
        const { data: catData } = await supabase
          .from('menu_categories')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true });
        
        setCategories(catData || []);

        // 3. Fetch menu items
        if (catData && catData.length > 0) {
          const catIds = catData.map((c: any) => c.id);
          const { data: itemsData } = await supabase
            .from('menu_items')
            .select('*')
            .in('category_id', catIds)
            .eq('is_available', true)
            .order('name', { ascending: true });
          
          setMenuItems(itemsData || []);
        }

        // 4. Fetch menu item branch relations
        const { data: relationData } = await supabase
          .from('menu_item_branches')
          .select('*');
        setItemBranches(relationData || []);

      } catch (err) {
        console.error('Error loading order panel data:', err);
        toast.error('Error al cargar la carta o sucursales.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [restaurantId, activeBranchId]);

  // Filter items based on selected branch and category & search query
  const filteredItems = menuItems.filter(item => {
    // 1. Branch Availability Filter
    const itemAssociations = itemBranches.filter(rel => rel.menu_item_id === item.id);
    if (itemAssociations.length > 0 && selectedBranchId) {
      const isAvailableInBranch = itemAssociations.some(rel => rel.branch_id === selectedBranchId);
      if (!isAvailableInBranch) return false;
    }

    // 2. Category Filter
    if (activeCategoryId !== 'all' && item.category_id !== activeCategoryId) {
      return false;
    }

    // 3. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesName = item.name.toLowerCase().includes(q);
      const matchesDesc = (item.description || '').toLowerCase().includes(q);
      const matchesCode = (item.code || '').toLowerCase().includes(q);
      return matchesName || matchesDesc || matchesCode;
    }

    return true;
  });

  // Cart Handlers
  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.menuItem.id === item.id);
      if (existing) {
        return prev.map(i => i.menuItem.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { menuItem: item, quantity: 1, notes: '' }];
    });
    toast.success(`${item.name} agregado al pedido`);
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => {
      return prev.map(i => {
        if (i.menuItem.id === itemId) {
          const newQty = i.quantity + delta;
          return newQty > 0 ? { ...i, quantity: newQty } : i;
        }
        return i;
      }).filter(i => i.quantity > 0);
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(i => i.menuItem.id !== itemId));
    toast.error('Item eliminado del pedido');
  };

  const updateItemNotes = (index: number, val: string) => {
    setCart(prev => prev.map((item, idx) => idx === index ? { ...item, notes: val } : item));
  };

  // Calculations
  const subtotal = cart.reduce((acc, curr) => acc + (curr.menuItem.price * curr.quantity), 0);
  const tax = Number((subtotal * 0.10).toFixed(2));
  const total = Number((subtotal + tax).toFixed(2));

  // Submit Order
  const handleSubmitOrder = async () => {
    if (cart.length === 0) {
      toast.error('El pedido está vacío.');
      return;
    }
    if (!tableNumber) {
      toast.error('Por favor ingresa el número de mesa.');
      return;
    }
    if (!selectedBranchId) {
      toast.error('Por favor selecciona una sucursal.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Generate Order Code
      const randSeq = String(Math.floor(100000 + Math.random() * 900000));
      const orderCode = `MES-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randSeq}`;

      const nameFinal = customerName.trim() || `Mesa ${tableNumber}`;
      const phoneFinal = customerPhone.trim() || '0999999999';

      // 2. Insert Order Parent
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          restaurant_id: restaurantId,
          branch_id: selectedBranchId,
          status: 'pending',
          type: 'dine_in',
          source: 'waiter',
          customer_name: nameFinal,
          customer_phone: phoneFinal,
          table_number: tableNumber,
          notes: generalNotes.trim() || null,
          subtotal,
          tax,
          delivery_fee: 0.00,
          total_price: total,
          payment_method: paymentMethod,
          is_paid: false
        })
        .select('id')
        .single();

      if (orderErr) throw orderErr;

      // 3. Insert Order Items
      const orderItemsToInsert = cart.map(item => ({
        order_id: order.id,
        menu_item_id: item.menuItem.id,
        quantity: item.quantity,
        unit_price: item.menuItem.price,
        notes: item.notes.trim() || null
      }));

      const { error: itemsErr } = await supabase
        .from('order_items')
        .insert(orderItemsToInsert);

      if (itemsErr) throw itemsErr;

      // Success
      toast.success('¡Pedido creado con éxito y enviado a cocina!');
      
      // Reset Form
      setCart([]);
      setTableNumber('');
      setCustomerName('');
      setCustomerPhone('');
      setGeneralNotes('');
      
      // Reproducir sonido de confirmación nativo (opcional)
      try {
        const audio = new Audio('/sounds/confirm.mp3');
        audio.volume = 0.5;
        audio.play().catch(() => {});
      } catch (e) {}

    } catch (err) {
      console.error('Error creating waiter order:', err);
      toast.error('Error al registrar el pedido. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        <span className="text-sm text-zinc-400 font-medium">Cargando carta y sucursales...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* LEFT: Menu Selection (8 cols) */}
      <div className="lg:col-span-7 space-y-5">
        {/* Branch Selector (Only if multiple branches exist or user is general admin) */}
        {branches.length > 1 && (
          <div className="bg-zinc-950 p-4 border border-zinc-900 rounded-3xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-zinc-400 block uppercase tracking-wider">Sucursal Activa</span>
                <span className="text-sm font-bold text-zinc-150 block leading-tight">
                  {branches.find(b => b.id === selectedBranchId)?.name || 'Seleccionar sucursal'}
                </span>
              </div>
            </div>
            <select
              value={selectedBranchId}
              onChange={(e) => {
                setSelectedBranchId(e.target.value);
                setCart([]); // Clear cart when switching branch to avoid mismatch
              }}
              className="bg-zinc-900 border border-zinc-850 p-2.5 rounded-xl text-zinc-200 text-xs font-semibold outline-none cursor-pointer focus:border-emerald-500 transition-all"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Search & Categories */}
        <div className="bg-zinc-950 border border-zinc-900 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por código o nombre de plato..."
              className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-3 pl-11 rounded-xl text-zinc-150 outline-none text-sm transition-all placeholder:text-zinc-650"
            />
          </div>

          {/* Categories Horizontal Scroll */}
          <div className="flex gap-2 overflow-x-auto pb-1.5 custom-scrollbar">
            <button
              onClick={() => setActiveCategoryId('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
                activeCategoryId === 'all'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-zinc-900/40 border-zinc-850 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Todos
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveCategoryId(c.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
                  activeCategoryId === c.id
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-zinc-900/40 border-zinc-850 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Menu Items Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredItems.length > 0 ? (
            filteredItems.map(item => (
              <div 
                key={item.id}
                className="bg-zinc-950 border border-zinc-900 rounded-3xl p-4.5 flex flex-col justify-between hover:border-zinc-800 transition-all hover:shadow-lg gap-4 group"
              >
                <div className="space-y-1.5">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-[11px] font-bold text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded-md uppercase tracking-wider">
                      {item.code || 'S/C'}
                    </span>
                    <span className="text-sm font-bold text-emerald-400">${Number(item.price).toFixed(2)}</span>
                  </div>
                  <h4 className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors">{item.name}</h4>
                  {item.description && (
                    <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">{item.description}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => addToCart(item)}
                  className="w-full py-2 bg-zinc-900 hover:bg-emerald-600 border border-zinc-850 hover:border-emerald-500 text-zinc-200 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Plus className="h-3.5 w-3.5" /> Agregar al Pedido
                </button>
              </div>
            ))
          ) : (
            <div className="col-span-full bg-zinc-950 border border-zinc-900 rounded-3xl p-10 flex flex-col items-center justify-center text-center gap-3">
              <Coffee className="h-10 w-10 text-zinc-650" />
              <h5 className="text-sm font-bold text-zinc-300">No hay platos disponibles</h5>
              <p className="text-xs text-zinc-500">Ningún plato coincide con tu búsqueda o categoría en esta sucursal.</p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Order Details / Cart (5 cols) */}
      <div className="lg:col-span-5 bg-zinc-950 border border-zinc-900 rounded-3xl p-5.5 space-y-6 shadow-2xl flex flex-col justify-between">
        <div className="space-y-5.5">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-zinc-900 pb-4">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-zinc-150">Pedido en Mesa</h4>
              <p className="text-xs text-zinc-550">Completa el pedido y envíalo a cocina</p>
            </div>
          </div>

          {/* Table & Customer Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] ml-1 flex items-center gap-1">
                <Hash className="h-3 w-3 text-emerald-400" /> Mesa #
              </label>
              <input
                type="text"
                required
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="Ej. 5"
                className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none font-semibold text-center text-sm"
              />
            </div>
            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] ml-1 flex items-center gap-1">
                <User className="h-3 w-3 text-emerald-400" /> Cliente (Opcional)
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ej. Juan Pérez"
                className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] ml-1">Teléfono (Opcional)</label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="0999999999"
                className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
              />
            </div>
            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] ml-1">Pago</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full bg-zinc-900 border border-zinc-850 focus:border-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs cursor-pointer font-medium"
              >
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
              </select>
            </div>
          </div>

          {/* Cart List */}
          <div className="space-y-3">
            <span className="text-xs font-bold text-zinc-450 uppercase tracking-wider block">Items Seleccionados</span>
            <div className="max-h-60 overflow-y-auto pr-1 space-y-2.5 custom-scrollbar">
              {cart.length > 0 ? (
                cart.map((item, idx) => (
                  <div key={item.menuItem.id} className="bg-zinc-900/40 border border-zinc-850/80 p-3 rounded-2xl space-y-2 hover:border-zinc-800 transition-colors">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-zinc-200 block truncate">{item.menuItem.name}</span>
                        <span className="text-[11px] text-zinc-500 block font-semibold">${Number(item.menuItem.price).toFixed(2)} c/u</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.menuItem.id, -1)}
                          className="p-1 rounded bg-zinc-905 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-6 text-center text-xs font-bold text-zinc-200">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.menuItem.id, 1)}
                          className="p-1 rounded bg-zinc-905 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.menuItem.id)}
                          className="p-1 ml-1 rounded bg-zinc-900 text-rose-500 hover:bg-rose-500/10 cursor-pointer border border-transparent"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Item Notes */}
                    {editingItemNotes?.index === idx ? (
                      <div className="flex gap-1.5 items-center">
                        <input
                          type="text"
                          autoFocus
                          value={editingItemNotes.value}
                          onChange={(e) => setEditingItemNotes(prev => prev ? { ...prev, value: e.target.value } : null)}
                          placeholder="Ej. sin hielo, bien cocido"
                          className="w-full bg-zinc-950 border border-zinc-850 p-1.5 rounded-lg text-zinc-300 outline-none text-[11px]"
                        />
                        <button
                          onClick={() => {
                            updateItemNotes(idx, editingItemNotes.value);
                            setEditingItemNotes(null);
                          }}
                          className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-[11px] gap-2">
                        <span className="text-zinc-550 italic truncate max-w-[200px]">
                          {item.notes ? `Nota: "${item.notes}"` : 'Sin especificaciones'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditingItemNotes({ index: idx, value: item.notes })}
                          className="text-[10px] text-emerald-450 hover:underline cursor-pointer bg-transparent border-none outline-none font-semibold shrink-0"
                        >
                          {item.notes ? 'Editar nota' : 'Agregar nota'}
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="py-8 text-center flex flex-col items-center justify-center gap-2 border border-dashed border-zinc-900 rounded-2xl">
                  <ShoppingCart className="h-8 w-8 text-zinc-800" />
                  <span className="text-xs text-zinc-650 font-medium">Ningún plato agregado aún</span>
                </div>
              )}
            </div>
          </div>

          {/* General Notes */}
          <div className="space-y-1.5 text-xs">
            <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] ml-1 flex items-center gap-1">
              <Clipboard className="h-3 w-3 text-emerald-400" /> Notas Generales del Pedido
            </label>
            <textarea
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              placeholder="Ej. Entregar cubiertos adicionales, servir bebidas al final"
              rows={2}
              className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs resize-none"
            />
          </div>

          {/* Totals */}
          <div className="border-t border-zinc-900 pt-4 space-y-2 text-xs">
            <div className="flex justify-between text-zinc-450 font-semibold">
              <span>Subtotal:</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-zinc-450 font-semibold">
              <span>IVA (10%):</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-zinc-150 text-sm font-bold pt-1.5 border-t border-zinc-900/50">
              <span>Total a Pagar:</span>
              <span className="text-emerald-400 font-extrabold text-base">${total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmitOrder}
          disabled={submitting || cart.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-900 disabled:text-zinc-650 disabled:border-zinc-850 text-white font-semibold py-3 px-4 rounded-xl shadow-lg border border-transparent transition-all cursor-pointer mt-4"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Registrando pedido...
            </>
          ) : (
            <>
              <Check className="h-4 w-4" /> Confirmar y Enviar a Cocina
            </>
          )}
        </button>
      </div>
    </div>
  );
}
