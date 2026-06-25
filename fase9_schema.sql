-- Fase 9: Lógica "Pagar Primero y luego consumir"

-- Añadir opción a los ajustes del restaurante
ALTER TABLE settings 
ADD COLUMN IF NOT EXISTS pay_before_consume BOOLEAN DEFAULT FALSE NOT NULL;

-- Añadir el estado 'pending_payment' al ENUM order_status
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'pending_payment';
