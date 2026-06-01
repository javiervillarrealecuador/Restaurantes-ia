'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SignupRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Redirigir al login. El registro público está deshabilitado.
    // Solo el administrador puede crear perfiles de personal desde el panel principal.
    router.replace('/login');
  }, [router]);

  return null;
}
