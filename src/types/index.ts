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
  ruc?: string | null;
  sri_dir_matriz?: string | null;
  sri_dir_estab?: string | null;
  sri_estab?: string | null;
  sri_pto_emi?: string | null;
  sri_obligado_contab?: boolean;
  sri_rimpe?: string | null;
  sri_agente_retencion?: string | null;
  sri_contrib_especial?: string | null;
  sri_ambiente?: number;
  sri_p12_b64?: string | null;
  sri_p12_pwd?: string | null;
  sri_firma_expira?: string | null;
  sri_firma_razon?: string | null;
  sri_logo_b64?: string | null;
  sri_email_envio?: string | null;
  sri_iva_rate?: number;
  sri_iva_temporal?: number | null;
  sri_iva_temporal_inicio?: string | null;
  sri_iva_temporal_fin?: string | null;
  smtp_host?: string | null;
  smtp_port?: string | null;
  smtp_user?: string | null;
  smtp_pass?: string | null;
  smtp_from?: string | null;
}

export interface SriFirma {
  id: string;
  restaurant_id: string;
  archivo_base64: string;
  clave: string;
  razon_social: string | null;
  expiracion: string | null;
  esta_activa: boolean;
  created_at?: string;
  updated_at?: string;
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
  selected_modifiers?: { name: string; price: number }[] | null;
  iva_rate?: number;
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
  payment_reference: string | null;
  payment_receipt_url: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItem[];
  source?: 'whatsapp' | 'waiter' | 'caja';
  branch_id?: string | null;
  // SRI billing fields
  invoice_ref?: string | null;
  invoice_auth?: string | null;
  sri_estado?: string | null;
  sri_autorizacion?: string | null;
  sri_fecha_aut?: string | null;
  sri_ambiente?: number | null;
  sri_mensajes?: string | null;
  forma_pago?: string | null;
  sri_requiere_factura?: boolean;
  billing_vat?: string | null;
  billing_name?: string | null;
  billing_email?: string | null;
  billing_address?: string | null;
}

export interface WebhookLog {
  id: string;
  whatsapp_message_id?: string | null;
  restaurant_id: string | null;
  sender_phone: string;
  message_body: string | null;
  raw_payload?: unknown;
  ai_parsed_response?: unknown;
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

export interface MenuModifier {
  id: string;
  menu_item_id: string;
  name: string;
  price: number;
  is_required: boolean;
  allow_multiple: boolean;
  created_at?: string;
}

export interface RestaurantTable {
  id: string;
  restaurant_id: string;
  branch_id: string;
  table_number: string;
  status: 'free' | 'occupied' | 'payment_requested';
  current_order_id: string | null;
  x_pos: number;
  y_pos: number;
  created_at?: string;
}

