'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { MenuItem, MenuCategory, Branch, MenuModifier, RestaurantTable } from '@/types';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
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
  Hash,
  Settings
} from 'lucide-react';

interface TakeOrderPanelProps {
  restaurantId: string;
  activeBranchId: string | null;
}

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  notes: string;
  extras: string;
  selectedModifiers?: MenuModifier[];
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
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'card'>('cash');

  // Cart & Modifiers
  const [cart, setCart] = useState<CartItem[]>([]);
  // New states for Phase 4
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [allModifiers, setAllModifiers] = useState<MenuModifier[]>([]);
  const [activeOrder, setActiveOrder] = useState<any | null>(null);
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<MenuModifier[]>([]);
  const [customizingNotes, setCustomizingNotes] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [loadingActiveOrder, setLoadingActiveOrder] = useState(false);

  const { role, isSuperAdmin, profile } = useAuth();
  const isAdmin = role === 'admin_general' || (role as any) === 'admin' || isSuperAdmin;
  const [showTableManager, setShowTableManager] = useState(false);
  const [targetTableQty, setTargetTableQty] = useState(12);
  const [payBeforeConsume, setPayBeforeConsume] = useState<boolean>(false);

  // Audio synthesizer for ding-dong notification
  const playReadyChime = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      gain1.gain.setValueAtTime(0.25, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.35);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain2.gain.setValueAtTime(0.25, ctx.currentTime + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.55);
      osc2.start(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.55);
    } catch (e) {
      console.error('Audio play failed:', e);
    }
  };

  const fetchTables = async () => {
    if (!selectedBranchId) return;
    try {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('branch_id', selectedBranchId)
        .order('table_number', { ascending: true });
      if (error) throw error;
      
      const sorted = (data || []).sort((a, b) => {
        const numA = parseInt(a.table_number, 10);
        const numB = parseInt(b.table_number, 10);
        if (isNaN(numA) || isNaN(numB)) {
          return a.table_number.localeCompare(b.table_number);
        }
        return numA - numB;
      });
      setTables(sorted);
      if (sorted && sorted.length > 0) {
        setTargetTableQty(sorted.length);
      }

      // If the currently selected table has changed status to free, reset the active order selection
      if (tableNumber) {
        const currentTable = data?.find(t => t.table_number === tableNumber);
        if (currentTable && currentTable.status === 'free' && activeOrder) {
          setActiveOrder(null);
          setTableNumber('');
          setCart([]);
          toast.info(`La Mesa ${tableNumber} ha sido liberada por caja.`);
        }
      }
    } catch (err) {
      console.error('Error fetching tables:', err);
    }
  };

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
        const existsActive = activeBranchId ? activeBranches.some((b: any) => b.id === activeBranchId) : false;
        let defaultBranchId = '';
        if (existsActive && activeBranchId) {
          defaultBranchId = activeBranchId;
        } else if (activeBranches.length > 0) {
          defaultBranchId = activeBranches[0].id;
        }
        setSelectedBranchId(defaultBranchId);

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

        // 5. Fetch modifiers
        const { data: modifierData } = await supabase
          .from('menu_modifiers')
          .select('*');
        setAllModifiers(modifierData || []);

        // 6. Fetch settings for payBeforeConsume
        const { data: settingsData } = await supabase
          .from('settings')
          .select('pay_before_consume')
          .eq('restaurant_id', restaurantId)
          .single();
        if (settingsData) {
          setPayBeforeConsume(settingsData.pay_before_consume || false);
        }

      } catch (err) {
        console.error('Error loading order panel data:', err);
        toast.error('Error al cargar la carta o sucursales.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [restaurantId, activeBranchId]);

  // Load tables when selected branch changes
  useEffect(() => {
    if (selectedBranchId) {
      fetchTables();
    }
  }, [selectedBranchId]);

  // Realtime subscriptions for ready orders and floor plan changes
  useEffect(() => {
    if (!selectedBranchId) return;

    // Listen for order updates (cooked/ready status notifications)
    const orderChannel = supabase
      .channel(`order-ready-branch-${selectedBranchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `branch_id=eq.${selectedBranchId}`
        },
        (payload) => {
          const newOrder = payload.new as any;
          const oldOrder = payload.old as any;
          
          // Refresh table grid if order status changes (e.g. delivered, cancelled, or paid)
          if (newOrder.status !== oldOrder.status) {
            fetchTables();
            // Auto‑clear when the order associated with the current UI is completed or cancelled
            if (['delivered', 'cancelled', 'paid'].includes(newOrder.status)) {
              // Ensure we are clearing the order that is currently active in the panel
              if (activeOrder && activeOrder.id === newOrder.id) {
                // Use functional updates to avoid stale closures
                setActiveOrder(() => null);
                setTableNumber(() => '');
                setCart(() => []);
                toast.info(`Mesa ${newOrder.table_number || ''} liberada (${newOrder.status}).`);
              }
            }
          }

          if (newOrder.status === 'ready' && oldOrder.status !== 'ready') {
            playReadyChime();
            toast.success(`🛎️ ¡Mesa ${newOrder.table_number || 'S/M'}: Pedido #${newOrder.order_number} está listo!`, {
              duration: 10000,
              description: 'Retirar de cocina y servir al cliente.',
            });
          }
        }
      )
      .subscribe();

    // Listen for table status updates to keep the visual grid synced
    const tableChannel = supabase
      .channel(`tables-branch-${selectedBranchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_tables',
          filter: `branch_id=eq.${selectedBranchId}`
        },
        () => {
          fetchTables();
        }
      )
      .subscribe();

    // Polling fallback to keep tables synced even if realtime subscription is disabled or fails
    const pollingInterval = setInterval(() => {
      fetchTables();
    }, 10000);

    return () => {
      supabase.removeChannel(orderChannel);
      supabase.removeChannel(tableChannel);
      clearInterval(pollingInterval);
    };
  }, [selectedBranchId]);

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

  // Table Seeding Handler
  const handleSeedTables = async () => {
    if (!selectedBranchId || !restaurantId) return;
    setSeeding(true);
    try {
      const defaultTables = Array.from({ length: 12 }, (_, i) => ({
        restaurant_id: restaurantId,
        branch_id: selectedBranchId,
        table_number: `${i + 1}`,
        status: 'free',
        x_pos: (i % 4) + 1,
        y_pos: Math.floor(i / 4) + 1,
      }));
      const { error } = await supabase.from('restaurant_tables').insert(defaultTables);
      if (error) throw error;
      toast.success('¡12 mesas inicializadas con éxito!');
      fetchTables();
    } catch (err: any) {
      console.error('Error seeding tables:', err);
      toast.error('Error al inicializar mesas: ' + err.message);
    } finally {
      setSeeding(false);
    }
  };

  // Create Default Branch Handler (Fallback UX if no branches exist)
  const handleCreateDefaultBranch = async () => {
    if (!restaurantId) return;
    setSeeding(true);
    try {
      const { data, error } = await supabase
        .from('branches')
        .insert({
          restaurant_id: restaurantId,
          name: 'Sucursal Principal',
          address: 'Matriz',
          phone: '',
          is_active: true
        })
        .select()
        .single();
      if (error) throw error;
      toast.success('¡Sucursal Principal creada con éxito!');
      // Reload page to refresh context
      window.location.reload();
    } catch (err: any) {
      console.error('Error creating default branch:', err);
      toast.error('Error al crear sucursal: ' + err.message);
    } finally {
      setSeeding(false);
    }
  };

  const handleAdjustTables = async () => {
    if (!selectedBranchId || !restaurantId) return;
    if (targetTableQty < 1) {
      toast.error('La cantidad de mesas debe ser al menos 1');
      return;
    }
    setSeeding(true);
    try {
      // Fetch current tables
      const { data: currentTables, error: fetchErr } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('branch_id', selectedBranchId);
      
      if (fetchErr) throw fetchErr;

      const existingNumbers = new Set(currentTables?.map(t => t.table_number) || []);
      const newTables = [];

      // Add tables if target exceeds current
      for (let i = 1; i <= targetTableQty; i++) {
        const numStr = `${i}`;
        if (!existingNumbers.has(numStr)) {
          newTables.push({
            restaurant_id: restaurantId,
            branch_id: selectedBranchId,
            table_number: numStr,
            status: 'free',
            x_pos: ((i - 1) % 4) + 1,
            y_pos: Math.floor((i - 1) / 4) + 1,
          });
        }
      }

      // Identify tables to delete if target is less than current
      const tablesToDelete = (currentTables || []).filter(t => {
        const num = parseInt(t.table_number, 10);
        return !isNaN(num) && num > targetTableQty;
      });

      const occupiedTablesToDelete = tablesToDelete.filter(t => t.status !== 'free');
      if (occupiedTablesToDelete.length > 0) {
        const tableNums = occupiedTablesToDelete.map(t => t.table_number).join(', ');
        toast.error(`No se pueden eliminar las siguientes mesas porque están ocupadas: Mesa ${tableNums}. Libéralas o finaliza sus pedidos antes de reducir la cantidad.`);
        setSeeding(false);
        return;
      }

      let message = '';
      if (newTables.length > 0) {
        const { error: insertErr } = await supabase.from('restaurant_tables').insert(newTables);
        if (insertErr) throw insertErr;
        message += `Se crearon ${newTables.length} mesas nuevas. `;
      }

      if (tablesToDelete.length > 0) {
        const idsToDelete = tablesToDelete.map(t => t.id);
        const { error: deleteErr } = await supabase
          .from('restaurant_tables')
          .delete()
          .in('id', idsToDelete);
        if (deleteErr) throw deleteErr;
        message += `Se eliminaron ${tablesToDelete.length} mesas sobrantes.`;
      }

      if (message) {
        toast.success(message.trim());
      } else {
        toast.info('La cantidad de mesas ya es la solicitada.');
      }
      
      fetchTables();
      setShowTableManager(false);
    } catch (err: any) {
      console.error('Error adjusting tables:', err);
      toast.error('Error al configurar mesas: ' + err.message);
    } finally {
      setSeeding(false);
    }
  };

  // Delete Free Tables Handler
  const handleDeleteFreeTables = async () => {
    if (!selectedBranchId) return;
    if (!confirm('¿Estás seguro de que deseas eliminar todas las mesas que estén libres? Esta acción no se puede deshacer.')) return;
    setSeeding(true);
    try {
      const { error } = await supabase
        .from('restaurant_tables')
        .delete()
        .eq('branch_id', selectedBranchId)
        .eq('status', 'free');
      if (error) throw error;
      toast.success('Se eliminaron las mesas libres con éxito.');
      fetchTables();
      setTableNumber('');
      setActiveOrder(null);
      setCart([]);
    } catch (err: any) {
      console.error('Error deleting free tables:', err);
      toast.error('Error al eliminar mesas: ' + err.message);
    } finally {
      setSeeding(false);
    }
  };

  // Table Selection Handler
  const handleSelectTable = async (table: RestaurantTable) => {
    setTableNumber(table.table_number);
    if (table.status === 'occupied' || table.status === 'payment_requested') {
      if (table.current_order_id) {
        setLoadingActiveOrder(true);
        try {
          const { data, error } = await supabase
            .from('orders')
            .select('*, order_items(*, menu_items(*))')
            .eq('id', table.current_order_id)
            .single();
          if (error) throw error;
          
          setActiveOrder(data);
          setCustomerName(data.customer_name || '');
          setCustomerPhone(data.customer_phone || '');
          setPaymentMethod(data.payment_method || 'cash');
          setCart([]); // Reset new items
        } catch (err) {
          console.error('Error loading active order:', err);
          toast.error('Error al cargar los platos activos de la mesa.');
        } finally {
          setLoadingActiveOrder(false);
        }
      } else {
        setActiveOrder(null);
        setCart([]);
      }
    } else {
      setActiveOrder(null);
      setCart([]);
    }
  };

  // Request Bill Handler
  const handleRequestBill = async () => {
    if (!activeOrder || !tableNumber || !selectedBranchId) return;
    try {
      const { error } = await supabase
        .from('restaurant_tables')
        .update({ status: 'payment_requested' })
        .eq('branch_id', selectedBranchId)
        .eq('table_number', tableNumber);
      if (error) throw error;
      
      // Update the order status so it reflects in the admin queue
      await supabase
        .from('orders')
        .update({ status: 'payment_requested', updated_at: new Date().toISOString() })
        .eq('id', activeOrder.id);

      toast.success(`¡Cuenta solicitada para Mesa ${tableNumber}!`);
      fetchTables();
      setActiveOrder((prev: any) => prev ? { ...prev, status: 'payment_requested' } : null);
    } catch (err) {
      console.error('Error requesting bill:', err);
      toast.error('Error al solicitar la cuenta.');
    }
  };

  // Cart Modifiers Handlers
  const handleAddToCartClick = (item: MenuItem) => {
    if (!tableNumber) {
      toast.error('Por favor selecciona una mesa del plano antes de agregar platos.');
      return;
    }
    const itemModifiers = allModifiers.filter(m => m.menu_item_id === item.id);
    if (itemModifiers.length > 0) {
      setCustomizingItem(item);
      setCustomizingNotes('');
      setSelectedModifiers([]);
    } else {
      setCart(prev => {
        const existing = prev.find(i => i.menuItem.id === item.id && (!i.selectedModifiers || i.selectedModifiers.length === 0));
        if (existing) {
          return prev.map(i => i.menuItem.id === item.id && (!i.selectedModifiers || i.selectedModifiers.length === 0) 
            ? { ...i, quantity: i.quantity + 1 } : i);
        }
        return [...prev, { menuItem: item, quantity: 1, notes: '', extras: '', selectedModifiers: [] }];
      });
      toast.success(`${item.name} agregado al pedido`);
    }
  };

  const handleConfirmCustomization = () => {
    if (!customizingItem) return;

    const itemModifiers = allModifiers.filter(m => m.menu_item_id === customizingItem.id);
    const requiredModifiers = itemModifiers.filter(m => m.is_required);
    const missingRequired = requiredModifiers.filter(req => !selectedModifiers.some(sel => sel.id === req.id));

    if (missingRequired.length > 0) {
      toast.error(`Opciones obligatorias faltantes: ${missingRequired.map(m => m.name).join(', ')}`);
      return;
    }

    setCart(prev => {
      const existingIndex = prev.findIndex(i => {
        if (i.menuItem.id !== customizingItem.id) return false;
        if ((i.selectedModifiers?.length || 0) !== selectedModifiers.length) return false;
        const selIds = selectedModifiers.map(m => m.id).sort();
        const existingIds = (i.selectedModifiers || []).map(m => m.id).sort();
        return selIds.every((id, index) => id === existingIds[index]);
      });

      if (existingIndex > -1) {
        return prev.map((item, idx) => idx === existingIndex 
          ? { ...item, quantity: item.quantity + 1, notes: customizingNotes.trim() || item.notes } : item);
      }

      return [...prev, {
        menuItem: customizingItem,
        quantity: 1,
        notes: customizingNotes.trim(),
        extras: '',
        selectedModifiers: selectedModifiers
      }];
    });

    toast.success(`${customizingItem.name} (personalizado) agregado`);
    setCustomizingItem(null);
    setSelectedModifiers([]);
    setCustomizingNotes('');
  };

  const updateQuantity = (itemId: string, delta: number, itemModifiers?: MenuModifier[]) => {
    setCart(prev => {
      return prev.map(i => {
        if (i.menuItem.id === itemId) {
          // Verify matching modifiers config to target the correct row
          const m1 = (itemModifiers || []).map(m => m.id).sort();
          const m2 = (i.selectedModifiers || []).map(m => m.id).sort();
          const matches = m1.length === m2.length && m1.every((val, index) => val === m2[index]);
          if (matches) {
            const newQty = i.quantity + delta;
            return newQty > 0 ? { ...i, quantity: newQty } : i;
          }
        }
        return i;
      }).filter(i => i.quantity > 0);
    });
  };

  const removeFromCart = (itemId: string, itemModifiers?: MenuModifier[]) => {
    setCart(prev => prev.filter(i => {
      if (i.menuItem.id !== itemId) return true;
      const m1 = (itemModifiers || []).map(m => m.id).sort();
      const m2 = (i.selectedModifiers || []).map(m => m.id).sort();
      const matches = m1.length === m2.length && m1.every((val, index) => val === m2[index]);
      return !matches;
    }));
    toast.error('Item eliminado del pedido');
  };



  // Calculations (Prices are PVP - 15% VAT included)
  const total = cart.reduce((acc, curr) => {
    const itemModifiersPrice = curr.selectedModifiers?.reduce((sum, m) => sum + Number(m.price), 0) || 0;
    return acc + ((Number(curr.menuItem.price) + itemModifiersPrice) * curr.quantity);
  }, 0);
  const subtotal = Number((total / 1.15).toFixed(2));
  const tax = Number((total - subtotal).toFixed(2));

  // Submit Order
  const handleSubmitOrder = async () => {
    if (cart.length === 0) {
      toast.error('El pedido está vacío.');
      return;
    }
    if (!tableNumber) {
      toast.error('Por favor selecciona una mesa.');
      return;
    }
    if (branches.length > 0 && !selectedBranchId) {
      toast.error('Por favor selecciona una sucursal.');
      return;
    }

    setSubmitting(true);
    try {
      if (activeOrder) {
        // Appending new items to existing order
        const newItemsToInsert = cart.map(item => ({
          order_id: activeOrder.id,
          menu_item_id: item.menuItem.id,
          quantity: item.quantity,
          unit_price: item.menuItem.price,
          notes: item.notes.trim() || null,
          selected_modifiers: item.selectedModifiers ? item.selectedModifiers.map(m => ({ name: m.name, price: Number(m.price) })) : []
        }));

        const { error: itemsErr } = await supabase
          .from('order_items')
          .insert(newItemsToInsert);

        if (itemsErr) throw itemsErr;

        const updatedSubtotal = Number(activeOrder.subtotal) + subtotal;
        const updatedTax = Number(activeOrder.tax) + tax;
        const updatedTotal = Number(activeOrder.total_price) + total;

        const { error: orderUpdateErr } = await supabase
          .from('orders')
          .update({
            subtotal: updatedSubtotal,
            tax: updatedTax,
            total_price: updatedTotal,
            updated_at: new Date().toISOString()
          })
          .eq('id', activeOrder.id);

        if (orderUpdateErr) throw orderUpdateErr;

        // Restore table back to 'occupied' status in case it was 'payment_requested'
        await supabase
          .from('restaurant_tables')
          .update({ status: 'occupied' })
          .eq('branch_id', selectedBranchId)
          .eq('table_number', tableNumber);

        toast.success('¡Platos adicionales enviados a cocina!');
        
        setCart([]);
        setActiveOrder(null);
        setTableNumber('');
        setCustomerName('');
        setCustomerPhone('');
        fetchTables();
      } else {
        // Creating a new order
        const randSeq = String(Math.floor(100000 + Math.random() * 900000));
        const orderCode = `MES-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randSeq}`;

        const nameFinal = customerName.trim() || `Mesa ${tableNumber}`;
        const phoneFinal = customerPhone.trim() || '0999999999';
        const waiterName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Mesero';

        const { data: order, error: orderErr } = await supabase
          .from('orders')
          .insert({
            order_code: orderCode,
            restaurant_id: restaurantId,
            branch_id: selectedBranchId,
            status: payBeforeConsume ? 'pending_payment' : 'pending',
            type: 'dine_in',
            source: 'waiter',
            waiter_name: waiterName,
            customer_name: nameFinal,
            customer_phone: phoneFinal,
            table_number: tableNumber,
            notes: null,
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

        const orderItemsToInsert = cart.map(item => ({
          order_id: order.id,
          menu_item_id: item.menuItem.id,
          quantity: item.quantity,
          unit_price: item.menuItem.price,
          notes: item.notes.trim() || null,
          extras: item.extras?.trim() || null,
          selected_modifiers: item.selectedModifiers ? item.selectedModifiers.map(m => ({ name: m.name, price: Number(m.price) })) : []
        }));

        const { error: itemsErr } = await supabase
          .from('order_items')
          .insert(orderItemsToInsert);

        if (itemsErr) throw itemsErr;

        // Force an update on the orders table to trigger a realtime refresh with the new items
        await supabase
          .from('orders')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', order.id);

        // Update table relation
        await supabase
          .from('restaurant_tables')
          .update({
            status: 'occupied',
            current_order_id: order.id
          })
          .eq('branch_id', selectedBranchId)
          .eq('table_number', tableNumber);

        toast.success(payBeforeConsume ? '¡Pedido creado! Pendiente de cobro en caja.' : '¡Pedido creado con éxito y enviado a cocina!');
        
        setCart([]);
        setTableNumber('');
        setCustomerName('');
        setCustomerPhone('');
        fetchTables();
      }
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
        <span className="text-sm text-zinc-400 font-medium">Cargando carta y plano de mesas...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* LEFT: Menu Selection & Tables (8 cols) */}
      <div className="lg:col-span-7 space-y-5">
        {/* Branch Selector (Only if branches exist) */}
        {branches.length > 0 ? (
          <div className="bg-zinc-950 p-4 border border-zinc-900 rounded-3xl flex items-center justify-between gap-4 animate-in fade-in duration-200">
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
            {branches.length > 1 ? (
              <select
                value={selectedBranchId}
                onChange={(e) => {
                  setSelectedBranchId(e.target.value);
                  setCart([]);
                  setActiveOrder(null);
                  setTableNumber('');
                }}
                className="bg-zinc-900 border border-zinc-855 p-2.5 rounded-xl text-zinc-200 text-xs font-semibold outline-none cursor-pointer focus:border-emerald-500 transition-all"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-bold text-zinc-500 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-850">
                Única sucursal
              </span>
            )}
          </div>
        ) : (
          <div className="bg-amber-500/10 p-5 border border-amber-500/20 rounded-3xl space-y-4 animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
                <MapPin className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h5 className="text-sm font-bold text-amber-400">No hay sucursales registradas</h5>
                <p className="text-xs text-zinc-400">
                  Para poder crear y gestionar mesas, primero debes registrar al menos una sucursal para tu restaurante.
                </p>
              </div>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={handleCreateDefaultBranch}
                disabled={seeding}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {seeding ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Creando sucursal...
                  </>
                ) : (
                  'Crear Sucursal Principal'
                )}
              </button>
            )}
          </div>
        )}

        {/* Floor Plan (Tables Grid) */}
        {branches.length > 0 && (
          <div className="bg-zinc-950 border border-zinc-900 rounded-3xl p-5 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-zinc-900 pb-3">
            <div>
              <h4 className="text-sm font-bold text-zinc-150 flex items-center gap-1.5">🍽️ Plano de Mesas</h4>
              <p className="text-xs text-zinc-550">Selecciona una mesa para tomar o modificar pedidos</p>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && selectedBranchId && (
                <button
                  type="button"
                  onClick={() => setShowTableManager(!showTableManager)}
                  className={`px-3 py-1.5 border rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    showTableManager
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                  }`}
                >
                  <Settings className="h-3 w-3" />
                  Configurar Cantidad
                </button>
              )}
              {tables.length === 0 && selectedBranchId && (
                <button
                  type="button"
                  onClick={handleSeedTables}
                  disabled={seeding}
                  className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 disabled:bg-zinc-900 disabled:text-zinc-650 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {seeding ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" /> Inicializando...
                    </>
                  ) : (
                    'Inicializar 12 Mesas'
                  )}
                </button>
              )}
            </div>
          </div>

          {showTableManager && isAdmin && (
            <div className="bg-zinc-900/40 border border-zinc-850/60 p-4 rounded-2xl space-y-3 animate-in slide-in-from-top-4 duration-200">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-zinc-300">Configuración rápida de mesas</span>
                <p className="text-[10px] text-zinc-500">
                  Define el número total de mesas. Si aumentas la cantidad, se generarán automáticamente las mesas faltantes en la cuadrícula.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Total de mesas:</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={targetTableQty}
                    onChange={(e) => setTargetTableQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-1.5 rounded-lg text-zinc-150 outline-none text-xs text-center font-bold"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAdjustTables}
                  disabled={seeding}
                  className="px-3.5 py-1.5 bg-emerald-500 text-zinc-950 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  {seeding && <Loader2 className="h-3 w-3 animate-spin" />}
                  Guardar Cantidad
                </button>
                <button
                  type="button"
                  onClick={handleDeleteFreeTables}
                  disabled={seeding || tables.length === 0}
                  className="px-3 py-1.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 disabled:bg-zinc-900 disabled:text-zinc-650 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  Eliminar Libres
                </button>
              </div>
            </div>
          )}

          {tables.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {tables.map(table => {
                const isSelected = tableNumber === table.table_number;
                const statusColors = {
                  free: 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30',
                  occupied: 'bg-rose-500/5 border-rose-500/20 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30',
                  payment_requested: 'bg-amber-500/5 border-amber-500/20 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30',
                };
                return (
                  <button
                    key={table.id}
                    onClick={() => handleSelectTable(table)}
                    className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                      isSelected 
                        ? 'ring-2 ring-emerald-500 bg-zinc-900/60 border-emerald-500 scale-[1.03] shadow-lg shadow-black/40' 
                        : ''
                    } ${statusColors[table.status || 'free']}`}
                  >
                    <span className="text-xs font-bold block">Mesa {table.table_number}</span>
                    <span className="text-[9px] uppercase font-extrabold tracking-wider opacity-90 block">
                      {table.status === 'free' && '🟢 Libre'}
                      {table.status === 'occupied' && '🔴 Ocupada'}
                      {table.status === 'payment_requested' && '🟡 Cuenta'}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-center flex flex-col items-center justify-center gap-2 border border-dashed border-zinc-900 rounded-2xl">
              <span className="text-xs text-zinc-650 font-medium">No hay mesas registradas en esta sucursal</span>
            </div>
          )}
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
                    <p className="text-xs text-zinc-550 line-clamp-2 leading-relaxed">{item.description}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleAddToCartClick(item)}
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
              <p className="text-xs text-zinc-550">Ningún plato coincide con tu búsqueda o categoría en esta sucursal.</p>
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

          {/* Active Order Details display if modifying an occupied table */}
          {loadingActiveOrder ? (
            <div className="flex items-center justify-center py-6 gap-2 bg-zinc-900/20 border border-zinc-900 rounded-2xl">
              <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
              <span className="text-xs text-zinc-450 font-bold">Cargando platos servidos...</span>
            </div>
          ) : (
            activeOrder && (
              <div className="bg-zinc-900/60 border border-zinc-900 p-3.5 rounded-2xl space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-xs font-bold text-zinc-450 block uppercase tracking-wider">Orden Activa</span>
                    <span className="text-xs font-extrabold text-rose-400 block">#{activeOrder.order_number} ({activeOrder.status === 'payment_requested' ? 'Cuenta pedida' : activeOrder.status})</span>
                  </div>
                  <div className="flex gap-2">
                    {activeOrder.status !== 'ready' && activeOrder.status !== 'delivered' && (
                      <button
                        type="button"
                        onClick={handleRequestBill}
                        className="px-2.5 py-1.5 bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 text-amber-400 rounded-xl text-[10px] font-bold transition-all cursor-pointer"
                      >
                        Pedir Cuenta
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveOrder(null);
                        setTableNumber('');
                        setCart([]);
                      }}
                      className="px-2.5 py-1.5 bg-zinc-850 hover:bg-zinc-800 text-zinc-350 rounded-xl text-[10px] font-bold transition-all cursor-pointer border border-zinc-800"
                    >
                      Salir
                    </button>
                  </div>
                </div>
                
                <div className="border-t border-zinc-850 pt-2 space-y-2">
                  <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-wider block">Consumo Actual:</span>
                  <div className="max-h-36 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                    {activeOrder.order_items?.map((item: any) => {
                      const itemModifiersPrice = item.selected_modifiers?.reduce((sum: number, m: any) => sum + Number(m.price), 0) || 0;
                      const priceWithModifiers = Number(item.unit_price) + itemModifiersPrice;
                      return (
                        <div key={item.id} className="flex justify-between items-start text-xs text-zinc-400 border-b border-zinc-900/30 pb-1.5">
                          <div className="min-w-0">
                            <span className="font-semibold block truncate text-zinc-350">{item.menu_items?.name || 'Plato'} x {item.quantity}</span>
                            {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                              <span className="text-[10px] text-zinc-550 block truncate">
                                + {item.selected_modifiers.map((m: any) => m.name).join(', ')}
                              </span>
                            )}
                          </div>
                          <span className="font-bold text-zinc-300 shrink-0">${(priceWithModifiers * item.quantity).toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t border-zinc-850 pt-2 flex justify-between text-xs font-bold text-zinc-300">
                    <span>Subtotal actual:</span>
                    <span>${activeOrder.total_price?.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )
          )}

          {/* Table & Customer Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-zinc-450 uppercase tracking-wider text-[10px] ml-1 flex items-center gap-1">
                <Hash className="h-3 w-3 text-emerald-400" /> Mesa Seleccionada
              </label>
              <input
                type="text"
                readOnly
                required
                value={tableNumber ? `Mesa ${tableNumber}` : ''}
                placeholder="Selecciona del plano 🍽️"
                className="w-full bg-zinc-900/60 border border-zinc-850 p-2.5 rounded-xl text-zinc-200 outline-none font-bold text-center text-sm cursor-not-allowed placeholder:text-zinc-650"
              />
            </div>
            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-zinc-455 uppercase tracking-wider text-[10px] ml-1 flex items-center gap-1">
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
              <label className="font-bold text-zinc-450 uppercase tracking-wider text-[10px] ml-1">Teléfono (Opcional)</label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="0999999999"
                className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
              />
            </div>
            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-zinc-450 uppercase tracking-wider text-[10px] ml-1">Pago</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full bg-zinc-900 border border-zinc-850 focus:border-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs cursor-pointer font-medium"
              >
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="card">Tarjeta de Crédito/Débito</option>
              </select>
            </div>
          </div>

          {/* Cart List */}
          <div className="space-y-3">
            <span className="text-xs font-bold text-zinc-450 uppercase tracking-wider block">
              {activeOrder ? 'Nuevos Platos por Agregar' : 'Items Seleccionados'}
            </span>
            <div className="max-h-60 overflow-y-auto pr-1 space-y-2.5 custom-scrollbar">
              {cart.length > 0 ? (
                cart.map((item, idx) => {
                  const itemModifiersPrice = item.selectedModifiers?.reduce((sum, m) => sum + Number(m.price), 0) || 0;
                  const priceWithModifiers = Number(item.menuItem.price) + itemModifiersPrice;
                  return (
                    <div key={`${item.menuItem.id}-${idx}`} className="bg-zinc-900/40 border border-zinc-850/80 p-3 rounded-2xl space-y-2 hover:border-zinc-800 transition-colors">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-zinc-200 block truncate">{item.menuItem.name}</span>
                          <span className="text-[11px] text-zinc-500 block font-semibold">${priceWithModifiers.toFixed(2)} c/u</span>
                          {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                            <span className="text-[10px] text-emerald-450 block truncate font-semibold">
                              + {item.selectedModifiers.map(m => m.name).join(', ')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.menuItem.id, -1, item.selectedModifiers)}
                            className="p-1 rounded bg-zinc-905 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-6 text-center text-xs font-bold text-zinc-200">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.menuItem.id, 1, item.selectedModifiers)}
                            className="p-1 rounded bg-zinc-905 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.menuItem.id, item.selectedModifiers)}
                            className="p-1 ml-1 rounded bg-zinc-900 text-rose-500 hover:bg-rose-500/10 cursor-pointer border border-transparent"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Cutlery, Extras and Notes */}
                      <div className="pt-1 space-y-1.5">
                        {item.menuItem.default_cutlery && (
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-medium bg-zinc-900/50 p-1.5 rounded-lg border border-zinc-850 w-fit">
                            <span>🍴</span>
                            <span>{item.menuItem.default_cutlery}</span>
                          </div>
                        )}
                        <input
                          type="text"
                          value={item.extras || ''}
                          onChange={(e) => {
                            setCart(prev => prev.map((it, i) => i === idx ? { ...it, extras: e.target.value } : it));
                          }}
                          placeholder="Notas de cubiertos (Ej. 2 tenedores extra)"
                          className="w-full bg-zinc-950/80 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 p-2 rounded-lg text-zinc-300 outline-none text-[11px] placeholder:text-zinc-600 transition-all"
                        />
                        <input
                          type="text"
                          value={item.notes || ''}
                          onChange={(e) => {
                            setCart(prev => prev.map((it, i) => i === idx ? { ...it, notes: e.target.value } : it));
                          }}
                          placeholder="Notas (Ej. sin hielo, bien cocido)"
                          className="w-full bg-zinc-950/80 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 p-2 rounded-lg text-zinc-300 outline-none text-[11px] placeholder:text-zinc-600 transition-all"
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center flex flex-col items-center justify-center gap-2 border border-dashed border-zinc-900 rounded-2xl">
                  <ShoppingCart className="h-8 w-8 text-zinc-800" />
                  <span className="text-xs text-zinc-650 font-medium">Ningún plato agregado aún</span>
                </div>
              )}
            </div>
          </div>

          {/* Notas Generales removed to enforce per-item notes */}

          {/* Totals */}
          <div className="border-t border-zinc-900 pt-4 space-y-2 text-xs">
            <div className="flex justify-between text-zinc-450 font-semibold">
              <span>Subtotal {activeOrder ? 'Adicionales' : ''}:</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-zinc-450 font-semibold">
              <span>IVA (10%):</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-zinc-150 text-sm font-bold pt-1.5 border-t border-zinc-900/50">
              <span>Total {activeOrder ? 'Adicionales' : 'a Pagar'}:</span>
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
              <Loader2 className="h-4 w-4 animate-spin" /> Procesando...
            </>
          ) : activeOrder ? (
            <>
              <Check className="h-4 w-4" /> Enviar Adicionales a Cocina
            </>
          ) : (
            <>
              <Check className="h-4 w-4" /> Confirmar y Enviar a Cocina
            </>
          )}
        </button>
      </div>

      {/* Modifiers / Customization Modal */}
      {customizingItem && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-900 rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl relative">
            <div>
              <h3 className="text-base font-bold text-zinc-100">Personalizar {customizingItem.name}</h3>
              <p className="text-xs text-zinc-555">Selecciona las opciones adicionales</p>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-1">
              {allModifiers.filter(m => m.menu_item_id === customizingItem.id).map(mod => {
                const isSelected = selectedModifiers.some(m => m.id === mod.id);
                return (
                  <button
                    key={mod.id}
                    onClick={() => {
                      setSelectedModifiers(prev => {
                        if (prev.some(m => m.id === mod.id)) {
                          return prev.filter(m => m.id !== mod.id);
                        } else {
                          // Handle mutually exclusive options if allow_multiple is false
                          if (!mod.allow_multiple) {
                            // Flat list exclusion: exclude other modifiers with allow_multiple = false
                            // If they want beef temp like 3/4 and well done, allow_multiple = false avoids selecting both.
                            const otherModifiersOfItem = allModifiers.filter(m => m.menu_item_id === customizingItem.id);
                            const activeSingleSelectIds = otherModifiersOfItem.filter(m => !m.allow_multiple).map(m => m.id);
                            return [...prev.filter(m => !activeSingleSelectIds.includes(m.id)), mod];
                          }
                          return [...prev, mod];
                        }
                      });
                    }}
                    className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all text-left cursor-pointer ${
                      isSelected 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-bold' 
                        : 'bg-zinc-900/40 border-zinc-850 text-zinc-400 hover:text-zinc-250'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                        isSelected ? 'bg-emerald-500 border-emerald-500 text-black' : 'border-zinc-750'
                      }`}>
                        {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>
                      <span className="text-xs">{mod.name}</span>
                    </div>
                    {Number(mod.price) > 0 && (
                      <span className="text-xs text-emerald-400 font-bold">+${Number(mod.price).toFixed(2)}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Custom Notes */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider block ml-1">Notas especiales para este plato</label>
              <input
                type="text"
                value={customizingNotes}
                onChange={(e) => setCustomizingNotes(e.target.value)}
                placeholder="Ej. Sin cebolla, término 3/4"
                className="w-full bg-zinc-900 border border-zinc-850 focus:border-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setCustomizingItem(null);
                  setSelectedModifiers([]);
                  setCustomizingNotes('');
                }}
                className="flex-1 py-2.5 border border-zinc-850 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmCustomization}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
