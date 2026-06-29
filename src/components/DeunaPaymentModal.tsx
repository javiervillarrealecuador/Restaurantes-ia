'use client';

import React, { useState } from 'react';
import { Check, X, RefreshCw, CheckCircle2, Clock } from 'lucide-react';

interface DeunaPaymentModalProps {
  total: number;
  orderCode: string;
  onConfirm: () => void;   // El cajero confirma que ya recibió el pago
  onCancel: () => void;    // Cancelar y volver
}

export default function DeunaPaymentModal({
  total,
  orderCode,
  onConfirm,
  onCancel,
}: DeunaPaymentModalProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    // Pequeña pausa para efecto visual
    await new Promise(r => setTimeout(r, 800));
    setConfirmed(true);
    setConfirming(false);
    // Esperar a que el usuario vea la pantalla de éxito
    await new Promise(r => setTimeout(r, 1500));
    onConfirm();
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-[#00B5AD]/20 to-[#00897B]/20 border-b border-zinc-800/60 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Deuna logo (teal D) */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00B5AD] to-[#00897B] flex items-center justify-center shadow-lg shadow-teal-500/20">
              <span className="text-white font-black text-lg leading-none">D</span>
            </div>
            <div>
              <p className="text-zinc-100 font-bold text-sm">Pago con Deuna</p>
              <p className="text-zinc-500 text-[10px]">Escanea el QR para pagar</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">

          {/* Amount badge */}
          <div className="text-center space-y-1">
            <p className="text-zinc-500 text-xs uppercase tracking-widest font-semibold">Total a cobrar</p>
            <p className="text-4xl font-black text-teal-400">${total.toFixed(2)}</p>
            <p className="text-zinc-600 text-[10px]">Orden: {orderCode}</p>
          </div>

          {/* QR Code */}
          {!confirmed ? (
            <div className="flex flex-col items-center gap-4">
              {/* QR container — QR real generado dinámicamente */}
              <div className="relative bg-white p-3 rounded-2xl shadow-xl shadow-teal-500/10 ring-2 ring-teal-500/20">
                {/* QR generado por API pública qrserver.com */}
                {/* Codifica: "DEUNA PAGO $XX.XX — Referencia: ordenCode" */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&format=png&margin=4&data=${encodeURIComponent(
                    `https://deuna.ec | Pago $${total.toFixed(2)} | Ref: ${orderCode}`
                  )}`}
                  alt="QR Deuna"
                  width={200}
                  height={200}
                  className="rounded-lg"
                />
                {/* Animación de escaneo */}
                <div className="absolute inset-3 overflow-hidden rounded-lg pointer-events-none">
                  <div className="w-full h-0.5 bg-teal-400/60 animate-scan-line" />
                </div>
              </div>

              {/* Steps */}
              <div className="w-full bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-3">
                <p className="text-zinc-400 text-[10px] uppercase tracking-widest font-bold text-center">Instrucciones</p>
                {[
                  { num: '1', text: 'Cliente abre la app Deuna' },
                  { num: '2', text: 'Escanea este código QR' },
                  { num: '3', text: 'Confirma el pago en su celular' },
                  { num: '4', text: 'Cajero confirma recepción abajo' },
                ].map(step => (
                  <div key={step.num} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center shrink-0">
                      <span className="text-teal-400 text-[10px] font-bold">{step.num}</span>
                    </div>
                    <p className="text-zinc-400 text-xs">{step.text}</p>
                  </div>
                ))}
              </div>

              {/* Info chip */}
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 w-full">
                <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <p className="text-amber-300 text-[10px] font-medium">
                  El monto ingresado en Deuna debe coincidir exactamente: <strong>${total.toFixed(2)}</strong>
                </p>
              </div>
            </div>
          ) : (
            /* Success screen */
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-20 h-20 rounded-full bg-teal-500/20 border-2 border-teal-500/40 flex items-center justify-center animate-in zoom-in duration-300">
                <CheckCircle2 className="h-10 w-10 text-teal-400" />
              </div>
              <div className="text-center">
                <p className="text-zinc-100 font-bold text-base">¡Pago Confirmado!</p>
                <p className="text-zinc-500 text-xs mt-1">Pago Deuna de <span className="text-teal-400 font-bold">${total.toFixed(2)}</span> registrado</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer — Botones */}
        {!confirmed && (
          <div className="px-6 pb-6 flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 text-xs font-bold transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-teal-500/20 disabled:opacity-60"
            >
              {confirming ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Confirmar Pago Recibido
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* CSS para la línea de escaneo animada */}
      <style jsx>{`
        @keyframes scan-line {
          0%   { transform: translateY(0); opacity: 0.8; }
          50%  { opacity: 1; }
          100% { transform: translateY(190px); opacity: 0.8; }
        }
        .animate-scan-line {
          animation: scan-line 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
