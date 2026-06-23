-- Creación de la tabla intermedia para la relación de empleados y sucursales (Many-to-Many)
CREATE TABLE IF NOT EXISTS restaurant_staff_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES restaurant_staff(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(staff_id, branch_id)
);

-- Habilitar RLS en la tabla intermedia
ALTER TABLE restaurant_staff_branches ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Staff can view staff_branches" ON restaurant_staff_branches
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM restaurant_staff rs
            WHERE rs.id = staff_id
            AND is_restaurant_staff(rs.restaurant_id)
        )
    );

CREATE POLICY "Admin staff can manage staff_branches" ON restaurant_staff_branches
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM restaurant_staff rs
            WHERE rs.id = staff_id
            AND rs.restaurant_id = (
                SELECT restaurant_id FROM restaurant_staff 
                WHERE profile_id = auth.uid() 
                AND role = 'admin_general'
                LIMIT 1
            )
        )
    );

-- Migrar datos de branch_id existente en restaurant_staff a la nueva tabla intermedia
INSERT INTO restaurant_staff_branches (staff_id, branch_id)
SELECT id, branch_id 
FROM restaurant_staff 
WHERE branch_id IS NOT NULL
ON CONFLICT (staff_id, branch_id) DO NOTHING;
