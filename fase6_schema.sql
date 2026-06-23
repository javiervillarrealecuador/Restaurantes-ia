-- Migración: Agregar columna payment_reference a la tabla orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_reference TEXT;
