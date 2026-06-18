// src/lib/sri/ride.ts
// RIDE — Representación Impresa del Documento Electrónico (formato SRI).
// SOLO CLIENTE: usa canvas del navegador para el código de barras Code-128.

import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';

export interface RideEmisor {
  razonSocial: string;
  ruc: string;
  dirMatriz: string;
  dirEstablecimiento?: string | null;
  obligadoContabilidad: boolean;
  contribuyenteRimpe?: string | null;
  agenteRetencion?: string | null;
}

export interface RideComprobante {
  tipo: string;              // 'FACTURA'
  numero: string;
  claveAcceso: string;       // 49 dígitos
  fechaEmision: string;      // dd/mm/aaaa
  ambiente: 1 | 2;
  fechaAutorizacion?: string | null;
}

export interface RideFacturaInput {
  emisor: RideEmisor;
  comprobante: RideComprobante;
  comprador: { razonSocial: string; identificacion: string; direccion?: string | null };
  lineas: { codigo: string; descripcion: string; cantidad: number; precioUnitario: number; descuento: number; subtotal: number }[];
  subtotal15: number;
  subtotal5: number;
  subtotal0: number;
  descuento: number;
  iva: number;
  total: number;
  formaPago: string;
}

const money = (n: number) => `$ ${n.toFixed(2)}`;

function barcodeDataUrl(clave: string): string {
  if (typeof window === 'undefined') return ''; // Evita fallos en SSR/build
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, clave, { format: 'CODE128', displayValue: false, height: 36, margin: 0, width: 1 });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error('Error generando código de barras:', err);
    return '';
  }
}

function drawHeader(doc: jsPDF, emisor: RideEmisor, comp: RideComprobante): number {
  const W = doc.internal.pageSize.getWidth();
  const colIzq = 12, colDer = W / 2 + 4, anchoCol = W / 2 - 16;
  let y = 16;

  doc.setFont('helvetica', 'bold').setFontSize(11);
  doc.text(emisor.razonSocial, colIzq, y, { maxWidth: anchoCol }); y += 8;
  doc.setFont('helvetica', 'normal').setFontSize(8);
  doc.text(`RUC: ${emisor.ruc}`, colIzq, y); y += 5;
  doc.text(`Matriz: ${emisor.dirMatriz}`, colIzq, y, { maxWidth: anchoCol }); y += 5;
  if (emisor.dirEstablecimiento && emisor.dirEstablecimiento !== emisor.dirMatriz) {
    doc.text(`Sucursal: ${emisor.dirEstablecimiento}`, colIzq, y, { maxWidth: anchoCol }); y += 5;
  }
  doc.text(`OBLIGADO A LLEVAR CONTABILIDAD: ${emisor.obligadoContabilidad ? 'SI' : 'NO'}`, colIzq, y); y += 5;
  if (emisor.contribuyenteRimpe) { doc.text(emisor.contribuyenteRimpe, colIzq, y, { maxWidth: anchoCol }); y += 5; }
  if (emisor.agenteRetencion)    { doc.text(`Agente de Retención Res. ${emisor.agenteRetencion}`, colIzq, y); y += 5; }
  const finIzq = y;

  let yd = 12;
  doc.rect(colDer - 2, yd - 4, anchoCol + 4, 58);
  doc.setFont('helvetica', 'bold').setFontSize(11);
  doc.text(comp.tipo, colDer, yd + 2); yd += 8;
  doc.setFontSize(9);
  doc.text(`No. ${comp.numero}`, colDer, yd); yd += 7;
  doc.setFont('helvetica', 'normal').setFontSize(7.5);
  doc.text('NÚMERO DE AUTORIZACIÓN:', colDer, yd); yd += 4;
  doc.setFontSize(6.6);
  doc.text(comp.claveAcceso, colDer, yd); yd += 5;
  doc.setFontSize(7.5);
  doc.text(`FECHA EMISIÓN: ${comp.fechaEmision}`, colDer, yd); yd += 4.5;
  doc.text(`AMBIENTE: ${comp.ambiente === 2 ? 'PRODUCCIÓN' : 'PRUEBAS'}   EMISIÓN: NORMAL`, colDer, yd); yd += 4.5;
  doc.text('CLAVE DE ACCESO:', colDer, yd); yd += 2;
  
  const barcodeB64 = barcodeDataUrl(comp.claveAcceso);
  if (barcodeB64) {
    try {
      doc.addImage(barcodeB64, 'PNG', colDer, yd, anchoCol, 11);
    } catch { /* se omite si falla */ }
  }
  yd += 13;
  doc.setFontSize(6.4);
  doc.text(comp.claveAcceso, colDer, yd);

  return Math.max(finIzq, 74);
}

