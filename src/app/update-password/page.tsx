'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Utensils, Lock, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Listen to state changes to make sure token is processed
  useEffect(() => {
    // If the hash has the access token, Supabase Auth automatically establishes a session.
    // We can verify if there is an active session
    const verifySession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // We can wait briefly or warn. But it's usually automatic when redirecting from email link.
        console.warn('No active session detected yet. Make sure you opened this link from the recovery email.');
      }
    };
    verifySession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setErrorMsg(error.message || 'Error al actualizar la contraseña.');
      } else {
        setSuccessMsg('¡Contraseña actualizada con éxito! Redirigiendo al panel de control...');
        setTimeout(() => {
          router.push('/');
        }, 2000);
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
          <h2 className="text-2xl font-bold tracking-tight mt-4">Nueva Contraseña</h2>
          <p className="text-sm text-zinc-400">Ingresa tu nueva contraseña para reestablecer el acceso</p>
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
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Nueva Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-zinc-950/50 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 py-3.5 pl-11 pr-4 rounded-xl text-xs outline-none transition-all placeholder:text-zinc-600 font-medium"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Confirmar Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmar contraseña"
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
                Actualizando Contraseña...
              </>
            ) : (
              'Guardar Nueva Contraseña'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
