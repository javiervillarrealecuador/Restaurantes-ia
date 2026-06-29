'use client';

import React, { useEffect, useState, useRef } from 'react';
import { X, CreditCard, Loader2, CheckCircle2 } from 'lucide-react';

interface KushkiPaymentModalProps {
  total: number;
  orderId: string;
  onSuccess: (ticketNumber: string) => void;
  onCancel: () => void;
}

export default function KushkiPaymentModal({ total, orderId, onSuccess, onCancel }: KushkiPaymentModalProps) {
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const cardInstanceRef = useRef<any>(null);

  useEffect(() => {
    // 1. Cargar scripts oficiales desde el CDN de Kushki de forma dinámica
    const loadKushkiScripts = async () => {
      const loadScript = (src: string) => {
        return new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = src;
          script.onload = () => resolve(true);
          document.body.appendChild(script);
        });
      };

      try {
        await loadScript('https://cdn.kushkipagos.com/js/latest/kushki.min.js');
        await loadScript('https://cdn.kushkipagos.com/js/latest/card.min.js');
        
        // 2. Inicializar Hosted Fields
        // @ts-ignore
        const kushki = new Kushki({
          merchantId: process.env.NEXT_PUBLIC_KUSHKI_PUBLIC_KEY || '',
          inTestEnvironment: process.env.NEXT_PUBLIC_KUSHKI_ENV !== 'production'
        });

        const cardInstance = kushki.initHostedFields({
          fields: {
            cardNumber: { selector: '#kushki-card-number' },
            cardExpiry: { selector: '#kushki-card-expiry' },
            cardCvc: { selector: '#kushki-card-cvc' },
            cardHolderName: { selector: '#kushki-card-name' }
          }
        });

        cardInstanceRef.current = cardInstance;
        setLoading(false);
      } catch (err) {
        console.error('Error al inicializar el SDK de Kushki:', err);
        setErrorMsg('Error al cargar la pasarela de pagos. Por favor refresca la página.');
        setLoading(false);
      }
    };

    loadKushkiScripts();
  }, []);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardInstanceRef.current) return;

    setPaying(true);
    setErrorMsg('');

    try {
      // Solicitar Token a Kushki
      const tokenResponse = await cardInstanceRef.current.requestToken();
      if (!tokenResponse.token) {
        throw new Error('No se pudo generar el token de pago. Verifica los datos de tu tarjeta.');
      }

      // Enviar Token a tu API Backend
      const res = await fetch('/api/kushki/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenResponse.token,
          amount: total,
          orderId: orderId
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pago denegado');

      setPaid(true);
      setTimeout(() => {
        onSuccess(data.ticketNumber);
      }, 1500);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error al procesar el pago.');
      setPaying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-55">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="border-b border-zinc-800/60 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-teal-400" />
            <span className="text-zinc-100 font-bold text-sm">Pago con Tarjeta (Kushki)</span>
          </div>
          <button type="button" onClick={onCancel} className="text-zinc-500 hover:text-zinc-350">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <form onSubmit={handlePay} className="p-6 space-y-4">
          <div className="text-center space-y-1 py-2">
            <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">Total a Cobrar</p>
            <p className="text-3xl font-black text-teal-400">${total.toFixed(2)}</p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
              <p className="text-xs text-zinc-500">Cargando formulario seguro...</p>
            </div>
          ) : paid ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 animate-in zoom-in">
              <CheckCircle2 className="h-10 w-10 text-emerald-450" />
              <p className="text-sm text-zinc-200 font-bold">¡Pago Aprobado!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Contenedores de iframes seguros de Kushki */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-450 uppercase block">Nombre del Titular</label>
                <div id="kushki-card-name" className="h-10 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-200" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-450 uppercase block">Número de Tarjeta</label>
                <div id="kushki-card-number" className="h-10 bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-200" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-450 uppercase block">Vencimiento (MM/AA)</label>
                  <div id="kushki-card-expiry" className="h-10 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-200" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-450 uppercase block">CVV</label>
                  <div id="kushki-card-cvc" className="h-10 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-200" />
                </div>
              </div>

              {errorMsg && <p className="text-red-500 text-xs font-semibold pt-2">{errorMsg}</p>}

              <button
                type="submit"
                disabled={paying}
                className="w-full py-3 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-teal-500/10 cursor-pointer disabled:opacity-60 mt-4"
              >
                {paying ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Procesando...</> : 'Procesar Cobro'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
