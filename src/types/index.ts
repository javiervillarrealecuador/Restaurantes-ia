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
  source?: 'whatsapp' | 'waiter' | 'caja';
  branch_id?: string | null;
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

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  text?: {
    body: string;
  };
  type: string;
  image?: {
    mime_type: string;
    sha256: string;
    id: string;
  };
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: Array<WhatsAppMessage>;
      };
      field: string;
    }>;
  }>;
}

export interface BillingStats {
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  currentPeriodDelivered: number;
  cancellationRate: number;
  unbilledAmount: number;
}

export interface RestaurantWithBilling {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  cost_per_order: number;
  prepaid_credits: number;
  status: string;
  created_at: string;
  stats: BillingStats;
}

export interface Branch {
  id: string;
  restaurant_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MenuItemBranch {
  menu_item_id: string;
  branch_id: string;
}

export interface AdminAlert {
  id: string;
  restaurant_id: string;
  branch_id: string | null;
  type: 'buffet_inquiry' | 'special_event' | 'human_request';
  title: string;
  message: string;
  customer_phone: string;
  customer_name: string | null;
  status: 'pending' | 'resolved';
  created_at: string;
}
