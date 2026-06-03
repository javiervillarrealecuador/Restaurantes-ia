-- Phase 2 Database Updates: CRM (Customers)
-- Run this in your Supabase SQL Editor

-- 10. CUSTOMERS
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
    phone VARCHAR(50) NOT NULL,
    name VARCHAR(150),
    total_orders INT DEFAULT 0,
    total_spent DECIMAL(10, 2) DEFAULT 0.00,
    first_visit TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_visit TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    preferences TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(restaurant_id, phone)
);

-- INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_customers_restaurant ON customers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- TRIGGER FOR UPDATED_AT UPDATES
CREATE TRIGGER update_customers_modtime BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ROW LEVEL SECURITY (RLS) POLICIES FOR CUSTOMERS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view customers" ON customers
    FOR SELECT USING (is_restaurant_staff(restaurant_id));

CREATE POLICY "System can create and update customers" ON customers
    FOR ALL USING (true) WITH CHECK (true); -- Allow webhook to manage customers freely

-- Give existing customers some mock data based on existing orders (optional data migration)
INSERT INTO customers (restaurant_id, phone, name, total_orders, total_spent, last_visit)
SELECT 
    restaurant_id, 
    customer_phone as phone, 
    MAX(customer_name) as name, 
    COUNT(id) as total_orders, 
    SUM(total_price) as total_spent, 
    MAX(created_at) as last_visit
FROM orders
GROUP BY restaurant_id, customer_phone
ON CONFLICT (restaurant_id, phone) 
DO UPDATE SET 
    total_orders = EXCLUDED.total_orders,
    total_spent = EXCLUDED.total_spent,
    last_visit = EXCLUDED.last_visit;
