export type OrderStatus = 'draft' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivering' | 'delivered' | 'cancelled';
export type OrderType = 'dine_in' | 'delivery' | 'pickup';
export type StaffRole = 'admin' | 'manager' | 'staff';

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  estimated_prep_time: number;
  code: string | null;
  created_at: string;
}

export interface MenuCategory {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  menu_items?: MenuItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  quantity: number;
  unit_price: number;
  notes: string | null;
  menu_items?: MenuItem | null;
}

export interface Order {
  id: string;
  order_number: number;
  order_code: string | null;
  restaurant_id: string;
  status: OrderStatus;
  type: OrderType;
  customer_name: string;
  customer_phone: string;
  delivery_address: string | null;
  table_number: string | null;
  notes: string | null;
  subtotal: number;
  tax: number;
  delivery_fee: number;
  total_price: number;
  payment_method: string;
  is_paid: boolean;
  payment_receipt_url: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItem[];
}

export interface WebhookLog {
  id: string;
  whatsapp_message_id: string | null;
  restaurant_id: string | null;
  sender_phone: string;
  message_body: string | null;
  raw_payload: unknown;
  ai_parsed_response: unknown;
  status: string;
  error_message: string | null;
  created_at: string;
}
