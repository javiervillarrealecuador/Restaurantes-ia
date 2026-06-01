'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Utensils, Mail, Loader2, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (error) {
        setErrorMsg(error.message || 'Error al enviar el correo de recuperación.');
      } else {
        setSuccessMsg('¡Enlace enviado! Revisa tu correo electrónico para restablecer tu contraseña.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Ocurrió un error inesperado.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-emerald-600/10 blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 rounded-full bg-emerald-950/20 blur-[120px] pointer-events-none"></div>

      <div className="max-w-md w-full bg-zinc-900/40 border border-zinc-800 p-8 rounded-3xl backdrop-blur-lg shadow-2xl relative z-10 space-y-6">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto text-2xl shadow-inner">
            <Utensils className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mt-4">¿Olvidaste tu contraseña?</h2>
          <p className="text-sm text-zinc-400">Ingresa tu correo y te enviaremos un enlace para restablecerla</p>
        </div>

        {errorMsg && (
          <div className="bg-rose-950/20 border border-rose-900/50 p-3.5 rounded-xl flex items-start gap-2.5 text-rose-455 leading-relaxed text-xs">
            <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-950/20 border border-emerald-900/50 p-3.5 rounded-xl flex items-start gap-2.5 text-emerald-450 leading-relaxed text-xs">
            <CheckCircle className="h-4.5 w-4.5 shrink-0 mt-0.5 animate-pulse" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Correo Electrónico</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@restaurante.com"
                className="w-full bg-zinc-950/50 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 py-3.5 pl-11 pr-4 rounded-xl text-xs outline-none transition-all placeholder:text-zinc-600 font-medium"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-semibold py-3.5 px-4 rounded-xl shadow-lg shadow-emerald-950/20 hover:shadow-emerald-500/10 transition-all cursor-pointer mt-6"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando Enlace...
              </>
            ) : (
              'Enviar Enlace de Recuperación'
            )}
          </button>
        </form>

        <div className="text-center pt-2">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-medium">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver al Inicio de Sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
