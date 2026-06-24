'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Kitchen } from '@/types';
import { Loader2, Plus, Edit, Trash2, AlertCircle, ChefHat } from 'lucide-react';
import { toast } from 'sonner';

interface KitchensPanelProps {
  restaurantId: string;
}

export default function KitchensPanel({ restaurantId }: KitchensPanelProps) {
  const [kitchens, setKitchens] = useState<Kitchen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingKitchen, setEditingKitchen] = useState<Kitchen | null>(null);
  
  const [name, setName] = useState('');
  const [administrator, setAdministrator] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchKitchens = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('kitchens')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('name', { ascending: true });

      if (error) throw error;
      setKitchens(data || []);
    } catch (err: any) {
      console.error('Error fetching kitchens:', err);
      setError('Error al cargar las cocinas.');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchKitchens();
  }, [fetchKitchens]);

  const handleOpenModal = (kitchen?: Kitchen) => {
    if (kitchen) {
      setEditingKitchen(kitchen);
      setName(kitchen.name);
      setAdministrator(kitchen.administrator || '');
    } else {
      setEditingKitchen(null);
      setName('');
      setAdministrator('');
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      if (editingKitchen) {
        const { error } = await supabase
          .from('kitchens')
          .update({ name, administrator: administrator || null })
          .eq('id', editingKitchen.id);
        if (error) throw error;
        toast.success('Cocina actualizada');
      } else {
        const { error } = await supabase
          .from('kitchens')
          .insert({ restaurant_id: restaurantId, name, administrator: administrator || null });
        if (error) throw error;
        toast.success('Cocina creada');
      }
      setShowModal(false);
      fetchKitchens();
    } catch (err: any) {
      console.error('Error saving kitchen:', err);
      toast.error('Error al guardar la cocina');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta cocina? Se quitará la asignación de los platos que la usen.')) return;
    try {
      const { error } = await supabase.from('kitchens').delete().eq('id', id);
      if (error) throw error;
      toast.success('Cocina eliminada');
      fetchKitchens();
    } catch (err: any) {
      console.error('Error deleting kitchen:', err);
      toast.error('Error al eliminar la cocina');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-zinc-900 pb-4">
        <div>
          <h4 className="text-sm font-semibold text-zinc-200 font-bold flex items-center gap-2">
            <ChefHat className="h-4 w-4 text-emerald-500" /> Zonas de Preparación / Cocinas
          </h4>
          <p className="text-xs text-zinc-500">
            Administra las áreas de preparación (ej. Parrilla, Bebidas) para enrutar los pedidos.
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-1 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Nueva Cocina
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/15 border border-rose-900/30 text-rose-500 rounded-lg flex items-start gap-2 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {kitchens.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-zinc-900 rounded-xl space-y-2">
          <ChefHat className="w-8 h-8 text-zinc-700 mx-auto" />
          <h3 className="text-sm font-bold text-zinc-300">No hay cocinas configuradas</h3>
          <p className="text-xs text-zinc-500">
            Crea cocinas para organizar la preparación de los platillos.
          </p>
          <div className="pt-2">
            <button
              onClick={() => handleOpenModal()}
              className="px-3 py-1.5 border border-zinc-800 hover:bg-zinc-850 text-zinc-300 hover:text-zinc-100 rounded-xl font-bold transition-all text-xs"
            >
              Crear Primera Cocina
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-zinc-900/30 border border-zinc-900 rounded-xl overflow-hidden">
          <table className="min-w-full divide-y divide-zinc-900">
            <thead className="bg-zinc-950/50">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  Nombre
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  Administrador
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {kitchens.map((k) => (
                <tr key={k.id} className="hover:bg-zinc-900/50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-zinc-200">
                    {k.name}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-zinc-400">
                    {k.administrator || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right space-x-2">
                    <button
                      onClick={() => handleOpenModal(k)}
                      className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-transparent hover:border-zinc-850 cursor-pointer"
                      title="Editar"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(k.id)}
                      className="p-1.5 rounded-lg bg-zinc-900 text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-950/20 cursor-pointer"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-white mb-4">
              {editingKitchen ? 'Editar Cocina' : 'Nueva Cocina'}
            </h3>
            
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1 text-xs">
                <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Nombre de la Cocina</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Parrilla, Bebidas"
                  className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all"
                />
              </div>

              <div className="space-y-1 text-xs">
                <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Encargado / Administrador (Opcional)</label>
                <input
                  type="text"
                  value={administrator}
                  onChange={(e) => setAdministrator(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-900 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-transparent text-zinc-400 hover:text-white font-semibold rounded-xl transition-colors text-xs border border-zinc-800 hover:border-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 text-xs"
                >
                  {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                  {editingKitchen ? 'Actualizar' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
