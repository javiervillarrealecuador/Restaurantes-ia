-- Phase 4 Database Updates: Menu Modifiers, Restaurant Tables & Order Modifiers JSONB
-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql/new)

SET search_path TO public;

-- =========================================================================
-- 1. MODIFICADORES DE PLATOS (MENU MODIFIERS)
-- =========================================================================
CREATE TABLE IF NOT EXISTS menu_modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) DEFAULT 0.00 NOT NULL,
    is_required BOOLEAN DEFAULT FALSE NOT NULL,
    allow_multiple BOOLEAN DEFAULT FALSE NOT NULL, -- Permite seleccionar varios de la misma categoría/grupo
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Habilitar RLS
ALTER TABLE menu_modifiers ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para menu_modifiers
CREATE POLICY "Public read modifiers" ON menu_modifiers 
    FOR SELECT USING (true);

CREATE POLICY "Admin manage modifiers" ON menu_modifiers 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM menu_items 
            JOIN menu_categories ON menu_categories.id = menu_items.category_id
            WHERE menu_items.id = menu_modifiers.menu_item_id 
            AND is_restaurant_staff(menu_categories.restaurant_id)
        )
    );

-- =========================================================================
-- 2. DISTRIBUCIÓN DE MESAS FISICAS (RESTAURANT TABLES)
-- =========================================================================
CREATE TABLE IF NOT EXISTS restaurant_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE NOT NULL,
    table_number VARCHAR(20) NOT NULL,
    status VARCHAR(50) DEFAULT 'free' CHECK (status IN ('free', 'occupied', 'payment_requested')),
    current_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    x_pos INT DEFAULT 0, -- Posición visual (columna en cuadrícula)
    y_pos INT DEFAULT 0, -- Posición visual (fila en cuadrícula)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(branch_id, table_number)
);

-- Habilitar RLS
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para restaurant_tables
CREATE POLICY "Staff read write tables" ON restaurant_tables 
    FOR ALL USING (is_restaurant_staff(restaurant_id));

-- =========================================================================
-- 3. ACTUALIZACIÓN DE DETALLES DE ORDEN (ORDER ITEMS MODIFIERS)
-- =========================================================================
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_modifiers JSONB DEFAULT '[]'::jsonb;

-- Índices de Rendimiento
CREATE INDEX IF NOT EXISTS idx_menu_modifiers_item ON menu_modifiers(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_branch ON restaurant_tables(branch_id);
