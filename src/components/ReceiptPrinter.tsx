import React, { forwardRef } from 'react';
import { Order } from '@/types';

interface ReceiptPrinterProps {
  order: Order | null;
  restaurantName?: string;
}

export const ReceiptPrinter = forwardRef<HTMLDivElement, ReceiptPrinterProps>(
  ({ order, restaurantName = "Restaurante" }, ref) => {
    if (!order) return null;

    const formatOrderCode = (code: string | null) => {
      if (!code) return '';
      return code.substring(0, 8); // simplified for ticket
    };

    const date = new Date(order.created_at).toLocaleString('es-ES', {
      dateStyle: 'short',
      timeStyle: 'short'
    });

    return (
      <div className="hidden">
        <div ref={ref} className="w-[80mm] p-4 text-black bg-white font-mono text-[12px] mx-auto">
          <div className="text-center mb-4 border-b border-black border-dashed pb-4">
            <h1 className="text-xl font-bold uppercase">{restaurantName}</h1>
            <p className="mt-1">Ticket de Pedido</p>
            <p className="font-bold mt-2 text-lg">#{formatOrderCode(order.order_code)}</p>
            <p className="mt-1">{date}</p>
          </div>

          <div className="mb-4">
            <p><strong>Cliente:</strong> {order.customer_name}</p>
            <p><strong>Tel:</strong> {order.customer_phone}</p>
            <p><strong>Tipo:</strong> {
              order.type === 'dine_in' ? `En Mesa ${order.table_number || ''}` : 
              order.type === 'delivery' ? 'Domicilio' : 'Retiro Local'
            }</p>
            {order.type === 'delivery' && (
              <p><strong>Dir:</strong> {order.delivery_address}</p>
            )}
          </div>

          <table className="w-full text-left mb-4 border-b border-black border-dashed pb-2">
            <thead>
              <tr className="border-b border-black">
                <th className="py-1">Cant</th>
                <th className="py-1">Desc</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.order_items?.map((item) => (
                <tr key={item.id}>
                  <td className="py-1 align-top">{item.quantity}</td>
                  <td className="py-1 align-top pr-1">
                    {item.menu_items?.name}
                    {item.notes && <div className="text-[10px] italic">*{item.notes}</div>}
                  </td>
                  <td className="py-1 text-right align-top">
                    ${(item.quantity * Number(item.unit_price)).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="text-right space-y-1 mb-4">
            <p>Subtotal: ${Number(order.subtotal).toFixed(2)}</p>
            {Number(order.tax) > 0 && <p>IVA: ${Number(order.tax).toFixed(2)}</p>}
            {Number(order.delivery_fee) > 0 && <p>Envío: ${Number(order.delivery_fee).toFixed(2)}</p>}
            <p className="font-bold text-base mt-2">TOTAL: ${Number(order.total_price).toFixed(2)}</p>
          </div>

          <div className="text-center border-t border-black border-dashed pt-4">
            <p><strong>Pago:</strong> {order.payment_method === 'cash' ? 'Efectivo' : order.payment_method === 'transfer' ? 'Transferencia' : 'Pendiente'}</p>
            <p className="mt-4 italic font-bold">¡Gracias por su preferencia, síganos en redes!</p>
          </div>
        </div>
      </div>
    );
  }
);

ReceiptPrinter.displayName = 'ReceiptPrinter';
