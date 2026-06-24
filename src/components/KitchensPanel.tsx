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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Gestión de Cocinas</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Administra las áreas de preparación (ej. Parrilla, Bebidas) para enrutar los pedidos.
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva Cocina
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {kitchens.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <ChefHat className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No hay cocinas configuradas</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Crea cocinas para organizar la preparación de los platillos.
          </p>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
          >
            Crear Cocina
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Nombre
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Administrador
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {kitchens.map((k) => (
                <tr key={k.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {k.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {k.administrator || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleOpenModal(k)}
                      className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      <Edit className="w-4 h-4 inline" />
                    </button>
                    <button
                      onClick={() => handleDelete(k.id)}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingKitchen ? 'Editar Cocina' : 'Nueva Cocina'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nombre de Cocina *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Parrilla, Bebidas, Cocina Principal"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg p-2.5 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Administrador (Opcional)
                </label>
                <input
                  type="text"
                  value={administrator}
                  onChange={(e) => setAdministrator(e.target.value)}
                  placeholder="Nombre de la persona encargada"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg p-2.5 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg flex items-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
