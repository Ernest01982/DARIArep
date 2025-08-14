export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  // NEW:
  is_free_stock?: boolean;
  free_stock_reason?: string | null;
  // keep any existing fields
  product?: {
    name: string;
    sku?: string;
  };
}

export interface Order {
  id: string;
  rep_id: string;
  client_id: string;
  order_date: string;
  discount_percent?: number;
  discount_value?: number;
  // NEW:
  paid_total?: number;
  free_stock_total?: number;
  // keep existing fields
  is_free_stock?: boolean;
  notes?: string;
  created_at?: string;
  visit_id?: string;
}

export interface Client {
  id: string;
  name: string;
  location?: string;
  contact_email?: string;
  contact_phone?: string;
  status: string;
}

export interface Product {
  id: string;
  name: string;
  sku?: string;
  price: number;
  price_ex_vat?: number;
  price_trade?: number;
}