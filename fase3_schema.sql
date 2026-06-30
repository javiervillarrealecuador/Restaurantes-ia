-- Phase 3 Database Updates: Branches, Waiter orders, Human Handoff & Admin Alerts
-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql/new)

SET search_path TO public;

-- Actualizar el enum staff_role para incluir los roles correctos de la aplicación si no existen
ALTER TYPE staff_role ADD VALUE IF NOT EXISTS 'admin_general';
ALTER TYPE staff_role ADD VALUE IF NOT EXISTS 'vendedor_cajero';
ALTER TYPE staff_role ADD VALUE IF NOT EXISTS 'cocinero';
ALTER TYPE staff_role ADD VALUE IF NOT EXISTS 'repartidor';
ALTER TYPE staff_role ADD VALUE IF NOT EXISTS 'repartidor_domicilio';
ALTER TYPE staff_role ADD VALUE IF NOT EXISTS 'camarero';

-- =========================================================================
-- 1. SUCURSALES (BRANCHES)
-- =========================================================================
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    phone VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Habilitar RLS
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para branches
CREATE POLICY "Staff can view branches of their own restaurant" ON branches
    FOR SELECT USING (is_restaurant_staff(restaurant_id));

CREATE POLICY "Admin staff can manage branches" ON branches
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM restaurant_staff
            WHERE restaurant_staff.restaurant_id = branches.restaurant_id
            AND restaurant_staff.profile_id = auth.uid()
            AND restaurant_staff.role::text = 'admin_general'
        )
    );

CREATE POLICY "Public read active branches" ON branches
    FOR SELECT USING (is_active = true);

-- Relación Many-to-Many para Disponibilidad de Platos (Carta Diferenciada)
CREATE TABLE IF NOT EXISTS menu_item_branches (
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE NOT NULL,
    PRIMARY KEY (menu_item_id, branch_id)
);

-- Habilitar RLS
ALTER TABLE menu_item_branches ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para menu_item_branches
CREATE POLICY "Staff can view menu_item_branches" ON menu_item_branches
    FOR SELECT USING (true);

CREATE POLICY "Staff can manage menu_item_branches" ON menu_item_branches
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM menu_items
            JOIN menu_categories ON menu_categories.id = menu_items.category_id
            WHERE menu_items.id = menu_item_id
            AND is_restaurant_staff(menu_categories.restaurant_id)
        )
    );

-- =========================================================================
-- 2. MODIFICACIÓN DE TABLAS EXISTENTES
-- =========================================================================

-- Agregar branch_id a órdenes
ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

-- Agregar branch_id a personal
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

-- Actualizar constraint de roles en el personal para permitir 'camarero'
ALTER TABLE restaurant_staff DROP CONSTRAINT IF EXISTS chk_restaurant_staff_role;
ALTER TABLE restaurant_staff ADD CONSTRAINT chk_restaurant_staff_role CHECK (role::text IN ('admin_general', 'vendedor_cajero', 'cocinero', 'repartidor', 'camarero', 'repartidor_domicilio'));

-- Agregar control del bot en clientes (Handoff a humano)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bot_active BOOLEAN DEFAULT TRUE NOT NULL;

-- Agregar columna para el canal/origen del pedido
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'whatsapp';

-- Dropear el constraint anterior si existe y crear el nuevo
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_source;
ALTER TABLE orders ADD CONSTRAINT chk_order_source CHECK (source IN ('whatsapp', 'waiter', 'caja'));

-- =========================================================================
-- 3. ALERTAS DEL ADMINISTRADOR (BUFFETS Y EVENTOS ESPECIALES)
-- =========================================================================
CREATE TABLE IF NOT EXISTS admin_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL, -- 'buffet_inquiry', 'special_event', 'human_request'
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    customer_name VARCHAR(150),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Habilitar RLS
ALTER TABLE admin_alerts ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para admin_alerts
CREATE POLICY "Staff can view and update alerts" ON admin_alerts
    FOR ALL USING (is_restaurant_staff(restaurant_id));

CREATE POLICY "System can insert alerts" ON admin_alerts
    FOR INSERT WITH CHECK (true); -- Permitir inserción desde webhooks de WhatsApp

-- =========================================================================
-- 4. ÍNDICES DE RENDIMIENTO
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_branches_restaurant ON branches(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_branches_branch ON menu_item_branches(branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_branch ON orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_restaurant ON admin_alerts(restaurant_id);
