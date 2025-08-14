// src/components/PDF.ts
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const PDFService = {
  async generateOrderPDF(
    order: {
      id: string;
      order_date: string;
      is_free_stock: boolean;
      discount_percent: number;
      discount_reason?: string;
      free_stock_reason?: string;
      notes?: string;
    },
    items: Array<{
      product_name: string;
      quantity: number;
      unit_price: number;
      is_free?: boolean;
    }>,
    client: { name: string; location?: string | null; contact_name?: string | null; contact_email?: string | null },
    rep?: { name?: string | null; surname?: string | null }
  ): Promise<Blob> {
    const doc = new jsPDF();

    const fmt = (n: number) => `R ${n.toFixed(2)}`;

    doc.setFontSize(16);
    doc.text('Order Confirmation', 14, 18);

    doc.setFontSize(10);
    doc.text(`Order #: ${order.id}`, 14, 26);
    doc.text(`Date: ${new Date(order.order_date).toLocaleString()}`, 14, 31);

    doc.text(`Client: ${client.name}`, 14, 39);
    doc.text(`Region: ${client.location ?? '-'}`, 14, 44);
    doc.text(`Contact: ${client.contact_name ?? '-'}`, 14, 49);
    doc.text(`Email: ${client.contact_email ?? '-'}`, 14, 54);

    doc.text(`Rep: ${(rep?.name ?? '') + ' ' + (rep?.surname ?? '')}`.trim(), 120, 39);

    autoTable(doc, {
      startY: 62,
      head: [['Product', 'Qty', 'Unit', 'Line Total', 'Type']],
      body: items.map(i => {
        const unit = i.is_free ? 0 : i.unit_price;
        const line = unit * i.quantity;
        return [
          i.product_name,
          String(i.quantity),
          fmt(unit),
          fmt(line),
          i.is_free ? 'FREE' : 'PAID'
        ];
      }),
      styles: { fontSize: 9 }
    });

    const subtotal = items.reduce((s, i) => s + (i.is_free ? 0 : i.unit_price * i.quantity), 0);
    const discount = subtotal * (order.discount_percent / 100);
    const total = subtotal - discount;

    const y = (doc as any).lastAutoTable.finalY + 8;
    doc.text(`Subtotal: ${fmt(subtotal)}`, 120, y);
    doc.text(`Discount (${order.discount_percent}%): ${fmt(discount)}`, 120, y + 6);
    doc.setFont(undefined, 'bold');
    doc.text(`TOTAL: ${fmt(total)}`, 120, y + 12);
    doc.setFont(undefined, 'normal');

    let noteY = y + 22;
    if (order.is_free_stock) {
      doc.text(`Free stock reason: ${order.free_stock_reason ?? '-'}`, 14, noteY);
      noteY += 6;
    }
    if (order.discount_percent > 0) {
      doc.text(`Discount reason: ${order.discount_reason ?? '-'}`, 14, noteY);
      noteY += 6;
    }
    if (order.notes) {
      doc.text(`Notes: ${order.notes}`, 14, noteY);
    }

    const blob = doc.output('blob');
    return blob;
  },

  downloadPDF(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
};
