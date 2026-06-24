-- Fase 7: Creación de tabla kitchens y actualización de menu_items

-- 1. Create kitchens table
CREATE TABLE IF NOT EXISTS kitchens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    administrator VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for kitchens
CREATE INDEX IF NOT EXISTS idx_kitchens_restaurant ON kitchens(restaurant_id);

-- Trigger for updated_at
CREATE TRIGGER update_kitchens_modtime BEFORE UPDATE ON kitchens FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Row Level Security (RLS) for kitchens
ALTER TABLE kitchens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public kitchens read" ON kitchens
    FOR SELECT USING (true);

CREATE POLICY "Staff can manage kitchens" ON kitchens
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM restaurant_staff
            WHERE restaurant_staff.restaurant_id = kitchens.restaurant_id
            AND restaurant_staff.profile_id = auth.uid()
        )
    );

-- 2. Add kitchen_id to menu_items
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS kitchen_id UUID REFERENCES kitchens(id) ON DELETE SET NULL;

-- Index for menu_items kitchen_id
CREATE INDEX IF NOT EXISTS idx_menu_items_kitchen ON menu_items(kitchen_id);
