-- Database Schema for Restaurant SaaS Application with WhatsApp & Gemini AI Integration

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types/enums
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled');
CREATE TYPE order_type AS ENUM ('dine_in', 'delivery', 'pickup');
CREATE TYPE staff_role AS ENUM ('admin', 'manager', 'staff');

-- 1. RESTAURANTS
CREATE TABLE restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    address TEXT,
    phone VARCHAR(50),
    email VARCHAR(255),
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. PROFILES (Linked to Supabase Auth)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. RESTAURANT STAFF (Link profiles to restaurants with roles)
CREATE TABLE restaurant_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    role staff_role DEFAULT 'staff'::staff_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(restaurant_id, profile_id)
);

-- 4. MENU CATEGORIES
CREATE TABLE menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. MENU ITEMS
CREATE TABLE menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES menu_categories(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    image_url TEXT,
    is_available BOOLEAN DEFAULT TRUE NOT NULL,
    estimated_prep_time INT DEFAULT 15, -- in minutes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. ORDERS
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number SERIAL,
    order_code VARCHAR(100) UNIQUE,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
    status order_status DEFAULT 'pending'::order_status NOT NULL,
    type order_type DEFAULT 'pickup'::order_type NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    delivery_address TEXT,
    table_number VARCHAR(20),
    notes TEXT,
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    tax DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    total_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(50) DEFAULT 'cash',
    is_paid BOOLEAN DEFAULT FALSE NOT NULL,
    payment_receipt_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. ORDER ITEMS (Line items of an order)
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. RESTAURANT SETTINGS (WhatsApp credentials, Gemini Configuration, operational settings)
CREATE TABLE settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE UNIQUE NOT NULL,
    whatsapp_phone_number_id VARCHAR(100),
    whatsapp_verify_token VARCHAR(255),
    whatsapp_access_token TEXT,
    gemini_api_key TEXT,
    ai_system_instruction TEXT,
    opening_hours JSONB, -- JSON configuration for business hours
    is_ordering_enabled BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. WHATSAPP WEBHOOK LOGS
CREATE TABLE whatsapp_webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_message_id VARCHAR(255) UNIQUE,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL,
    sender_phone VARCHAR(50) NOT NULL,
    message_body TEXT,
    raw_payload JSONB NOT NULL,
    ai_parsed_response JSONB,
    status VARCHAR(50) DEFAULT 'received', -- 'received', 'parsed', 'failed', 'order_created'
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- INDEXES FOR PERFORMANCE
CREATE INDEX idx_menu_categories_restaurant ON menu_categories(restaurant_id);
CREATE INDEX idx_menu_items_category ON menu_items(category_id);
CREATE INDEX idx_orders_restaurant_status ON orders(restaurant_id, status);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_restaurant_staff_profile ON restaurant_staff(profile_id);
CREATE INDEX idx_whatsapp_webhook_logs_sender ON whatsapp_webhook_logs(sender_phone);


-- TRIGGER FOR UPDATED_AT UPDATES
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_restaurants_modtime BEFORE UPDATE ON restaurants FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_profiles_modtime BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_menu_categories_modtime BEFORE UPDATE ON menu_categories FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_menu_items_modtime BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_orders_modtime BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_settings_modtime BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION update_modified_column();


-- ROW LEVEL SECURITY (RLS) POLICIES

-- Enable RLS
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Helper Function to check if a user is staff of a restaurant
CREATE OR REPLACE FUNCTION is_restaurant_staff(restaurant_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM restaurant_staff
        WHERE restaurant_staff.restaurant_id = restaurant_uuid
        AND restaurant_staff.profile_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Restaurants Policies
CREATE POLICY "Public restaurants read" ON restaurants
    FOR SELECT USING (true);

CREATE POLICY "Admin staff write restaurants" ON restaurants
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM restaurant_staff
            WHERE restaurant_staff.restaurant_id = id
            AND restaurant_staff.profile_id = auth.uid()
            AND restaurant_staff.role IN ('admin', 'manager')
        )
    );

-- Profiles Policies
CREATE POLICY "Users can read all profiles" ON profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can edit their own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Staff Policies
CREATE POLICY "Staff can view staff of their own restaurant" ON restaurant_staff
    FOR SELECT USING (is_restaurant_staff(restaurant_id));

-- Menu Categories Policies
CREATE POLICY "Public menu categories read" ON menu_categories
    FOR SELECT USING (is_active = true OR is_restaurant_staff(restaurant_id));

CREATE POLICY "Staff can manage categories" ON menu_categories
    FOR ALL USING (is_restaurant_staff(restaurant_id));

-- Menu Items Policies
CREATE POLICY "Public menu items read" ON menu_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM menu_categories
            WHERE menu_categories.id = category_id
            AND (menu_categories.is_active = true OR is_restaurant_staff(menu_categories.restaurant_id))
        )
    );

CREATE POLICY "Staff can manage menu items" ON menu_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM menu_categories
            WHERE menu_categories.id = category_id
            AND is_restaurant_staff(menu_categories.restaurant_id)
        )
    );

-- Orders Policies
CREATE POLICY "Staff can read/write orders" ON orders
    FOR ALL USING (is_restaurant_staff(restaurant_id));

CREATE POLICY "Customers can create orders" ON orders
    FOR INSERT WITH CHECK (true); -- Allows public insertions (e.g. from WhatsApp/web form)

CREATE POLICY "Public select orders for demo" ON orders
    FOR SELECT USING (true); -- Allows reading orders in public demo dashboard

-- Order Items Policies
CREATE POLICY "Staff can view/manage order items" ON order_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM orders
            WHERE orders.id = order_id
            AND is_restaurant_staff(orders.restaurant_id)
        )
    );

CREATE POLICY "Customers can insert order items" ON order_items
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Public select order items for demo" ON order_items
    FOR SELECT USING (true); -- Allows reading order items in public demo dashboard

-- Settings Policies
CREATE POLICY "Staff can view settings" ON settings
    FOR SELECT USING (is_restaurant_staff(restaurant_id));

CREATE POLICY "Admin staff can write settings" ON settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM restaurant_staff
            WHERE restaurant_staff.restaurant_id = settings.restaurant_id
            AND restaurant_staff.profile_id = auth.uid()
            AND restaurant_staff.role IN ('admin', 'manager')
        )
    );

-- Logs Policies
CREATE POLICY "Staff can view logs" ON whatsapp_webhook_logs
    FOR SELECT USING (is_restaurant_staff(restaurant_id));

CREATE POLICY "System can write webhook logs" ON whatsapp_webhook_logs
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Public select logs for demo" ON whatsapp_webhook_logs
    FOR SELECT USING (true); -- Allows reading webhook logs in public demo dashboard

