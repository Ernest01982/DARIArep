// src/services/order.ts
import { supabase } from './supabase';

export interface OrderLineForRPC {
  product_id: string;
  quantity: number;
  price: number; // discounted or 0 for free items
}

export async function createOrderWithItems(params: {
  clientId: string;
  repId: string;
  isFree: boolean;
  discountPercent: number;
  discountReason?: string | null;
  freeStockReason?: string | null;
  notes?: string | null;
  items: OrderLineForRPC[];
}) {
  const { data, error } = await supabase.rpc('create_order_with_items', {
    p_client_id: params.clientId,
    p_rep_id: params.repId,
    p_is_free: params.isFree,
    p_discount_percent: params.discountPercent,
    p_discount_reason: params.discountReason ?? null,
    p_free_stock_reason: params.freeStockReason ?? null,
    p_notes: params.notes ?? null,
    p_items: params.items
  });
  return { orderId: data as string | null, error };
}