-- =============================================================================
-- MIGRACIÓN: TABLA dedicada para FIRMAS ELECTRÓNICAS (.P12) Y CLAVES
-- PostgreSQL >= 13.
-- Ejecuta este script en el editor SQL de Supabase (https://supabase.com/dashboard/project/_/sql/new)
-- =============================================================================

SET search_path TO public;

-- Crear la tabla para almacenar múltiples firmas y sus claves de manera permanente
CREATE TABLE IF NOT EXISTS public.sri_firmas (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id  UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    archivo_base64 TEXT NOT NULL,
    clave          TEXT NOT NULL,
    razon_social   VARCHAR(300),
    expiracion     DATE,
    esta_activa    BOOLEAN DEFAULT TRUE NOT NULL,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Crear un índice único parcial para asegurar que solo una firma esté activa a la vez por restaurante
CREATE UNIQUE INDEX IF NOT EXISTS idx_sri_firmas_active_unique 
ON public.sri_firmas (restaurant_id) 
WHERE (esta_activa = TRUE);

-- Habilitar la seguridad a nivel de fila (Row Level Security - RLS)
ALTER TABLE public.sri_firmas ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas anteriores si se vuelve a correr el script
DROP POLICY IF EXISTS "Staff can view signatures of their own restaurant" ON public.sri_firmas;
DROP POLICY IF EXISTS "Admin staff can manage signatures" ON public.sri_firmas;

-- Política de lectura para personal del restaurante
CREATE POLICY "Staff can view signatures of their own restaurant" ON public.sri_firmas
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.restaurant_staff
            WHERE restaurant_staff.restaurant_id = sri_firmas.restaurant_id
            AND restaurant_staff.profile_id = auth.uid()
        )
    );

-- Política de administración para administradores y managers (todas las operaciones)
CREATE POLICY "Admin staff can manage signatures" ON public.sri_firmas
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.restaurant_staff
            WHERE restaurant_staff.restaurant_id = sri_firmas.restaurant_id
            AND restaurant_staff.profile_id = auth.uid()
            AND restaurant_staff.role IN ('admin', 'manager')
        )
    );
