-- Fase 8: Cubiertos por producto y extras en los pedidos

-- Agregar la columna default_cutlery a menu_items
ALTER TABLE menu_items
ADD COLUMN IF NOT EXISTS default_cutlery VARCHAR(50);

-- Agregar la columna extras a order_items
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS extras TEXT;
