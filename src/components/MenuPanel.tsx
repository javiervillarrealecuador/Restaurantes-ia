'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { MenuItem, MenuCategory, Kitchen } from '@/types';
import Image from 'next/image';
import { toast } from 'sonner';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Loader2, 
  AlertCircle, 
  FolderPlus, 
  Clock, 
  Eye, 
  EyeOff, 
  UtensilsCrossed,
  ImagePlus
} from 'lucide-react';

interface MenuPanelProps {
  restaurantId: string;
  readOnly?: boolean;
}

export default function MenuPanel({ restaurantId, readOnly = false }: MenuPanelProps) {
  // States
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string>('all');

  const [kitchens, setKitchens] = useState<Kitchen[]>([]);

  // Modals States
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  // Form States - Category
  const [categoryName, setCategoryName] = useState('');
  const [categoryDesc, setCategoryDesc] = useState('');
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Form States - Item
  const [itemName, setItemName] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemPrepTime, setItemPrepTime] = useState('15');
  const [itemCategoryId, setItemCategoryId] = useState('');
  const [itemKitchenId, setItemKitchenId] = useState('');
  const [itemAvailable, setItemAvailable] = useState(true);
  const [itemImageUrl, setItemImageUrl] = useState('');
  const [itemLoading, setItemLoading] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Menu Data
  const fetchMenuData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Categories & Kitchens
      const [catRes, kitRes] = await Promise.all([
        supabase
          .from('menu_categories')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('kitchens')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .order('name', { ascending: true })
      ]);

      if (catRes.error) throw catRes.error;
      const fetchedCategories = catRes.data || [];
      setCategories(fetchedCategories);

      if (kitRes.error) {
        console.error('Error fetching kitchens:', kitRes.error);
      } else {
        setKitchens(kitRes.data || []);
      }

      if (fetchedCategories.length > 0) {
        // Fetch Menu Items
        const categoryIds = fetchedCategories.map(c => c.id);
        const { data: itemsData, error: itemsErr } = await supabase
          .from('menu_items')
          .select('*')
          .in('category_id', categoryIds)
          .order('code', { ascending: true });

        if (itemsErr) throw itemsErr;
        setMenuItems(itemsData || []);
      } else {
        setMenuItems([]);
      }
    } catch (err: unknown) {
      const dbErr = err as Error;
      console.error('Error fetching menu data:', dbErr);
      setError('No se pudo cargar la carta del menú. Por favor, intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchMenuData();
  }, [fetchMenuData]);

  // Handle Toggle Item Availability
  const handleToggleAvailability = async (item: MenuItem) => {
    const updatedStatus = !item.is_available;
    
    // Optimistic UI Update
    setMenuItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: updatedStatus } : i));

    try {
      const { error: patchErr } = await supabase
        .from('menu_items')
        .update({ is_available: updatedStatus })
        .eq('id', item.id);

      if (patchErr) throw patchErr;
    } catch (err) {
      console.error('Error toggling menu item status:', err);
      // Revert Optimistic UI
      setMenuItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: item.is_available } : i));
      alert('Error al actualizar disponibilidad del platillo.');
    }
  };

  // Handle Save Category
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) return;

    setCategoryLoading(true);
    setCategoryError(null);

    try {
      const sortOrder = categories.length + 1;
      const { error: insErr } = await supabase
        .from('menu_categories')
        .insert({
          restaurant_id: restaurantId,
          name: categoryName.trim(),
          description: categoryDesc.trim() || null,
          sort_order: sortOrder,
          is_active: true
        });

      if (insErr) throw insErr;

      setCategoryName('');
      setCategoryDesc('');
      setShowCategoryModal(false);
      await fetchMenuData();
    } catch (err: unknown) {
      const dbErr = err as Error;
      console.error('Error saving category:', dbErr);
      setCategoryError(dbErr.message || 'Error al guardar la categoría.');
    } finally {
      setCategoryLoading(false);
    }
  };

  // Handle Image Upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !restaurantId) return;
    
    setUploadingImage(true);
    setItemError(null);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${restaurantId}/${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      
      const { error } = await supabase.storage
        .from('menu-images')
        .upload(fileName, file);
        
      if (error) throw error;
      
      const { data: publicUrlData } = supabase.storage
        .from('menu-images')
        .getPublicUrl(fileName);
        
      setItemImageUrl(publicUrlData.publicUrl);
      toast.success('Imagen subida correctamente');
    } catch (err) {
      console.error('Error uploading image:', err);
      setItemError('Error al subir la imagen. Por favor intenta con un archivo más pequeño.');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle Save Menu Item
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || !itemPrice || !itemCategoryId) {
      setItemError('Nombre, precio y categoría son campos obligatorios.');
      return;
    }

    setItemLoading(true);
    setItemError(null);

    const parsedPrice = parseFloat(itemPrice);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setItemError('El precio debe ser un número positivo.');
      setItemLoading(false);
      return;
    }

    const payload = {
      category_id: itemCategoryId,
      kitchen_id: itemKitchenId || null,
      name: itemName.trim(),
      description: itemDesc.trim() || null,
      price: parsedPrice,
      code: itemCode.trim() || null,
      estimated_prep_time: parseInt(itemPrepTime, 10) || 15,
      is_available: itemAvailable,
      image_url: itemImageUrl.trim() || null
    };

    try {
      if (editingItem) {
        // Edit Mode
        const { error: updErr } = await supabase
          .from('menu_items')
          .update(payload)
          .eq('id', editingItem.id);

        if (updErr) throw updErr;
      } else {
        // Create Mode
        const { error: insErr } = await supabase
          .from('menu_items')
          .insert(payload);

        if (insErr) throw insErr;
      }

      // Reset & Close
      setItemName('');
      setItemCode('');
      setItemPrice('');
      setItemDesc('');
      setItemPrepTime('15');
      setItemCategoryId('');
      setItemKitchenId('');
      setItemImageUrl('');
      setItemAvailable(true);
      setEditingItem(null);
      setShowItemModal(false);
      await fetchMenuData();
    } catch (err: unknown) {
      const dbErr = err as Error;
      console.error('Error saving menu item:', dbErr);
      setItemError(dbErr.message || 'Error al guardar el platillo.');
    } finally {
      setItemLoading(false);
    }
  };

  // Open Edit Item Modal
  const openEditItemModal = (item: MenuItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemCode(item.code || '');
    setItemPrice(String(item.price));
    setItemDesc(item.description || '');
    setItemPrepTime(String(item.estimated_prep_time));
    setItemCategoryId(item.category_id);
    setItemKitchenId(item.kitchen_id || '');
    setItemImageUrl(item.image_url || '');
    setItemAvailable(item.is_available);
    setItemError(null);
    setShowItemModal(true);
  };

  // Open Create Item Modal
  const openCreateItemModal = () => {
    setEditingItem(null);
    setItemName('');
    setItemCode('');
    setItemPrice('');
    setItemDesc('');
    setItemPrepTime('15');
    // Set default category to the active one if it is a specific UUID
    setItemCategoryId(activeCategoryId !== 'all' ? activeCategoryId : (categories[0]?.id || ''));
    setItemKitchenId('');
    setItemImageUrl('');
    setItemAvailable(true);
    setItemError(null);
    setShowItemModal(true);
  };

  // Handle Delete Menu Item
  const handleDeleteItem = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar "${name}" del menú?`)) return;

    try {
      const { error: delErr } = await supabase
        .from('menu_items')
        .delete()
        .eq('id', id);

      if (delErr) throw delErr;
      await fetchMenuData();
    } catch (err) {
      console.error('Error deleting menu item:', err);
      alert('No se pudo eliminar el platillo del menú.');
    }
  };

  // Filtered menu items
  const filteredItems = menuItems.filter(item => {
    const matchesCategory = activeCategoryId === 'all' || item.category_id === activeCategoryId;
    
    const query = searchQuery.toLowerCase().trim();
    if (!query) return matchesCategory;
    const matchesName = item.name.toLowerCase().includes(query);
    const matchesCode = item.code && item.code.toLowerCase().includes(query);
    const matchesDesc = item.description && item.description.toLowerCase().includes(query);

    return matchesCategory && (matchesName || matchesCode || matchesDesc);
  });

  return (
    <div className="space-y-6">
      
      {/* Upper header section */}
      <div className="pb-6 border-b border-zinc-200 dark:border-zinc-800/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Carta / Menú del Restaurante</h4>
          <p className="text-xs text-zinc-550 dark:text-zinc-400">Administra los platillos y bebidas que los clientes pueden ordenar.</p>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setCategoryError(null);
                setShowCategoryModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 text-xs font-semibold cursor-pointer transition-all"
            >
              <FolderPlus className="h-4 w-4" /> Categoría
            </button>
            <button
              onClick={openCreateItemModal}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Agregar Platillo
            </button>
          </div>
        )}
        {readOnly && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider">
            <Eye className="h-3.5 w-3.5" /> Solo lectura
          </span>
        )}
      </div>

      {error && (
        <div className="bg-rose-950/10 border border-rose-900/20 p-4 rounded-xl text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2.5">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-zinc-500 text-xs flex flex-col items-center justify-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          <span>Cargando la carta del menú...</span>
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-20 bg-zinc-50 dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800/60 rounded-xl text-xs text-zinc-550 space-y-3">
          <UtensilsCrossed className="h-8 w-8 text-zinc-400 dark:text-zinc-650 mx-auto" />
          <p>Aún no has registrado ninguna categoría en tu menú.</p>
          {!readOnly && (
            <button
              onClick={() => setShowCategoryModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
            >
              Crear primera categoría
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Search bar & Category filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar por nombre, descripción o código de plato..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-700/80 p-2 pl-9 rounded-xl text-xs text-zinc-800 dark:text-zinc-200 outline-none transition-all placeholder:text-zinc-555"
              />
            </div>

            <select
              value={activeCategoryId}
              onChange={(e) => setActiveCategoryId(e.target.value)}
              className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-700 text-zinc-600 dark:text-zinc-350 text-xs px-3.5 py-2.5 rounded-xl outline-none"
            >
              <option value="all">Todas las Categorías</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Category Tabs list */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
            <button
              onClick={() => setActiveCategoryId('all')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider shrink-0 transition-all cursor-pointer ${
                activeCategoryId === 'all'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-50 dark:bg-zinc-900/40 text-zinc-550 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              Todos ({menuItems.length})
            </button>
            {categories.map((cat) => {
              const count = menuItems.filter(i => i.category_id === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategoryId(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider shrink-0 transition-all cursor-pointer ${
                    activeCategoryId === cat.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-50 dark:bg-zinc-900/40 text-zinc-550 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>

          {/* Menu Items Table list */}
          {filteredItems.length === 0 ? (
            <div className="text-center py-20 bg-zinc-50 dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800/60 rounded-xl text-xs text-zinc-550">
              No se encontraron platos que coincidan con la búsqueda o categoría seleccionada.
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      <th className="py-3.5 px-4 w-16">Código</th>
                      <th className="py-3.5 px-4">Platillo</th>
                      <th className="py-3.5 px-4 w-28">Categoría</th>
                      <th className="py-3.5 px-4 w-20 text-right">Precio</th>
                      <th className="py-3.5 px-4 w-28 text-center">Cocción</th>
                      <th className="py-3.5 px-4 w-24 text-center">Estado</th>
                      <th className="py-3.5 px-4 w-24 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-150 dark:divide-zinc-850/60 text-xs">
                    {filteredItems.map((item) => {
                      const category = categories.find(c => c.id === item.category_id);
                      return (
                        <tr 
                          key={item.id} 
                          className={`hover:bg-zinc-50 dark:hover:bg-zinc-900/25 transition-colors ${!item.is_available ? 'opacity-60 bg-zinc-100/40 dark:bg-zinc-950/20' : ''}`}
                        >
                          <td className="py-3.5 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {item.code ? `#${item.code}` : '-'}
                          </td>
                          <td className="py-3.5 px-4 flex items-center gap-3">
                            <div className="relative h-10 w-10 shrink-0 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                              {item.image_url ? (
                                <Image 
                                  src={item.image_url} 
                                  alt={item.name} 
                                  fill 
                                  className="object-cover"
                                  sizes="40px"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-400 dark:text-zinc-600">
                                  <UtensilsCrossed className="h-4 w-4" />
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-zinc-850 dark:text-zinc-200">{item.name}</div>
                              {item.description && (
                                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-normal line-clamp-1 mt-0.5 max-w-sm">
                                  {item.description}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-zinc-500 dark:text-zinc-400 font-medium text-[11px]">
                            {category?.name || 'Sin Categoría'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-zinc-850 dark:text-zinc-200">
                            ${Number(item.price).toFixed(2)}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-450 font-medium">
                              <Clock className="h-3 w-3 text-emerald-500/85" /> {item.estimated_prep_time} min
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              disabled={readOnly}
                              onClick={() => handleToggleAvailability(item)}
                              title={item.is_available ? 'Desactivar platillo' : 'Activar platillo'}
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                                item.is_available 
                                  ? 'bg-emerald-50 dark:bg-emerald-950/25 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/20' 
                                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-250 dark:border-zinc-850 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                              } ${readOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              {item.is_available ? (
                                <>
                                  <Eye className="h-3 w-3 shrink-0" />
                                  <span>Disponible</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="h-3 w-3 shrink-0" />
                                  <span>Agotado</span>
                                </>
                              )}
                            </button>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {!readOnly ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => openEditItemModal(item)}
                                  className="p-1.5 rounded bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-550 dark:text-zinc-450 hover:text-zinc-800 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 transition-colors cursor-pointer"
                                  title="Editar plato"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(item.id, item.name)}
                                  className="p-1.5 rounded bg-rose-50 dark:bg-rose-950/15 hover:bg-rose-100 dark:hover:bg-rose-955/25 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/30 transition-colors cursor-pointer"
                                  title="Eliminar plato"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-zinc-550 dark:text-zinc-650 italic">Ver</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Category Creation Modal - only for write access */}
      {showCategoryModal && !readOnly && (
        <div className="fixed inset-0 z-50 bg-[#000000]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-900 max-w-md w-full rounded-3xl p-6.5 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-zinc-150">Agregar Categoría de Menú</h4>
                <p className="text-xs text-zinc-500">Crea una nueva clasificación para organizar los platos.</p>
              </div>
              <button 
                onClick={() => setShowCategoryModal(false)}
                className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-zinc-250 border border-zinc-850 cursor-pointer"
              >
                <Plus className="h-4 w-4 rotate-45" />
              </button>
            </div>

            {categoryError && (
              <div className="bg-rose-950/10 border border-rose-950/45 p-3 rounded-lg text-rose-450 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{categoryError}</span>
              </div>
            )}

            <form onSubmit={handleSaveCategory} className="space-y-4.5">
              <div className="space-y-1 text-xs">
                <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Nombre de Categoría</label>
                <input
                  type="text"
                  required
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="Ej. Sopas, Especialidades, Bebidas"
                  className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all"
                />
              </div>

              <div className="space-y-1 text-xs">
                <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Descripción (Opcional)</label>
                <textarea
                  value={categoryDesc}
                  onChange={(e) => setCategoryDesc(e.target.value)}
                  placeholder="Breve descripción o notas sobre esta sección del menú..."
                  rows={3}
                  className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={categoryLoading}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-650 text-white font-semibold py-3 px-4 rounded-xl shadow-lg transition-all cursor-pointer mt-2 text-xs"
              >
                {categoryLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Guardando...
                  </>
                ) : 'Crear Categoría'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Item Creation / Edition Modal - only for write access */}
      {showItemModal && !readOnly && (
        <div className="fixed inset-0 z-50 bg-[#000000]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-900 max-w-lg w-full rounded-3xl p-6.5 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-zinc-150">
                  {editingItem ? 'Modificar Platillo' : 'Agregar Platillo al Menú'}
                </h4>
                <p className="text-xs text-zinc-500">
                  {editingItem ? 'Edita los datos del plato seleccionado.' : 'Crea un nuevo platillo que se publicará en la carta.'}
                </p>
              </div>
              <button 
                onClick={() => setShowItemModal(false)}
                className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-zinc-250 border border-zinc-850 cursor-pointer"
              >
                <Plus className="h-4 w-4 rotate-45" />
              </button>
            </div>

            {itemError && (
              <div className="bg-rose-950/10 border border-rose-950/45 p-3 rounded-lg text-rose-455 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{itemError}</span>
              </div>
            )}

            <form onSubmit={handleSaveItem} className="space-y-4.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1 text-xs sm:col-span-2">
                  <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Nombre del Plato</label>
                  <input
                    type="text"
                    required
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="Ej. Hamburguesa completa, Cazuela"
                    className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all"
                  />
                </div>
                <div className="space-y-1 text-xs">
                  <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Código (Menú Impreso)</label>
                  <input
                    type="text"
                    value={itemCode}
                    onChange={(e) => setItemCode(e.target.value)}
                    placeholder="Ej. 515, 24"
                    className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="space-y-1 text-xs">
                  <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Categoría</label>
                  <select
                    value={itemCategoryId}
                    onChange={(e) => setItemCategoryId(e.target.value)}
                    required
                    className="w-full bg-zinc-900 border border-zinc-850 focus:border-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all text-xs"
                  >
                    <option value="" disabled>Seleccionar...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 text-xs">
                  <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Cocina</label>
                  <select
                    value={itemKitchenId}
                    onChange={(e) => setItemKitchenId(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-850 focus:border-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all text-xs"
                  >
                    <option value="">General / Ninguna</option>
                    {kitchens.map((k) => (
                      <option key={k.id} value={k.id}>{k.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 text-xs">
                  <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Precio ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={itemPrice}
                    onChange={(e) => setItemPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1 text-xs">
                  <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Tiempo (Min)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={itemPrepTime}
                    onChange={(e) => setItemPrepTime(e.target.value)}
                    placeholder="15"
                    className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1 text-xs">
                <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Descripción</label>
                <textarea
                  value={itemDesc}
                  onChange={(e) => setItemDesc(e.target.value)}
                  placeholder="Detalles sobre ingredientes, tamaño, etc..."
                  rows={2}
                  className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                <div className="space-y-1 text-xs sm:col-span-2">
                  <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">URL Imagen (Opcional)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={itemImageUrl}
                      onChange={(e) => setItemImageUrl(e.target.value)}
                      placeholder="https://images.unsplash.com/..."
                      className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-[10px] text-zinc-400 outline-none transition-all font-mono"
                    />
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleImageUpload} 
                      accept="image/*" 
                      className="hidden" 
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="shrink-0 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-xl px-3 flex items-center justify-center transition-colors disabled:opacity-50"
                      title="Subir Imagen"
                    >
                      {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin text-emerald-500" /> : <ImagePlus className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4 select-none">
                  <input
                    type="checkbox"
                    id="available"
                    checked={itemAvailable}
                    onChange={(e) => setItemAvailable(e.target.checked)}
                    className="h-4 w-4 accent-emerald-600 rounded bg-zinc-900 border-zinc-800"
                  />
                  <label htmlFor="available" className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] cursor-pointer">
                    Disponible
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={itemLoading}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-650 text-white font-semibold py-3 px-4 rounded-xl shadow-lg transition-all cursor-pointer mt-2 text-xs"
              >
                {itemLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Guardando...
                  </>
                ) : editingItem ? 'Guardar Cambios' : 'Registrar Platillo'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
