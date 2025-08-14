// src/components/OrderForm.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Minus, Trash2, Download, Mail } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../services/supabase';
import { PDFService } from './PDF';
import { createOrderWithItems } from '../services/order';
import { useAuth } from '../contexts/AuthContext';

type Client = {
  id: string;
  name: string;
  location?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
};

type Product = {
  id: string;
  name: string;
  category?: string | null;
  sku?: string | null;
  price_trade?: number | null;  // ensure this exists in DB
};

type OrderRow = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number; // pulled from product.price_trade
  is_free?: boolean;
};

const currency = (n: number) => `R ${n.toFixed(2)}`;

export default function OrderForm() {
  const { currentRep } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [search, setSearch] = useState('');
  const [orderItems, setOrderItems] = useState<OrderRow[]>([]);
  const [discountPct, setDiscountPct] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [freeReason, setFreeReason] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from('clients').select('id,name,location,contact_name,contact_email').order('name'),
        supabase.from('products').select('id,name,category,sku,price_trade').order('name')
      ]);
      setClients(c ?? []);
      setProducts(p ?? []);
      setLoading(false);
    })();
  }, []);

  const filteredClients = useMemo(
    () =>
      clients.filter(
        c =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.location ?? '').toLowerCase().includes(search.toLowerCase())
      ),
    [clients, search]
  );

  const addProduct = (productId: string) => {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    setOrderItems(items => {
      const existing = items.find(i => i.product_id === p.id);
      if (existing) {
        return items.map(i => (i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...items,
        {
          id: crypto.randomUUID(),
          product_id: p.id,
          product_name: p.name,
          quantity: 1,
          unit_price: Number(p.price_trade ?? 0),
          is_free: false
        }
      ];
    });
  };

  const updateQty = (id: string, qty: number) => {
    setOrderItems(items =>
      items.map(i => (i.id === id ? { ...i, quantity: Math.max(1, qty) } : i))
    );
  };

  const toggleFree = (id: string) => {
    setOrderItems(items => items.map(i => (i.id === id ? { ...i, is_free: !i.is_free } : i)));
  };

  const removeRow = (id: string) => {
    setOrderItems(items => items.filter(i => i.id !== id));
  };

  const subtotalPaid = orderItems
    .filter(i => !i.is_free)
    .reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const discountValue = subtotalPaid * (discountPct / 100);
  const total = subtotalPaid - discountValue;

  const selectedClient = clients.find(c => c.id === selectedClientId);

  const handleSave = async (emailAfter: boolean) => {
    if (!selectedClientId) {
      toast.error('Please choose a client');
      return;
    }
    if (orderItems.length === 0) {
      toast.error('Please add at least one product');
      return;
    }
    // If any free items present, require a free reason
    const hasFree = orderItems.some(i => i.is_free);
    if (hasFree && !freeReason.trim()) {
      toast.error('Please add a reason for free stock');
      return;
    }
    if (discountPct > 0 && !discountReason.trim()) {
      toast.error('Please select/enter a discount reason');
      return;
    }

    setSaving(true);
    try {
      // Build items payload with final per-line "price"
      const rpcItems = orderItems.map(i => ({
        product_id: i.product_id,
        quantity: i.quantity,
        price: i.is_free ? 0 : i.unit_price * (1 - discountPct / 100) // per-line after discount
      }));

      const { orderId, error } = await createOrderWithItems({
        clientId: selectedClientId,
        repId: currentRep?.id as string,
        isFree: hasFree && orderItems.every(i => i.is_free), // true only if ALL are free
        discountPercent: discountPct,
        discountReason: discountPct > 0 ? discountReason : null,
        freeStockReason: hasFree ? freeReason : null,
        notes: orderNotes || null,
        items: rpcItems
      });

      if (error || !orderId) {
        console.error(error);
        toast.error(error?.message ?? 'Failed to create order');
        setSaving(false);
        return;
      }

      // Generate & download PDF
      const pdfBlob = await PDFService.generateOrderPDF(
        {
          id: orderId,
          order_date: new Date().toISOString(),
          is_free_stock: hasFree && orderItems.every(i => i.is_free),
          discount_percent: discountPct,
          discount_reason: discountReason || undefined,
          free_stock_reason: hasFree ? freeReason : undefined,
          notes: orderNotes || undefined
        },
        orderItems.map(i => ({
          product_name: i.product_name,
          quantity: i.quantity,
          unit_price: i.is_free ? 0 : i.unit_price,
          is_free: i.is_free
        })),
        {
          name: selectedClient?.name ?? '',
          location: selectedClient?.location ?? '',
          contact_name: selectedClient?.contact_name ?? '',
          contact_email: selectedClient?.contact_email ?? ''
        },
        currentRep ?? undefined
      );

      PDFService.downloadPDF(pdfBlob, `order-${orderId}.pdf`);

      // Upload to storage & email link (mailto)
      const filePath = `orders/${orderId}.pdf`;
      const { error: upErr } = await supabase.storage
        .from('order-pdfs')
        .upload(filePath, pdfBlob, { contentType: 'application/pdf', upsert: true });

      if (!upErr && emailAfter) {
        const { data: urlData } = supabase.storage.from('order-pdfs').getPublicUrl(filePath);
        const url = urlData?.publicUrl;
        const to = selectedClient?.contact_email ?? '';
        const subject = `Order ${orderId.slice(0, 8)} – ${selectedClient?.name ?? ''}`;
        const body = [
          `Hi ${selectedClient?.contact_name ?? ''},`,
          '',
          `Please find your order details here:`,
          url ? url : '(link unavailable)',
          '',
          'Kind regards,',
          `${currentRep?.name ?? ''} ${currentRep?.surname ?? ''}`
        ].join('\n');

        window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
          subject
        )}&body=${encodeURIComponent(body)}`;
      }

      // Reset form
      setSelectedClientId('');
      setSearch('');
      setOrderItems([]);
      setDiscountPct(0);
      setDiscountReason('');
      setFreeReason('');
      setOrderNotes('');
      toast('Order created successfully!');
    } catch (e) {
      console.error(e);
      toast.error('Failed to create order. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Create Order</h2>

      {/* Client search/select */}
      <div className="bg-white border rounded-lg p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Client</label>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search client by name or region…"
          className="w-full border rounded-md px-3 py-2"
        />
        <div className="max-h-48 overflow-y-auto mt-2 border rounded">
          {filteredClients.map(c => (
            <div
              key={c.id}
              onClick={() => {
                setSelectedClientId(c.id);
                setSearch(`${c.name}`);
              }}
              className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                selectedClientId === c.id ? 'bg-blue-100' : ''
              }`}
            >
              {c.name} {c.location ? `– ${c.location}` : ''}
            </div>
          ))}
        </div>
      </div>

      {/* Add products */}
      <div className="bg-white border rounded-lg p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Add Product</label>
        <div className="flex gap-2">
          <select
            className="flex-1 border rounded-md px-3 py-2"
            onChange={e => e.target.value && addProduct(e.target.value)}
            defaultValue=""
          >
            <option value="" disabled>
              Select a product…
            </option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} {p.price_trade != null ? `– ${currency(Number(p.price_trade))}` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="px-3 py-2 rounded-md bg-blue-600 text-white"
            onClick={() => {
              /* no-op: selection adds automatically */
            }}
          >
            <Plus size={16} />
          </button>
        </div>

        {orderItems.length > 0 && (
          <div className="mt-4 space-y-3">
            {orderItems.map(i => (
              <div
                key={i.id}
                className="flex items-center justify-between border rounded-md px-3 py-2"
              >
                <div className="flex-1 pr-2">
                  <div className="font-medium">{i.product_name}</div>
                  <div className="text-xs text-gray-500">
                    Unit: {currency(i.is_free ? 0 : i.unit_price)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="p-1 rounded border"
                    onClick={() => updateQty(i.id, i.quantity - 1)}
                  >
                    <Minus size={14} />
                  </button>
                  <div className="w-8 text-center">{i.quantity}</div>
                  <button
                    className="p-1 rounded border"
                    onClick={() => updateQty(i.id, i.quantity + 1)}
                  >
                    <Plus size={14} />
                  </button>

                  <label className="flex items-center gap-1 ml-3 text-xs">
                    <input
                      type="checkbox"
                      checked={!!i.is_free}
                      onChange={() => toggleFree(i.id)}
                    />
                    Free
                  </label>

                  <div className="w-24 text-right font-medium">
                    {currency((i.is_free ? 0 : i.unit_price * (1 - discountPct / 100)) * i.quantity)}
                  </div>

                  <button className="p-1 text-red-600" onClick={() => removeRow(i.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Options */}
      {orderItems.length > 0 && (
        <div className="bg-white border rounded-lg p-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Discount %</label>
              <input
                type="number"
                min={0}
                max={100}
                value={discountPct}
                onChange={e => setDiscountPct(Number(e.target.value || 0))}
                className="w-full border rounded-md px-3 py-2"
              />
            </div>
            {discountPct > 0 && (
              <div>
                <label className="block text-sm font-medium mb-1">Discount reason</label>
                <input
                  value={discountReason}
                  onChange={e => setDiscountReason(e.target.value)}
                  className="w-full border rounded-md px-3 py-2"
                  placeholder="Promotion / Deal / etc."
                />
              </div>
            )}
          </div>

          {orderItems.some(i => i.is_free) && (
            <div>
              <label className="block text-sm font-medium mb-1">Free stock reason</label>
              <input
                value={freeReason}
                onChange={e => setFreeReason(e.target.value)}
                className="w-full border rounded-md px-3 py-2"
                placeholder="Tasting / Swap / etc."
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Order notes</label>
            <textarea
              rows={3}
              value={orderNotes}
              onChange={e => setOrderNotes(e.target.value)}
              className="w-full border rounded-md px-3 py-2"
              placeholder="Any extra information…"
            />
          </div>
        </div>
      )}

      {/* Summary */}
      {orderItems.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <div className="flex justify-between">
            <span>Subtotal (paid lines):</span>
            <span className="font-medium">{currency(subtotalPaid)}</span>
          </div>
          <div className="flex justify-between">
            <span>Discount ({discountPct}%):</span>
            <span className="font-medium text-red-600">- {currency(discountValue)}</span>
          </div>
          <div className="flex justify-between text-lg font-semibold border-t pt-2 mt-2">
            <span>Total:</span>
            <span>{currency(total)}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      {orderItems.length > 0 && (
        <div className="flex gap-3">
          <button
            disabled={saving}
            onClick={() => handleSave(false)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white disabled:opacity-60"
          >
            <Download size={16} />
            Create & Download PDF
          </button>
          <button
            disabled={saving}
            onClick={() => handleSave(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 text-white disabled:opacity-60"
          >
            <Mail size={16} />
            Create & Email Link
          </button>
        </div>
      )}
    </div>
  );
}
