'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Utensils, Lock, Mail, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const { user, login, loading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      router.push('/');
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const { error } = await login(email, password);
      if (error) {
        setErrorMsg(error.message || 'Credenciales inválidas. Por favor intente de nuevo.');
      } else {
        router.push('/');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Ocurrió un error inesperado al iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#09090b] text-zinc-100">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        >
          <Loader2 className="h-10 w-10 text-emerald-550 mb-4" />
        </motion.div>
        <p className="text-zinc-400 text-sm">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative background glow circles */}
      <motion.div 
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-emerald-600/20 blur-[100px] pointer-events-none"
      />
      <motion.div 
        animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 rounded-full bg-emerald-950/30 blur-[120px] pointer-events-none"
      />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="max-w-md w-full bg-zinc-900/40 border border-zinc-800 p-8 rounded-3xl backdrop-blur-xl shadow-2xl relative z-10 space-y-6"
      >
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <motion.div 
            whileHover={{ scale: 1.05 }}
            className="h-14 w-14 bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto text-2xl shadow-inner"
          >
            <Utensils className="h-7 w-7" />
          </motion.div>
          <h2 className="text-2xl font-bold tracking-tight mt-4">Bienvenido de nuevo</h2>
          <p className="text-sm text-zinc-400">Ingresa tus credenciales para acceder al sistema</p>
        </div>

        {errorMsg && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-rose-950/30 border border-rose-900/50 p-3.5 rounded-xl flex items-start gap-2.5 text-rose-450 leading-relaxed text-xs"
          >
            <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email field */}
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
                className="w-full bg-zinc-950/50 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:bg-zinc-900/80 py-3.5 pl-11 pr-4 rounded-xl text-sm outline-none transition-all placeholder:text-zinc-600 font-medium"
              />
            </div>
          </div>

          {/* Password field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Contraseña</label>
              <Link href="/forgot-password" className="text-[10px] font-semibold text-emerald-450 hover:text-emerald-400 hover:underline transition-colors">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-950/50 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:bg-zinc-900/80 py-3.5 pl-11 pr-4 rounded-xl text-sm outline-none transition-all placeholder:text-zinc-600 font-medium"
              />
            </div>
          </div>

          {/* Submit button */}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-semibold py-3.5 px-4 rounded-xl shadow-lg shadow-emerald-950/40 hover:shadow-emerald-500/20 transition-all cursor-pointer mt-6"
          >
            {submitting ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                  <Loader2 className="h-4 w-4" />
                </motion.div>
                Iniciando Sesión...
              </>
            ) : (
              'Iniciar Sesión'
            )}
          </motion.button>
        </form>

        {/* Register redirection */}
        <div className="text-center pt-2">
          <p className="text-xs text-zinc-550">
            ¿Nuevo miembro del personal?{' '}
            <Link href="/signup" className="text-emerald-450 hover:underline font-semibold transition-colors">
              Regístrate aquí
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
