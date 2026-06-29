'use client';

import React from 'react';
import { Order, OrderStatus } from '@/types';
import { UtensilsCrossed, CheckCircle, Clock, Coffee, Sparkles, AlertCircle } from 'lucide-react';

interface AuxiliarDisplayProps {
  orders: Order[];
  onUpdateStatus: (orderId: string, status: OrderStatus) => Promise<boolean>;
  onUpdateCutleryStatus?: (orderId: string, delivered: boolean) => Promise<boolean>;
  role?: string | null;
}

export default function AuxiliarDisplay({ orders, onUpdateStatus, onUpdateCutleryStatus, role }: AuxiliarDisplayProps) {
  // Pedidos listos para servir cubiertos (pagado o listo, y aún no entregado)
  const readyDineIn = orders.filter(
    (o) => o.type === 'dine_in' && !o.cutlery_delivered && (o.is_paid || o.status === 'ready') && o.status !== 'delivered' && o.status !== 'cancelled'
  );

  // Pedidos entregados donde hay que recoger y limpiar la mesa (delivered)
  const toClean = orders.filter(
    (o) => o.type === 'dine_in' && o.status === 'delivered'
  );

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getWaitMinutes = (isoString: string) => {
    return Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
  };

  const CutleryCard = ({ order }: { order: Order }) => {
    const waitMin = getWaitMinutes(order.updated_at || order.created_at);

    // Build cutlery summary from items
    const cutlerySummary: Record<string, number> = {};
    order.order_items?.forEach((item) => {
      if (item.menu_items?.default_cutlery) {
        const k = item.menu_items.default_cutlery.trim();
        cutlerySummary[k] = (cutlerySummary[k] || 0) + item.quantity;
      }
    });

    // Extra cutlery notes from notes/extras fields
    const extraCutleryNotes = order.order_items?.flatMap((item) => {
      const kw = /cubiert|cuchar|cuchill|tenedor|vaso|sorbete|copa/i;
      const entries: { plato: string; nota: string }[] = [];
      if (item.notes && kw.test(item.notes))
        entries.push({ plato: item.menu_items?.name || 'Plato', nota: `📝 ${item.notes}` });
      if (item.extras && kw.test(item.extras))
        entries.push({ plato: item.menu_items?.name || 'Plato', nota: `➕ ${item.extras}` });
      return entries;
    }) || [];

    return (
      <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/50 rounded-2xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/30 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="min-w-[2.5rem] h-10 px-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-black text-2xl rounded-xl border border-red-200 dark:border-red-800/50 flex items-center justify-center shadow-sm">
              {order.table_number}
            </div>
            <div>
              <p className="font-bold text-zinc-900 dark:text-zinc-100 text-base">Mesa {order.table_number}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{order.customer_name}</p>
            </div>
          </div>
          <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
            waitMin > 5
              ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/30'
              : 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/30'
          }`}>
            <Clock className="h-3.5 w-3.5" />
            {waitMin} min esperando
          </div>
        </div>

        {/* Items list */}
        <div className="px-4 py-3 space-y-1.5">
          {order.order_items?.map((item) => (
            <div key={item.id} className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="font-semibold">{item.quantity}x</span> {item.menu_items?.name || 'Plato'}
            </div>
          ))}
        </div>

        {/* Cutlery summary — the main focus */}
        {(Object.keys(cutlerySummary).length > 0 || extraCutleryNotes.length > 0) && (
          <div className="mx-4 mb-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 rounded-xl p-3">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <UtensilsCrossed className="h-3.5 w-3.5" /> Cubiertos a llevar
            </p>
            {Object.keys(cutlerySummary).length > 0 && (
              <ul className="space-y-1 mb-2">
                {Object.entries(cutlerySummary).map(([c, qty]) => (
                  <li key={c} className="flex items-center justify-between text-sm font-semibold text-amber-900 dark:text-amber-300">
                    <span>{c}</span>
                    <span className="bg-amber-200 dark:bg-amber-800/60 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded-md text-xs font-bold">x{qty}</span>
                  </li>
                ))}
              </ul>
            )}
            {extraCutleryNotes.length > 0 && (
              <ul className="space-y-1">
                {extraCutleryNotes.map((n, i) => (
                  <li key={i} className="text-xs text-amber-800 dark:text-amber-400 flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                    <span><strong>{n.plato}:</strong> {n.nota}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Action button */}
        <div className="px-4 pb-4">
          <button
            onClick={() => onUpdateCutleryStatus ? onUpdateCutleryStatus(order.id, true) : null}
            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl font-bold shadow-sm transition-all text-base cursor-pointer"
          >
            <CheckCircle className="h-5 w-5" />
            Cubiertos entregados ✓
          </button>
        </div>
      </div>
    );
  };

  const CleanCard = ({ order }: { order: Order }) => {
    const waitMin = getWaitMinutes(order.updated_at || order.created_at);
    return (
      <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-violet-50 dark:bg-violet-900/20 border-b border-violet-200 dark:border-violet-800/30 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="min-w-[2.5rem] h-10 px-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-black text-2xl rounded-xl border border-red-200 dark:border-red-800/50 flex items-center justify-center shadow-sm">
              {order.table_number}
            </div>
            <div>
              <p className="font-bold text-zinc-900 dark:text-zinc-100 text-base">Mesa {order.table_number}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{order.customer_name} · {formatTime(order.updated_at || order.created_at)}</p>
            </div>
          </div>
          <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
            waitMin > 10
              ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/30'
              : 'bg-violet-50 dark:bg-violet-950/20 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-900/30'
          }`}>
            <Clock className="h-3.5 w-3.5" />
            {waitMin} min
          </div>
        </div>

        <div className="px-4 py-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Clientes han terminado. Por favor recoge la mesa y déjala lista.</p>
        </div>

        <div className="px-4 pb-4">
          {(role === 'admin' || role === 'admin_general') && (
            <button
              onClick={() => onUpdateStatus(order.id, 'cancelled')}
              className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-500 active:scale-95 text-white rounded-xl font-bold shadow-sm transition-all text-base cursor-pointer"
            >
              <Sparkles className="h-5 w-5" />
              Mesa lista ✓
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-lg mx-auto pb-24 px-2">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-zinc-850 dark:text-white flex items-center gap-2">
          <Coffee className="h-6 w-6 text-amber-500" /> Panel Auxiliar de Servicio
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Entrega cubiertos y recoge mesas en tiempo real.
        </p>
      </div>

      <div className="space-y-8">
        {/* Section: Cubiertos pendientes */}
        <section>
          <h2 className="text-sm font-bold text-zinc-500 dark:text-zinc-450 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
            Cubiertos a entregar ({readyDineIn.length})
          </h2>
          {readyDineIn.length === 0 ? (
            <div className="bg-zinc-50 dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800/30 rounded-xl p-6 text-center text-zinc-500 dark:text-zinc-400 text-sm">
              <UtensilsCrossed className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No hay mesas esperando cubiertos ahora.
            </div>
          ) : (
            <div className="space-y-4">
              {readyDineIn.map((order) => (
                <CutleryCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </section>

        {/* Section: Mesas a recoger */}
        <section>
          <h2 className="text-sm font-bold text-zinc-500 dark:text-zinc-450 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
            Mesas a limpiar ({toClean.length})
          </h2>
          {toClean.length === 0 ? (
            <div className="bg-zinc-50 dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800/30 rounded-xl p-6 text-center text-zinc-500 dark:text-zinc-400 text-sm">
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Todas las mesas están limpias.
            </div>
          ) : (
            <div className="space-y-4">
              {toClean.map((order) => (
                <CleanCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
