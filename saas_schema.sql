-- SaaS Multi-Tenant Billing Schema Updates
-- Ejecuta este script en el editor SQL de Supabase

-- 1. Actualizar tabla de perfiles (Profiles) para agregar bandera de Super Admin
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE NOT NULL;

-- 2. Actualizar tabla de restaurantes (Restaurants) con campos de facturación
ALTER TABLE restaurants 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial')),
ADD COLUMN IF NOT EXISTS cost_per_order DECIMAL(10, 2) DEFAULT 0.10,
ADD COLUMN IF NOT EXISTS billing_day INT DEFAULT 1 CHECK (billing_day >= 1 AND billing_day <= 28),
ADD COLUMN IF NOT EXISTS prepaid_credits INT DEFAULT 0;

-- 3. Crear tabla de facturas SaaS (saas_invoices)
CREATE TABLE IF NOT EXISTS saas_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    orders_delivered INT NOT NULL DEFAULT 0,
    cost_per_order DECIMAL(10, 2) NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Habilitar RLS para saas_invoices
ALTER TABLE saas_invoices ENABLE ROW LEVEL SECURITY;

-- 5. Crear políticas RLS para saas_invoices
-- El personal del restaurante puede ver sus propias facturas
CREATE POLICY "Staff can view own invoices" ON saas_invoices
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM restaurant_staff
            WHERE restaurant_staff.restaurant_id = saas_invoices.restaurant_id
            AND restaurant_staff.profile_id = auth.uid()
        )
    );

-- El sistema y los super administradores pueden gestionar todas las facturas libremente (bypassed con Service Role en APIs)
CREATE POLICY "Super admin manage invoices" ON saas_invoices
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_super_admin = true
        )
    );

-- 6. Agregar disparador para updated_at en saas_invoices
CREATE TRIGGER update_saas_invoices_modtime 
BEFORE UPDATE ON saas_invoices 
FOR EACH ROW 
EXECUTE FUNCTION update_modified_column();

-- 7. Crear un índice de rendimiento para las facturas por restaurante
CREATE INDEX IF NOT EXISTS idx_saas_invoices_restaurant ON saas_invoices(restaurant_id);

-- 8. Disparador para descontar créditos prepago automáticamente cuando un pedido cambie a 'delivered'
CREATE OR REPLACE FUNCTION decrement_restaurant_credits()
RETURNS TRIGGER AS $$
DECLARE
    v_prepaid_credits INT;
    v_status VARCHAR(50);
BEGIN
    IF NEW.status = 'delivered'::order_status AND OLD.status != 'delivered'::order_status THEN
        -- Obtener los créditos y estado actual del restaurante
        SELECT prepaid_credits, status INTO v_prepaid_credits, v_status
        FROM restaurants
        WHERE id = NEW.restaurant_id;

        -- Si el restaurante tiene créditos prepagos, descontar uno
        IF v_prepaid_credits > 0 THEN
            v_prepaid_credits := v_prepaid_credits - 1;
            
            -- Si se agotan los créditos, suspender la cuenta
            IF v_prepaid_credits = 0 THEN
                v_status := 'suspended';
            END IF;

            UPDATE restaurants 
            SET prepaid_credits = v_prepaid_credits,
                status = v_status
            WHERE id = NEW.restaurant_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trigger_decrement_restaurant_credits
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION decrement_restaurant_credits();

-- 9. Comando para promover tu cuenta de administrador actual a Super Admin en Supabase:
UPDATE profiles 
SET is_super_admin = true 
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'javiervillarrealsalazarec@gmail.com'
);

-- 10. Vista optimizada para reporte de facturación y estadísticas del SaaS (Paso 2.1)
CREATE OR REPLACE VIEW restaurant_billing_stats AS
SELECT 
  restaurant_id,
  COUNT(*) AS total_orders,
  COUNT(*) FILTER (WHERE status = 'delivered') AS delivered_orders,
  COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_orders,
  COUNT(*) FILTER (WHERE status = 'delivered' AND created_at >= DATE_TRUNC('month', CURRENT_DATE)) AS current_period_delivered
FROM orders
GROUP BY restaurant_id;