function drawFooter(doc: jsPDF, comp: RideComprobante) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'italic').setFontSize(7);
  doc.text(
    comp.ambiente === 1
      ? 'DOCUMENTO EMITIDO EN AMBIENTE DE PRUEBAS - SIN VALIDEZ TRIBUTARIA'
      : 'Documento generado — Comprobante electrónico autorizado por el SRI',
    W / 2, H - 8, { align: 'center' }
  );
}

export function buildRideFactura(input: RideFacturaInput): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W   = doc.internal.pageSize.getWidth();
  let y     = drawHeader(doc, input.emisor, input.comprobante);

  doc.setDrawColor(120).rect(12, y, W - 24, 14);
  doc.setFont('helvetica', 'normal').setFontSize(8);
  doc.text(`Razón Social / Nombres: ${input.comprador.razonSocial}`, 14, y + 5);
  doc.text(`Identificación: ${input.comprador.identificacion}`, 14, y + 10);
  if (input.comprador.direccion) doc.text(`Dirección: ${input.comprador.direccion}`, W / 2, y + 10);
  y += 20;

  doc.setFont('helvetica', 'bold').setFontSize(8);
  doc.setFillColor('#EBEBEB').rect(12, y, W - 24, 6, 'F');
  doc.text('Código', 14, y + 4);
  doc.text('Descripción', 40, y + 4);
  doc.text('Cant.', 120, y + 4, { align: 'right' });
  doc.text('P. Unit.', 145, y + 4, { align: 'right' });
  doc.text('Dscto.', 165, y + 4, { align: 'right' });
  doc.text('Subtotal', W - 14, y + 4, { align: 'right' });
  y += 8;
  doc.setFont('helvetica', 'normal');
  for (const l of input.lineas) {
    doc.text(l.codigo, 14, y + 3);
    doc.text(doc.splitTextToSize(l.descripcion, 70), 40, y + 3);
    doc.text(l.cantidad.toFixed(2), 120, y + 3, { align: 'right' });
    doc.text(l.precioUnitario.toFixed(4), 145, y + 3, { align: 'right' });
    doc.text(l.descuento.toFixed(2), 165, y + 3, { align: 'right' });
    doc.text(l.subtotal.toFixed(2), W - 14, y + 3, { align: 'right' });
    y += 6;
    if (y > 250) { doc.addPage(); y = 16; }
  }
  doc.line(12, y, W - 12, y); y += 4;

  const filas: [string, number][] = [
    ['SUBTOTAL 15%', input.subtotal15],
    ['SUBTOTAL 5%',  input.subtotal5],
    ['SUBTOTAL 0%',  input.subtotal0],
    ['DESCUENTO',    input.descuento],
    ['IVA',          input.iva],
    ['VALOR TOTAL',  input.total],
  ];
  let yt = y;
  doc.setFontSize(8);
  for (const [lbl, val] of filas) {
    const esTotal = lbl === 'VALOR TOTAL';
    doc.setFont('helvetica', esTotal ? 'bold' : 'normal');
    doc.rect(W / 2 + 10, yt, 55, 6).rect(W / 2 + 65, yt, 31, 6);
    doc.text(lbl, W / 2 + 12, yt + 4);
    doc.text(money(val), W - 14, yt + 4, { align: 'right' });
    yt += 6;
  }
  doc.setFont('helvetica', 'normal');
  doc.rect(12, y, 80, 12);
  doc.text('Forma de pago:', 14, y + 5);
  
  // Convert payment method catalog code to text for RIDE display
  const formasPagoText: Record<string, string> = {
    '01': 'Sin utilización del sistema financiero (Efectivo)',
    '16': 'Tarjeta de Débito',
    '17': 'Dinero Electrónico',
    '19': 'Tarjeta de Crédito',
    '20': 'Otros con utilización del sistema financiero'
  };
  const formaPagoLabel = formasPagoText[input.formaPago] || 'Otros con utilización del sistema financiero';
  doc.text(doc.splitTextToSize(formaPagoLabel, 76), 14, y + 10);

  drawFooter(doc, input.comprobante);
  return doc;
}
