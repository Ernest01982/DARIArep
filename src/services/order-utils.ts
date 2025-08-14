// src/services/order-utils.ts
// Pure utilities for order math + RPC payload building.
// No Supabase client imports here.

// Types your UI likely uses:
export interface UIOrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;       // trade price pulled from DB
  // Either of these may exist depending on earlier code; we normalize:
  is_free?: boolean;
  is_free_stock?: boolean;
  free_stock_reason?: string | null;
}

export interface OrderTotalsResult {
  order: {
    paid_total: number;
    free_stock_total: number;
    discount_value: number;
    is_free_stock: boolean; // true only if ALL lines are free
  };
  orderItems: UIOrderItem[]; // normalized items (with is_free set)
  paidSubtotal: number;
  freeStockTotal: number;
  discountValue: number;
  grandTotal: number;        // paidSubtotal - discountValue
}

/**
 * Normalize item flags so we consistently rely on `is_free`.
 */
function normalizeFreeFlag(item: UIOrderItem): UIOrderItem {
  const isFree = item.is_free ?? item.is_free_stock ?? false;
  return { ...item, is_free: !!isFree };
}

/**
 * Calculate order totals.
 * - Discount applies ONLY to paid lines.
 * - Free lines contribute to `freeStockTotal` but not to totals due.
 */
export function calculateOrderTotals(
  orderItemsIn: UIOrderItem[],
  discountPercent: number = 0
): OrderTotalsResult {
  const items = orderItemsIn.map(normalizeFreeFlag);

  const paidItems = items.filter(i => !i.is_free);
  const freeItems = items.filter(i => i.is_free);

  const paidSubtotal = paidItems.reduce(
    (sum, i) => sum + i.quantity * (i.unit_price || 0),
    0
  );
  const freeStockTotal = freeItems.reduce(
    (sum, i) => sum + i.quantity * (i.unit_price || 0),
    0
  );

  const discountValue = paidSubtotal * (Math.max(0, Math.min(100, discountPercent)) / 100);
  const grandTotal = paidSubtotal - discountValue;

  const isEntireOrderFree = items.length > 0 && items.every(i => i.is_free);

  return {
    order: {
      paid_total: paidSubtotal,
      free_stock_total: freeStockTotal,
      discount_value: discountValue,
      is_free_stock: isEntireOrderFree
    },
    orderItems: items,
    paidSubtotal,
    freeStockTotal,
    discountValue,
    grandTotal
  };
}

/**
 * Build payload for the create_order_with_items RPC.
 * We send a final per-line price:
 *  - 0 for free lines
 *  - unit_price * (1 - discount%) for paid lines
 */
export function buildRpcItems(
  orderItemsIn: UIOrderItem[],
  discountPercent: number
): Array<{ product_id: string; quantity: number; price: number }> {
  const items = orderItemsIn.map(normalizeFreeFlag);
  const factor = 1 - Math.max(0, Math.min(100, discountPercent)) / 100;

  return items.map(i => ({
    product_id: i.product_id,
    quantity: i.quantity,
    price: i.is_free ? 0 : Number((i.unit_price || 0) * factor)
  }));
}
