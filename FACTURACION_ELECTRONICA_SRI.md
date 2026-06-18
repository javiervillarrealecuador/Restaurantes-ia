# Módulo de Facturación Electrónica — SRI Ecuador

> **Propósito de este documento:** es autosuficiente. Contiene toda la arquitectura, el código fuente completo, el esquema de base de datos, los catálogos del SRI y la guía de implementación paso a paso para construir el módulo de emisión de facturas electrónicas en cualquier software que use Node.js como runtime de servidor.

---

## Índice

1. [Visión general y arquitectura](#1-visión-general-y-arquitectura)
2. [Flujo de emisión de una factura](#2-flujo-de-emisión-de-una-factura)
3. [Dependencias npm](#3-dependencias-npm)
4. [Esquema de base de datos (SQL)](#4-esquema-de-base-de-datos-sql)
5. [Variables de entorno](#5-variables-de-entorno)
6. [Código fuente — sri-factura.ts](#6-código-fuente--sri-facturatstgenerador-xml-puro)
7. [Código fuente — sri-firma.ts](#7-código-fuente--sri-firmatsfirma-xades-bes)
8. [Código fuente — sri-soap.ts](#8-código-fuente--sri-soaptscomunicación-soap-con-el-sri)
9. [Código fuente — sri-factura-db.ts](#9-código-fuente--sri-factura-dbtsconexión-con-la-base-de-datos)
10. [Código fuente — sri-ride.ts](#10-código-fuente--sri-ridetsride-pdf-navegador)
11. [Código fuente — API /sri/sign](#11-código-fuente--api-srisign)
12. [Código fuente — API /sri/send](#12-código-fuente--api-srisend)
13. [Código fuente — API /sri/email](#13-código-fuente--api-sriemail)
14. [Catálogos SRI](#14-catálogos-sri)
15. [Estructura de la clave de acceso (49 dígitos)](#15-estructura-de-la-clave-de-acceso-49-dígitos)
16. [Guía de implementación paso a paso](#16-guía-de-implementación-paso-a-paso)
17. [Errores frecuentes del SRI](#17-errores-frecuentes-del-sri)
18. [Qué adaptar al migrar a otro software](#18-qué-adaptar-al-migrar-a-otro-software)

---

## 1. Visión general y arquitectura

### Por qué este módulo es portable

El módulo fue diseñado en tres capas desacopladas:

```
┌─────────────────────────────────────────────────────────────────┐
│  CAPA 1 — LÓGICA PURA (sin dependencias de framework o BD)      │
│  sri-factura.ts   → Genera el XML V2.1.0 + clave de acceso      │
│  sri-firma.ts     → Firma XAdES-BES con el certificado .p12     │
│  sri-soap.ts      → Comunica con los web services SOAP del SRI  │
│                                                                  │
│  ✅ Estos tres archivos se copian SIN MODIFICAR a cualquier      │
│     proyecto Node.js.                                            │
├─────────────────────────────────────────────────────────────────┤
│  CAPA 2 — ACCESO A DATOS                                        │
│  sri-factura-db.ts → Lee datos de la BD, arma FacturaInput,     │
│                      persiste el resultado del SRI.             │
│                                                                  │
│  ⚠️  Esta es la ÚNICA capa que hay que adaptar al cambiar de    │
│     plataforma (reemplazar llamadas Supabase con tu cliente BD). │
├─────────────────────────────────────────────────────────────────┤
│  CAPA 3 — API REST (endpoints de servidor)                      │
│  POST /api/sri/sign   → Firma el XML (servidor, nunca cliente)  │
│  POST /api/sri/send   → Envía al SRI y obtiene autorización     │
│  POST /api/sri/email  → Envía el RIDE por correo al cliente     │
│                                                                  │
│  ⚠️  Reimplementar en Express, FastAPI, Laravel, etc.           │
├─────────────────────────────────────────────────────────────────┤
│  CAPA 4 — PRESENTACIÓN (solo navegador)                         │
│  sri-ride.ts → Genera el PDF del RIDE con jsPDF + Code-128      │
│                                                                  │
│  Solo necesario si el nuevo software tiene interfaz web.         │
└─────────────────────────────────────────────────────────────────┘
```

### Tablas de base de datos involucradas

| Tabla | Rol en el módulo |
|---|---|
| `res_company` | Configuración del emisor: RUC, serie, certificado .p12, régimen tributario, ambiente SRI |
| `sale_order` | Venta/factura: estado SRI, número, clave de acceso, resultado de autorización |
| `sale_order_line` | Líneas de la factura: cantidad, precio, tarifa IVA |
| `res_partner` | Comprador: RUC/cédula, nombre, dirección |
| `product_product` / `product_template` | Código y descripción del producto |
| `sri_document_sequence` | Control atómico del secuencial por tipo de comprobante |

---

## 2. Flujo de emisión de una factura

```
Usuario hace clic en "Enviar al SRI"
         │
         ▼
[sri-factura-db.ts] generateFacturaForSale(saleId)
  ├─ Lee venta + empresa + líneas desde BD
  ├─ Arma FacturaInput
  └─ Llama buildFacturaXml() → { xml, claveAcceso, numeroFactura }
         │
         ▼
POST /api/sri/sign  ← XML sin firmar + company_id
  └─ [sri-firma.ts] signXml() → XML con <ds:Signature> embebido
         │
         ▼
POST /api/sri/send  ← signedXml + claveAcceso + ambiente
  ├─ [sri-soap.ts] enviarComprobante() → RecepcionComprobantesOffline
  │     └─ Respuesta: RECIBIDA | DEVUELTA
  │
  └─ (si RECIBIDA) [sri-soap.ts] consultarAutorizacion() ×5 intentos
        └─ Respuesta: AUTORIZADO | NO AUTORIZADO | EN PROCESO
         │
         ▼
[sri-factura-db.ts] Guarda en sale_order:
  sri_estado, sri_autorizacion, sri_fecha_aut, sri_mensajes
         │
         ▼
(Opcional) POST /api/sri/email → Envía RIDE por correo al cliente
(Opcional) [sri-ride.ts] buildRideFactura() → PDF descargable
```

**Regla crítica de ambiente:**

| Valor `ambiente` | URL SOAP | Dígito 24 clave acceso | Para qué |
|---|---|---|---|
| `1` | `celcer.sri.gob.ec` | `1` | Pruebas — sin validez tributaria |
| `2` | `cel.sri.gob.ec` | `2` | Producción — comprobantes reales |

> ⚠️ El valor `ambiente` debe ser el mismo en: columna `sri_ambiente` de `res_company`, dígito 24 de la clave de acceso, y la URL del web service SOAP. Si difieren, el SRI devuelve error "El ambiente no corresponde".

---

## 3. Dependencias npm

```bash
npm install node-forge jspdf jsbarcode nodemailer
npm install --save-dev @types/node-forge @types/nodemailer
```

| Paquete | Versión mínima | Por qué es necesaria |
|---|---|---|
| `node-forge` | `^1.3.1` | Firma XAdES-BES: RSA-SHA1 y parseo del .p12. El SRI exige SHA-1; no hay opción más simple que provea control DER/ASN.1. |
| `jspdf` | `^2.5.2` | Genera el PDF del RIDE en el navegador sin servidor. |
| `jsbarcode` | `^3.11.6` | Código de barras Code-128 de la clave de acceso en canvas HTML. El RIDE estándar SRI lo exige. |
| `nodemailer` | `^6.9.16` | Envío SMTP desde el servidor. Las credenciales no pueden estar en el cliente. |

---

## 4. Esquema de base de datos (SQL)

Aplicar este script antes de usar el módulo. Es **idempotente** (seguro de re-ejecutar).

```sql
-- =============================================================================
-- SCHEMA SRI — FACTURACIÓN ELECTRÓNICA ECUADOR
-- PostgreSQL >= 13. Aplica sobre res_company, sale_order, sale_order_line.
-- =============================================================================

-- ── 1. EMPRESA — configuración del emisor electrónico ─────────────────────────
ALTER TABLE public.res_company
  ADD COLUMN IF NOT EXISTS sri_dir_matriz         VARCHAR(300) DEFAULT 'S/D',
  ADD COLUMN IF NOT EXISTS sri_dir_estab          VARCHAR(300),
  ADD COLUMN IF NOT EXISTS sri_estab              VARCHAR(3)   DEFAULT '001',
  ADD COLUMN IF NOT EXISTS sri_pto_emi            VARCHAR(3)   DEFAULT '001',
  ADD COLUMN IF NOT EXISTS sri_obligado_contab    BOOLEAN      DEFAULT TRUE,
  -- Texto EXACTO del SRI: 'CONTRIBUYENTE RÉGIMEN RIMPE EMPRENDEDOR'
  -- o 'CONTRIBUYENTE NEGOCIO POPULAR - RÉGIMEN RIMPE'. NULL = no es RIMPE.
  ADD COLUMN IF NOT EXISTS sri_rimpe              VARCHAR(80),
  ADD COLUMN IF NOT EXISTS sri_agente_retencion   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS sri_contrib_especial   VARCHAR(20),
  -- 1 = pruebas (celcer.sri.gob.ec) | 2 = producción (cel.sri.gob.ec)
  ADD COLUMN IF NOT EXISTS sri_ambiente           SMALLINT     DEFAULT 1,
  -- Certificado .p12 en Base64 + contraseña (multiempresa)
  ADD COLUMN IF NOT EXISTS sri_p12_b64            TEXT,
  ADD COLUMN IF NOT EXISTS sri_p12_pwd            TEXT,
  ADD COLUMN IF NOT EXISTS sri_firma_expira       DATE,
  ADD COLUMN IF NOT EXISTS sri_firma_razon        TEXT,
  ADD COLUMN IF NOT EXISTS sri_logo_b64           TEXT,
  ADD COLUMN IF NOT EXISTS sri_email_envio        TEXT;

-- ── 2. VENTA — estado del comprobante ante el SRI ─────────────────────────────
-- Ciclo: NULL → RECIBIDA → AUTORIZADO
--                       ↘ DEVUELTA (rechazado en recepción)
--                       ↘ NO AUTORIZADO (rechazado en autorización)
ALTER TABLE public.sale_order
  ADD COLUMN IF NOT EXISTS invoice_ref            VARCHAR(20),   -- 001-001-000000001
  ADD COLUMN IF NOT EXISTS invoice_auth           VARCHAR(49),   -- clave de acceso
  ADD COLUMN IF NOT EXISTS sri_estado             VARCHAR(20),
  ADD COLUMN IF NOT EXISTS sri_autorizacion       VARCHAR(49),
  ADD COLUMN IF NOT EXISTS sri_fecha_aut          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sri_ambiente           SMALLINT,
  ADD COLUMN IF NOT EXISTS sri_mensajes           TEXT,
  -- Catálogo SRI: 01 efectivo, 16 débito, 19 crédito, 20 otros financiero
  ADD COLUMN IF NOT EXISTS forma_pago             VARCHAR(2)   NOT NULL DEFAULT '01';

-- ── 3. LÍNEA DE VENTA — tarifa IVA ────────────────────────────────────────────
-- El XML exige totalConImpuestos agrupado por tarifa; por eso se guarda por línea.
ALTER TABLE public.sale_order_line
  ADD COLUMN IF NOT EXISTS iva_rate               NUMERIC(5,2) DEFAULT 15;

-- ── 4. SECUENCIAL DE DOCUMENTOS — control atómico ────────────────────────────
-- IMPRESCINDIBLE: el SRI rechaza secuenciales repetidos.
CREATE TABLE IF NOT EXISTS public.sri_document_sequence (
    id          BIGSERIAL PRIMARY KEY,
    company_id  BIGINT      NOT NULL REFERENCES public.res_company(id) ON DELETE CASCADE,
    doc_type    VARCHAR(20) NOT NULL,
    -- 'factura' | 'nota_credito' | 'nota_debito' | 'guia_remision' | 'retencion'
    estab       VARCHAR(3)  NOT NULL DEFAULT '001',
    pto_emi     VARCHAR(3)  NOT NULL DEFAULT '001',
    next_number INTEGER     NOT NULL DEFAULT 1,
    CONSTRAINT sri_doc_seq_unique UNIQUE (company_id, doc_type, estab, pto_emi)
);

CREATE INDEX IF NOT EXISTS idx_sri_doc_seq_company
    ON public.sri_document_sequence (company_id, doc_type);

-- Función auxiliar: obtiene y avanza el secuencial de forma atómica
CREATE OR REPLACE FUNCTION public.sri_next_secuencial(
    p_company_id BIGINT, p_doc_type VARCHAR,
    p_estab VARCHAR DEFAULT '001', p_pto_emi VARCHAR DEFAULT '001'
) RETURNS INTEGER AS $$
DECLARE v_next INTEGER;
BEGIN
    UPDATE public.sri_document_sequence
    SET next_number = next_number + 1
    WHERE company_id = p_company_id AND doc_type = p_doc_type
      AND estab = p_estab AND pto_emi = p_pto_emi
    RETURNING next_number - 1 INTO v_next;

    IF v_next IS NULL THEN
        INSERT INTO public.sri_document_sequence
            (company_id, doc_type, estab, pto_emi, next_number)
        VALUES (p_company_id, p_doc_type, p_estab, p_pto_emi, 2)
        ON CONFLICT (company_id, doc_type, estab, pto_emi)
        DO UPDATE SET next_number = sri_document_sequence.next_number + 1
        RETURNING next_number - 1 INTO v_next;
    END IF;
    RETURN v_next;
END;
$$ LANGUAGE plpgsql;

-- Secuenciales iniciales para la empresa 1
INSERT INTO public.sri_document_sequence (company_id, doc_type, estab, pto_emi, next_number)
VALUES
  (1, 'factura',       '001', '001', 1),
  (1, 'nota_credito',  '001', '001', 1),
  (1, 'nota_debito',   '001', '001', 1),
  (1, 'guia_remision', '001', '001', 1),
  (1, 'retencion',     '001', '001', 1)
ON CONFLICT (company_id, doc_type, estab, pto_emi) DO NOTHING;
```

---

## 5. Variables de entorno

Crear `.env.local` (o el sistema de configuración de tu plataforma):

```env
# Base de datos
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh...
SUPABASE_SERVICE_ROLE_KEY=eyJh...   # Solo para el endpoint /api/sri/sign

# Certificado de firma (alternativa a BD: .p12 local)
SRI_P12_PATH=./certs/firma.p12
SRI_P12_PASSWORD=contraseña_del_p12

# SMTP — envío de comprobantes por correo
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false          # true para puerto 465 (SSL), false para 587 (STARTTLS)
SMTP_USER=noreply@empresa.com
SMTP_PASS=contraseña_de_aplicacion
SMTP_FROM="Mi Empresa <noreply@empresa.com>"
```

> **Contraseña de aplicación Gmail:** Configuración → Seguridad → Verificación en dos pasos → Contraseñas de aplicación. La contraseña personal **no** funciona con nodemailer.

---

## 6. Código fuente — `sri-factura.ts` (generador XML puro)

> Este archivo no importa Supabase, ni APIs del navegador. Se puede probar con Node.js puro.

```typescript
// src/lib/sri-factura.ts
// Facturación electrónica SRI — XML de factura V2.1.0 + clave de acceso.
//
// MÓDULO PURO: no importa supabase ni APIs del navegador.
//
// EL PORQUÉ de cada pieza:
// - claveAcceso (49 dígitos): fecha(8)+codDoc(2)+RUC(13)+ambiente(1)+serie(6)+
//   secuencial(9)+códigoNumérico(8)+tipoEmision(1)+dígitoVerificador(1).
//   Dígito verificador: módulo 11 con pesos 2..7 desde la derecha:
//   11-(suma%11); si resulta 11→0, si resulta 10→1.
// - codigoPorcentaje IVA: 0%→0, 12%→2, 14%→3, 15%→4, 5%→5, no objeto→6, exento→7.
// - tipoIdentificacionComprador: 04 RUC, 05 cédula, 06 pasaporte,
//   07 consumidor final (identificación 9999999999999).

export interface FacturaEmisor {
  ruc: string;
  razonSocial: string;
  nombreComercial?: string | null;
  dirMatriz: string;
  dirEstablecimiento?: string | null;
  estab: string;
  ptoEmi: string;
  ambiente: 1 | 2;
  obligadoContabilidad: boolean;
  contribuyenteEspecial?: string | null;
  agenteRetencion?: string | null;
  contribuyenteRimpe?: string | null;
}

export interface FacturaComprador {
  identificacion: string;
  razonSocial: string;
  direccion?: string | null;
}

export interface FacturaLinea {
  codigo: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  ivaRate: number;   // 0, 5, 12, 14, 15
}

export interface FacturaInput {
  emisor: FacturaEmisor;
  comprador: FacturaComprador;
  fechaEmision: string;   // ISO yyyy-mm-dd
  secuencial: number;
  lineas: FacturaLinea[];
  formaPago?: string;     // catálogo SRI: 01 efectivo, 19 crédito...
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const f2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const f6 = (n: number) => n.toFixed(6);
const esc = (s: string) =>
  (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
           .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function isoToDDMMYYYY(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Tabla SRI: tarifa numérica → codigoPorcentaje en el XML */
export function ivaCodigoPorcentaje(rate: number): string {
  if (rate === 0)  return '0';
  if (rate === 12) return '2';
  if (rate === 14) return '3';
  if (rate === 15) return '4';
  if (rate === 5)  return '5';
  throw new Error(`Tarifa de IVA ${rate}% sin código SRI mapeado`);
}

/** Tipo de identificación según longitud */
export function tipoIdentificacion(id: string): { tipo: string; id: string } {
  const clean = (id || '').trim();
  if (!clean)                        return { tipo: '07', id: '9999999999999' }; // consumidor final
  if (/^\d{13}$/.test(clean))        return { tipo: '04', id: clean };           // RUC
  if (/^\d{10}$/.test(clean))        return { tipo: '05', id: clean };           // cédula
  return { tipo: '06', id: clean };                                               // pasaporte
}

// ── Clave de acceso — módulo 11 ───────────────────────────────────────────────

export function digitoVerificadorMod11(digits48: string): number {
  let sum = 0, weight = 2;
  for (let i = digits48.length - 1; i >= 0; i--) {
    sum += Number(digits48[i]) * weight;
    weight = weight === 7 ? 2 : weight + 1;
  }
  const dv = 11 - (sum % 11);
  if (dv === 11) return 0;
  if (dv === 10) return 1;
  return dv;
}

export function claveAcceso(input: {
  fechaEmision: string;
  codDoc: string;
  ruc: string;
  ambiente: 1 | 2;
  estab: string;
  ptoEmi: string;
  secuencial: number;
  codigoNumerico?: string;
  tipoEmision?: string;
}): string {
  const [y, m, d] = input.fechaEmision.slice(0, 10).split('-');
  const fecha = `${d}${m}${y}`;
  const serie = `${input.estab}${input.ptoEmi}`;
  const sec = String(input.secuencial).padStart(9, '0');
  const codNum = (input.codigoNumerico ||
    String(Math.floor(Math.random() * 1e8)).padStart(8, '0')).slice(0, 8).padStart(8, '0');
  const tipoEmision = input.tipoEmision || '1';

  const base48 = `${fecha}${input.codDoc}${input.ruc}${input.ambiente}${serie}${sec}${codNum}${tipoEmision}`;
  if (base48.length !== 48 || !/^\d{48}$/.test(base48)) {
    throw new Error(
      `Clave de acceso inválida (largo ${base48.length}, debe ser 48 antes del verificador). ` +
      `Revisa RUC (13 dígitos) y serie.`
    );
  }
  return base48 + String(digitoVerificadorMod11(base48));
}

// ── Generador XML factura V2.1.0 ──────────────────────────────────────────────

export interface FacturaResult {
  xml: string;
  claveAcceso: string;
  secuencialFormateado: string;
  numeroFactura: string;
  importeTotal: number;
}

export function buildFacturaXml(input: FacturaInput, codigoNumerico?: string): FacturaResult {
  const e = input.emisor;
  const sec9 = String(input.secuencial).padStart(9, '0');

  const porTarifa: Record<string, { rate: number; base: number; valor: number }> = {};
  let totalSinImpuestos = 0, totalDescuento = 0;

  for (const l of input.lineas) {
    const subtotal = Math.round((l.cantidad * l.precioUnitario - l.descuento) * 100) / 100;
    totalSinImpuestos += subtotal;
    totalDescuento += l.descuento;
    const cod = ivaCodigoPorcentaje(l.ivaRate);
    if (!porTarifa[cod]) porTarifa[cod] = { rate: l.ivaRate, base: 0, valor: 0 };
    porTarifa[cod].base  += subtotal;
    porTarifa[cod].valor += Math.round(subtotal * l.ivaRate) / 100;
  }
  totalSinImpuestos = Math.round(totalSinImpuestos * 100) / 100;
  const totalIva     = Math.round(Object.values(porTarifa).reduce((s, t) => s + t.valor, 0) * 100) / 100;
  const importeTotal = Math.round((totalSinImpuestos + totalIva) * 100) / 100;

  const clave  = claveAcceso({ fechaEmision: input.fechaEmision, codDoc: '01', ruc: e.ruc,
    ambiente: e.ambiente, estab: e.estab, ptoEmi: e.ptoEmi,
    secuencial: input.secuencial, codigoNumerico });
  const compr  = tipoIdentificacion(input.comprador.identificacion);
  const formaPago = input.formaPago || '01';

  const totalImpuestosXml = Object.entries(porTarifa).map(([cod, t]) => `
    <totalImpuesto>
      <codigo>2</codigo>
      <codigoPorcentaje>${cod}</codigoPorcentaje>
      <baseImponible>${f2(t.base)}</baseImponible>
      <tarifa>${f2(t.rate)}</tarifa>
      <valor>${f2(t.valor)}</valor>
    </totalImpuesto>`).join('');

  const detallesXml = input.lineas.map(l => {
    const subtotal  = Math.round((l.cantidad * l.precioUnitario - l.descuento) * 100) / 100;
    const cod       = ivaCodigoPorcentaje(l.ivaRate);
    const ivaValor  = Math.round(subtotal * l.ivaRate) / 100;
    return `
    <detalle>
      <codigoPrincipal>${esc(l.codigo)}</codigoPrincipal>
      <descripcion>${esc(l.descripcion)}</descripcion>
      <cantidad>${f6(l.cantidad)}</cantidad>
      <precioUnitario>${f6(l.precioUnitario)}</precioUnitario>
      <descuento>${f2(l.descuento)}</descuento>
      <precioTotalSinImpuesto>${f2(subtotal)}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>${cod}</codigoPorcentaje>
          <tarifa>${f2(l.ivaRate)}</tarifa>
          <baseImponible>${f2(subtotal)}</baseImponible>
          <valor>${f2(ivaValor)}</valor>
        </impuesto>
      </impuestos>
    </detalle>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="2.1.0">
  <infoTributaria>
    <ambiente>${e.ambiente}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${esc(e.razonSocial)}</razonSocial>${e.nombreComercial ? `
    <nombreComercial>${esc(e.nombreComercial)}</nombreComercial>` : ''}
    <ruc>${e.ruc}</ruc>
    <claveAcceso>${clave}</claveAcceso>
    <codDoc>01</codDoc>
    <estab>${e.estab}</estab>
    <ptoEmi>${e.ptoEmi}</ptoEmi>
    <secuencial>${sec9}</secuencial>
    <dirMatriz>${esc(e.dirMatriz)}</dirMatriz>${e.agenteRetencion ? `
    <agenteRetencion>${esc(e.agenteRetencion)}</agenteRetencion>` : ''}${e.contribuyenteRimpe ? `
    <contribuyenteRimpe>${esc(e.contribuyenteRimpe)}</contribuyenteRimpe>` : ''}
  </infoTributaria>
  <infoFactura>
    <fechaEmision>${isoToDDMMYYYY(input.fechaEmision)}</fechaEmision>${e.dirEstablecimiento ? `
    <dirEstablecimiento>${esc(e.dirEstablecimiento)}</dirEstablecimiento>` : ''}${e.contribuyenteEspecial ? `
    <contribuyenteEspecial>${esc(e.contribuyenteEspecial)}</contribuyenteEspecial>` : ''}
    <obligadoContabilidad>${e.obligadoContabilidad ? 'SI' : 'NO'}</obligadoContabilidad>
    <tipoIdentificacionComprador>${compr.tipo}</tipoIdentificacionComprador>
    <razonSocialComprador>${esc(input.comprador.razonSocial)}</razonSocialComprador>
    <identificacionComprador>${compr.id}</identificacionComprador>${input.comprador.direccion ? `
    <direccionComprador>${esc(input.comprador.direccion)}</direccionComprador>` : ''}
    <totalSinImpuestos>${f2(totalSinImpuestos)}</totalSinImpuestos>
    <totalDescuento>${f2(totalDescuento)}</totalDescuento>
    <totalConImpuestos>${totalImpuestosXml}
    </totalConImpuestos>
    <propina>0.00</propina>
    <importeTotal>${f2(importeTotal)}</importeTotal>
    <moneda>DOLAR</moneda>
    <pagos>
      <pago>
        <formaPago>${formaPago}</formaPago>
        <total>${f2(importeTotal)}</total>
      </pago>
    </pagos>
  </infoFactura>
  <detalles>${detallesXml}
  </detalles>
</factura>`;

  return {
    xml,
    claveAcceso: clave,
    secuencialFormateado: sec9,
    numeroFactura: `${e.estab}-${e.ptoEmi}-${sec9}`,
    importeTotal,
  };
}
```

---

## 7. Código fuente — `sri-firma.ts` (firma XAdES-BES)

> **Solo servidor.** Lee el .p12 desde BD o desde `.env.local`. Nunca importar desde componentes cliente.

```typescript
// src/lib/sri-firma.ts
// FASE 2 — Firma XAdES-BES para comprobantes electrónicos SRI.
//
// El SRI exige firma XAdES-BES "enveloped": <ds:Signature> va DENTRO del XML.
// Firma tres References:
//   1. SignedProperties (hora de firma + huella del certificado) — XAdES
//   2. KeyInfo (certificado y clave pública)
//   3. El documento completo (#comprobante), excluyendo la propia firma
// Algoritmos: RSA-SHA1, digest SHA1, canonicalización c14n 2001.
// SHA-1 es obligatorio: el validador del SRI rechaza SHA-256.
//
// Hora de firma: local Ecuador UTC-5 con sufijo 'Z' (replica el firmador oficial).
// Un offset -05:00 causa rechazo por "estructura de la firma".

import forge from 'node-forge';
import { readFileSync } from 'fs';
import path from 'path';

const XMLNS = 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:etsi="http://uri.etsi.org/01903/v1.3.2#"';

function sha1B64(input: string): string {
  const md = forge.md.sha1.create();
  md.update(input, 'utf8');
  return forge.util.encode64(md.digest().getBytes());
}

function wrap76(b64: string): string {
  return b64.match(/.{1,76}/g)?.join('\n') || b64;
}

function bigIntDecimal(hexSerial: string): string {
  return BigInt('0x' + hexSerial).toString(10);
}

function rand(max = 999000): number {
  return Math.floor(Math.random() * max) + 990;
}

function signingTimeEcuador(): string {
  const now = new Date(Date.now() - 5 * 3600 * 1000);
  return now.toISOString().slice(0, 19) + 'Z';
}

export interface P12Info {
  privateKey: forge.pki.rsa.PrivateKey;
  certDerB64: string;
  certHashB64: string;
  modulusB64: string;
  exponentB64: string;
  issuerName: string;
  serialDecimal: string;
}

export function extractP12Metadata(p12B64: string, password: string): {
  razon: string; expira: string; emisor: string;
} {
  const info = parseP12(p12B64, password);
  const cert = parseCertFromDerB64(info.certDerB64);
  const cn = cert.subject.getField('CN')?.value || cert.subject.getField('O')?.value || 'Desconocido';
  const expira = (cert.validity.notAfter as Date).toISOString().slice(0, 10);
  const emisor = cert.issuer.attributes.map((a: any) => `${a.shortName}=${a.value}`).join(', ');
  return { razon: cn, expira, emisor };
}

function parseCertFromDerB64(derB64: string): forge.pki.Certificate {
  const der = forge.util.decode64(derB64);
  return forge.pki.certificateFromAsn1(forge.asn1.fromDer(der));
}

function parseP12(p12B64: string, password: string): P12Info {
  const der = forge.util.decode64(p12B64);
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), password);
  return extractP12Info(p12);
}

export function loadP12FromBase64(p12B64: string, password: string): P12Info {
  if (!p12B64 || !password) {
    throw new Error('Esta empresa no tiene firma electrónica configurada.');
  }
  return parseP12(p12B64, password);
}

function extractP12Info(p12: forge.pkcs12.Pkcs12Pfx): P12Info {
  const keyBags = {
    ...p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag }),
    ...p12.getBags({ bagType: forge.pki.oids.keyBag }),
  } as any;
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ||
                 keyBags[forge.pki.oids.keyBag]?.[0];
  if (!keyBag?.key) throw new Error('No se encontró la clave privada en el .p12 (¿contraseña incorrecta?)');
  const privateKey = keyBag.key as forge.pki.rsa.PrivateKey;

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const certs = certBags.map((b: any) => b.cert).filter(Boolean);
  const cert = certs.find((c: any) => {
    const pub = c.publicKey as forge.pki.rsa.PublicKey;
    return pub?.n && (privateKey as any).n && pub.n.compareTo((privateKey as any).n) === 0;
  }) || certs[0];
  if (!cert) throw new Error('No se encontró certificado en el .p12');

  const certAsn1  = forge.pki.certificateToAsn1(cert);
  const certDer   = forge.asn1.toDer(certAsn1).getBytes();
  const certDerB64 = forge.util.encode64(certDer);

  const mdCert = forge.md.sha1.create();
  mdCert.update(certDer);
  const certHashB64 = forge.util.encode64(mdCert.digest().getBytes());

  const pub = cert.publicKey as forge.pki.rsa.PublicKey;
  let nHex = pub.n.toString(16);
  if (nHex.length % 2) nHex = '0' + nHex;
  const modulusB64 = forge.util.encode64(forge.util.hexToBytes(nHex));
  let eHex = pub.e.toString(16);
  if (eHex.length % 2) eHex = '0' + eHex;
  const exponentB64 = forge.util.encode64(forge.util.hexToBytes(eHex));

  const issuerName = cert.issuer.attributes
    .map((a: any) => `${a.shortName || a.name}=${a.value}`).join(',');

  return {
    privateKey, certDerB64, certHashB64, modulusB64, exponentB64,
    issuerName, serialDecimal: bigIntDecimal(cert.serialNumber),
  };
}

export function loadP12(): P12Info {
  const p12Path  = process.env.SRI_P12_PATH;
  const password = process.env.SRI_P12_PASSWORD;
  if (!p12Path || !password) {
    throw new Error('Configura SRI_P12_PATH y SRI_P12_PASSWORD en .env.local');
  }
  const der    = readFileSync(path.resolve(process.cwd(), p12Path), 'binary');
  const p12b64 = forge.util.encode64(der);
  return parseP12(p12b64, password);
}

export function signXml(
  unsignedXml: string,
  p12Override?: { p12B64: string; pwd: string },
): string {
  const p12 = p12Override ? loadP12FromBase64(p12Override.p12B64, p12Override.pwd) : loadP12();

  const sId = rand(), siId = rand(), spId = rand(), spRefId = rand();
  const cId = rand(), refId = rand(), objId = rand();

  const docCanonical = unsignedXml.replace(/<\?xml[^?]*\?>\s*/, '').trim();
  const docDigest    = sha1B64(docCanonical);

  const signedProperties =
    `<etsi:SignedProperties Id="Signature${sId}-SignedProperties${spId}">` +
    `<etsi:SignedSignatureProperties>` +
    `<etsi:SigningTime>${signingTimeEcuador()}</etsi:SigningTime>` +
    `<etsi:SigningCertificate><etsi:Cert>` +
    `<etsi:CertDigest>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>` +
    `<ds:DigestValue>${p12.certHashB64}</ds:DigestValue>` +
    `</etsi:CertDigest>` +
    `<etsi:IssuerSerial>` +
    `<ds:X509IssuerName>${p12.issuerName}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber>${p12.serialDecimal}</ds:X509SerialNumber>` +
    `</etsi:IssuerSerial>` +
    `</etsi:Cert></etsi:SigningCertificate>` +
    `</etsi:SignedSignatureProperties>` +
    `<etsi:SignedDataObjectProperties>` +
    `<etsi:DataObjectFormat ObjectReference="#Reference-ID-${refId}">` +
    `<etsi:Description>contenido comprobante</etsi:Description>` +
    `<etsi:MimeType>text/xml</etsi:MimeType>` +
    `</etsi:DataObjectFormat>` +
    `</etsi:SignedDataObjectProperties>` +
    `</etsi:SignedProperties>`;

  const spDigest = sha1B64(signedProperties.replace(
    '<etsi:SignedProperties ', `<etsi:SignedProperties ${XMLNS} `,
  ));

  const keyInfo =
`<ds:KeyInfo Id="Certificate${cId}">
<ds:X509Data>
<ds:X509Certificate>
${wrap76(p12.certDerB64)}
</ds:X509Certificate>
</ds:X509Data>
<ds:KeyValue>
<ds:RSAKeyValue>
<ds:Modulus>
${wrap76(p12.modulusB64)}
</ds:Modulus>
<ds:Exponent>${p12.exponentB64}</ds:Exponent>
</ds:RSAKeyValue>
</ds:KeyValue>
</ds:KeyInfo>`;

  const kiDigest = sha1B64(keyInfo.replace('<ds:KeyInfo ', `<ds:KeyInfo ${XMLNS} `));

  const signedInfo =
`<ds:SignedInfo Id="Signature-SignedInfo${siId}">
<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>
<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></ds:SignatureMethod>
<ds:Reference Id="SignedPropertiesID${spRefId}" Type="http://uri.etsi.org/01903#SignedProperties" URI="#Signature${sId}-SignedProperties${spId}">
<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>
<ds:DigestValue>${spDigest}</ds:DigestValue>
</ds:Reference>
<ds:Reference URI="#Certificate${cId}">
<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>
<ds:DigestValue>${kiDigest}</ds:DigestValue>
</ds:Reference>
<ds:Reference Id="Reference-ID-${refId}" URI="#comprobante">
<ds:Transforms>
<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform>
</ds:Transforms>
<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>
<ds:DigestValue>${docDigest}</ds:DigestValue>
</ds:Reference>
</ds:SignedInfo>`;

  const md = forge.md.sha1.create();
  md.update(signedInfo.replace('<ds:SignedInfo ', `<ds:SignedInfo ${XMLNS} `), 'utf8');
  const signatureB64 = forge.util.encode64(p12.privateKey.sign(md));

  const signature =
`<ds:Signature ${XMLNS} Id="Signature${sId}">
${signedInfo}
<ds:SignatureValue>
${wrap76(signatureB64)}
</ds:SignatureValue>
${keyInfo}
<ds:Object Id="Signature${sId}-Object${objId}"><etsi:QualifyingProperties Target="#Signature${sId}">${signedProperties}</etsi:QualifyingProperties></ds:Object></ds:Signature>`;

  const rootMatch = unsignedXml.match(/<\/(\w+)>\s*$/);
  if (!rootMatch) throw new Error('No se pudo identificar la etiqueta raíz del comprobante.');
  const closeTag = `</${rootMatch[1]}>`;
  const idx = unsignedXml.lastIndexOf(closeTag);
  return unsignedXml.slice(0, idx) + signature + unsignedXml.slice(idx);
}
```

---

## 8. Código fuente — `sri-soap.ts` (comunicación SOAP con el SRI)

```typescript
// src/lib/sri-soap.ts
// FASE 3 — Cliente SOAP del SRI (esquema offline).
//
// Flujo offline:
//   1. validarComprobante (RecepcionComprobantesOffline): XML en base64 → RECIBIDA | DEVUELTA
//   2. autorizacionComprobante (AutorizacionComprobantesOffline): clave de acceso → AUTORIZADO | NO AUTORIZADO | EN PROCESO

const HOSTS: Record<number, string> = {
  1: 'https://celcer.sri.gob.ec',  // PRUEBAS
  2: 'https://cel.sri.gob.ec',     // PRODUCCIÓN
};

function baseUrl(ambiente: number): string {
  const host = HOSTS[ambiente];
  if (!host) throw new Error(`Ambiente SRI inválido: ${ambiente} (use 1=pruebas o 2=producción)`);
  return `${host}/comprobantes-electronicos-ws`;
}

function extract(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : null;
}

function extractAll(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map(m => m[1].trim());
}

function parseMensajes(resp: string): string[] {
  const out: string[] = [];
  const ids    = extractAll(resp, 'identificador');
  const textos = [...resp.matchAll(/<mensaje>([^<]+)<\/mensaje>/g)].map(m => m[1].trim());
  const infos  = extractAll(resp, 'informacionAdicional');
  const tipos  = extractAll(resp, 'tipo');
  const n = Math.max(ids.length, textos.length);
  for (let i = 0; i < n; i++) {
    out.push(
      `[${ids[i] || '?'}${tipos[i] ? ' ' + tipos[i] : ''}] ${textos[i] || ''}` +
      `${infos[i] ? ' — ' + infos[i] : ''}`.trim()
    );
  }
  return out;
}

async function soapCall(url: string, body: string): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    body,
  });
  const text = await res.text();
  if (!res.ok && !text.includes('Envelope')) {
    throw new Error(`SRI respondió HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return text;
}

export interface RecepcionResult {
  estado: string;    // RECIBIDA | DEVUELTA
  mensajes: string[];
}

export async function enviarComprobante(signedXml: string, ambiente: number): Promise<RecepcionResult> {
  const xmlB64 = Buffer.from(signedXml, 'utf8').toString('base64');
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:validarComprobante>
      <xml>${xmlB64}</xml>
    </ec:validarComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;

  const resp   = await soapCall(`${baseUrl(ambiente)}/RecepcionComprobantesOffline`, envelope);
  const estado = extract(resp, 'estado') || 'SIN RESPUESTA';
  return { estado, mensajes: parseMensajes(resp) };
}

export interface AutorizacionResult {
  estado: string;
  numeroAutorizacion: string | null;
  fechaAutorizacion: string | null;
  comprobante: string | null;
  mensajes: string[];
}

export async function consultarAutorizacion(claveAcceso: string, ambiente: number): Promise<AutorizacionResult> {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:autorizacionComprobante>
      <claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante>
    </ec:autorizacionComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;

  const resp   = await soapCall(`${baseUrl(ambiente)}/AutorizacionComprobantesOffline`, envelope);
  const estado = extract(resp, 'estado') || 'EN PROCESO';

  let comprobante = extract(resp, 'comprobante');
  if (comprobante) {
    comprobante = comprobante
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
  }

  return {
    estado,
    numeroAutorizacion: extract(resp, 'numeroAutorizacion'),
    fechaAutorizacion:  extract(resp, 'fechaAutorizacion'),
    comprobante,
    mensajes: parseMensajes(resp),
  };
}
```

---

## 9. Código fuente — `sri-factura-db.ts` (conexión con la base de datos)

> ⚠️ **Esta es la única capa que hay que adaptar al migrar de plataforma.** Reemplaza `supabase.from(...)` con tu cliente de BD (Prisma, Drizzle, Sequelize, pg, etc.). La interfaz `FacturaInput` que construye **no cambia**.

```typescript
// src/lib/sri-factura-db.ts
// Conecta el generador puro con la base de datos.

import { supabase } from './supabase';
import { buildFacturaXml, type FacturaInput, type FacturaResult } from './sri-factura';
import type { RideFacturaInput } from './sri-ride';

export async function generateFacturaForSale(saleId: number): Promise<FacturaResult> {
  const { data: sale, error } = await supabase
    .from('sale_order')
    .select(
      'id, name, date_order, invoice_ref, invoice_auth, state, company_id, forma_pago,' +
      'partner:res_partner!sale_order_partner_id_fkey(id, name, vat, city),' +
      'lines:sale_order_line(' +
        'quantity, price_unit, iva_rate,' +
        'product:product_product(id, code, template:product_template(name))' +
      ')'
    )
    .eq('id', saleId)
    .single();
  if (error) throw error;
  const saleAny = sale as any;
  if (!saleAny) throw new Error('Venta no encontrada');
  if (saleAny.state === 'cancel') throw new Error('No se factura una venta anulada');

  const { data: company, error: cErr } = await supabase
    .from('res_company').select('*').eq('id', saleAny.company_id).single();
  if (cErr) throw cErr;
  if (!company?.vat || !/^\d{13}$/.test(company.vat)) {
    throw new Error(`El RUC (${company?.vat || 'vacío'}) debe tener 13 dígitos.`);
  }

  const refParts  = (saleAny.invoice_ref || '').split('-');
  const secuencial = refParts.length === 3 ? (parseInt(refParts[2]) || saleAny.id) : saleAny.id;

  const input: FacturaInput = {
    emisor: {
      ruc: company.vat,
      razonSocial: company.name,
      nombreComercial: company.name,
      dirMatriz: company.sri_dir_matriz || 'S/D',
      dirEstablecimiento: company.sri_dir_estab || null,
      estab: refParts[0] || company.sri_estab || '001',
      ptoEmi: refParts[1] || company.sri_pto_emi || '001',
      ambiente: company.sri_ambiente === 2 ? 2 : 1,
      obligadoContabilidad: company.sri_obligado_contab !== false,
      contribuyenteEspecial: company.sri_contrib_especial || null,
      agenteRetencion: company.sri_agente_retencion || null,
      contribuyenteRimpe: company.sri_rimpe || null,
    },
    comprador: {
      identificacion: saleAny.partner?.vat || '',
      razonSocial: saleAny.partner?.name || 'CONSUMIDOR FINAL',
      direccion: saleAny.partner?.city || null,
    },
    fechaEmision: saleAny.date_order,
    secuencial,
    lineas: (saleAny.lines || []).map((l: any) => ({
      codigo: l.product?.code || ('PROD-' + (l.product?.id || 0)),
      descripcion: l.product?.template?.name || 'Producto',
      cantidad: Number(l.quantity),
      precioUnitario: Number(l.price_unit),
      descuento: 0,
      ivaRate: Number(l.iva_rate),
    })),
    formaPago: saleAny.forma_pago || '01',
  };

  const result = buildFacturaXml(input);

  const updates: any = {};
  if (!saleAny.invoice_auth) updates.invoice_auth = result.claveAcceso;
  if (!saleAny.invoice_ref)  updates.invoice_ref  = result.numeroFactura;
  if (Object.keys(updates).length > 0) {
    await supabase.from('sale_order').update(updates).eq('id', saleId);
  }

  return result;
}

export interface SriSendResult {
  estado: string;
  numeroAutorizacion?: string | null;
  fechaAutorizacion?: string | null;
  mensajes: string[];
  ambiente: number;
  claveAcceso: string;
}

export async function sendSaleToSri(saleId: number): Promise<SriSendResult> {
  const factura = await generateFacturaForSale(saleId);

  const { data: sale }    = await supabase.from('sale_order').select('company_id').eq('id', saleId).single();
  const { data: company } = await supabase.from('res_company').select('sri_ambiente').eq('id', sale?.company_id).single();
  const ambiente = company?.sri_ambiente === 2 ? 2 : 1;

  const signRes  = await fetch('/api/sri/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xml: factura.xml }),
  });
  const signJson = await signRes.json();
  if (!signRes.ok) throw new Error('Firma: ' + (signJson.error || 'fallo'));

  const sendRes  = await fetch('/api/sri/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedXml: signJson.signedXml, claveAcceso: factura.claveAcceso, ambiente }),
  });
  const sendJson = await sendRes.json();
  if (!sendRes.ok) throw new Error('Envío: ' + (sendJson.error || 'fallo'));

  const updates: any = {
    sri_estado:   sendJson.estado || null,
    sri_ambiente: ambiente,
    sri_mensajes: (sendJson.mensajes || []).join('\n') || null,
  };
  if (sendJson.numeroAutorizacion) updates.sri_autorizacion = sendJson.numeroAutorizacion;
  if (sendJson.fechaAutorizacion) {
    const d = new Date(sendJson.fechaAutorizacion);
    if (!isNaN(d.getTime())) updates.sri_fecha_aut = d.toISOString();
  }
  await supabase.from('sale_order').update(updates).eq('id', saleId);

  return { ...sendJson, claveAcceso: factura.claveAcceso };
}

export function downloadFacturaXml(result: FacturaResult) {
  const blob = new Blob([result.xml], { type: 'application/xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'FAC_' + result.numeroFactura + '_' + result.claveAcceso.slice(0, 8) + '.xml';
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## 10. Código fuente — `sri-ride.ts` (RIDE PDF, navegador)

> Solo necesario si el nuevo software tiene interfaz web. Usa `canvas` del navegador para el código de barras; no funciona en Node.js puro.

```typescript
// src/lib/sri-ride.ts
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
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, clave, { format: 'CODE128', displayValue: false, height: 36, margin: 0, width: 1 });
  return canvas.toDataURL('image/png');
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
  try {
    doc.addImage(barcodeDataUrl(comp.claveAcceso), 'PNG', colDer, yd, anchoCol, 11);
  } catch { /* sin canvas (SSR) se omite */ }
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
  doc.text(input.formaPago, 14, y + 10);

  drawFooter(doc, input.comprobante);
  return doc;
}
```

---

## 11. Código fuente — API `/sri/sign`

```typescript
// src/app/api/sri/sign/route.ts  (Next.js App Router)
// POST — Recibe {xml, company_id?} → devuelve {signedXml}
// Reimplementar en Express: app.post('/sri/sign', handler)

import { NextResponse } from 'next/server';
import { signXml } from '@/lib/sri-firma';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { xml, company_id } = body as { xml: string; company_id?: number };

    if (!xml || typeof xml !== 'string') {
      return NextResponse.json({ error: 'Falta el XML a firmar' }, { status: 400 });
    }

    let p12Override: { p12B64: string; pwd: string } | undefined;

    if (company_id) {
      const { data, error } = await supabaseAdmin
        .from('res_company')
        .select('sri_p12_b64, sri_p12_pwd, name')
        .eq('id', company_id)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: `Empresa ID ${company_id} no encontrada` }, { status: 404 });
      }
      if (!data.sri_p12_b64 || !data.sri_p12_pwd) {
        return NextResponse.json({
          error: `La empresa "${data.name}" no tiene firma electrónica configurada.`,
        }, { status: 422 });
      }
      p12Override = { p12B64: data.sri_p12_b64, pwd: data.sri_p12_pwd };
    }

    const signedXml = signXml(xml, p12Override);
    return NextResponse.json({ signedXml });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error firmando' }, { status: 500 });
  }
}
```

---

## 12. Código fuente — API `/sri/send`

```typescript
// src/app/api/sri/send/route.ts  (Next.js App Router)
// POST — Recibe {signedXml, claveAcceso, ambiente} → devuelve estado y número de autorización.
// Ejecuta recepción + autorización con reintentos (5 intentos cada 2 s).

import { NextResponse } from 'next/server';
import { enviarComprobante, consultarAutorizacion } from '@/lib/sri-soap';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function POST(request: Request) {
  try {
    const { signedXml, claveAcceso, ambiente } = await request.json();
    if (!signedXml || !claveAcceso) {
      return NextResponse.json({ error: 'Faltan signedXml o claveAcceso' }, { status: 400 });
    }
    const amb = ambiente === 2 ? 2 : 1;  // por defecto SIEMPRE pruebas

    // 1. Recepción
    const recepcion = await enviarComprobante(signedXml, amb);
    if (recepcion.estado !== 'RECIBIDA') {
      return NextResponse.json({
        estado: recepcion.estado || 'DEVUELTA',
        mensajes: recepcion.mensajes,
        ambiente: amb,
      });
    }

    // 2. Autorización con reintentos
    let aut = null as Awaited<ReturnType<typeof consultarAutorizacion>> | null;
    for (let i = 0; i < 5; i++) {
      await sleep(2000);
      aut = await consultarAutorizacion(claveAcceso, amb);
      if (aut.estado === 'AUTORIZADO' || aut.estado === 'NO AUTORIZADO') break;
    }

    return NextResponse.json({
      estado:              aut?.estado || 'EN PROCESO',
      numeroAutorizacion:  aut?.numeroAutorizacion || null,
      fechaAutorizacion:   aut?.fechaAutorizacion  || null,
      mensajes:            [...recepcion.mensajes, ...(aut?.mensajes || [])],
      ambiente:            amb,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error enviando al SRI' }, { status: 500 });
  }
}
```

---

## 13. Código fuente — API `/sri/email`

```typescript
// src/app/api/sri/email/route.ts  (Next.js App Router)
// POST — Recibe {saleId, emailTo?} → envía el RIDE como HTML por SMTP al cliente.
// Las credenciales SMTP viven solo en variables de entorno del servidor.

import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// ── Plantilla HTML del RIDE (cabecera + detalle + totales) ────────────────────
function buildRideHtml(data: any): string {
  const f2 = (n: number) => `$ ${n.toFixed(2)}`;
  const ambLabel = data.ambiente === 2 ? 'PRODUCCIÓN' : 'PRUEBAS';
  const ambColor = data.ambiente === 2 ? '#166534' : '#854d0e';
  const ambBg    = data.ambiente === 2 ? '#dcfce7'  : '#fef9c3';

  const lineas = data.lineas.map((l: any) => `
    <tr>
      <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0">${l.codigo}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0">${l.descripcion}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;text-align:right">${l.cantidad.toFixed(2)}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;text-align:right">${l.precioUnitario.toFixed(4)}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;text-align:right">${l.descuento.toFixed(2)}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${l.subtotal.toFixed(2)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Comprobante</title></head>
<body style="margin:0;padding:16px;background:#f8fafc;font-family:Arial,sans-serif;font-size:13px;color:#1e293b">
<div style="max-width:700px;margin:0 auto;background:white;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
  <div style="display:flex;padding:16px;border-bottom:1px solid #e2e8f0;gap:16px">
    <div style="flex:1">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px">${data.razonSocial}</div>
      <div>RUC: <strong>${data.ruc}</strong></div>
      <div style="font-size:11px;color:#475569">${data.dirMatriz}</div>
      ${data.dirEstab && data.dirEstab !== data.dirMatriz ? `<div style="font-size:11px;color:#475569">Sucursal: ${data.dirEstab}</div>` : ''}
      <div style="font-size:11px">Obligado contabilidad: <strong>${data.obligadoContab ? 'SÍ' : 'NO'}</strong></div>
      ${data.rimpe ? `<div style="font-size:11px;color:#0369a1">${data.rimpe}</div>` : ''}
    </div>
    <div style="flex:1;border:1px solid #cbd5e1;border-radius:6px;padding:12px;background:#f8fafc">
      <div style="font-weight:700;font-size:13px">FACTURA</div>
      <div style="font-weight:600;margin:4px 0">Nº ${data.numeroFactura}</div>
      <div style="font-size:10px;color:#64748b">NÚMERO DE AUTORIZACIÓN:</div>
      <div style="font-size:9px;word-break:break-all;font-family:monospace">${data.claveAcceso}</div>
      <div style="margin-top:6px;font-size:11px">Fecha: <strong>${data.fechaEmision}</strong></div>
      <span style="font-size:11px;padding:2px 8px;border-radius:12px;font-weight:600;background:${ambBg};color:${ambColor}">${ambLabel}</span>
    </div>
  </div>
  <div style="padding:10px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc">
    <strong>Cliente:</strong> ${data.compradorNombre} &nbsp;|&nbsp;
    <strong>ID:</strong> ${data.compradorId}
    ${data.compradorDir ? ` &nbsp;|&nbsp; <strong>Dir:</strong> ${data.compradorDir}` : ''}
  </div>
  <div style="padding:0 16px">
    <table style="width:100%;border-collapse:collapse;margin:12px 0">
      <thead><tr style="background:#f1f5f9;font-size:11px;color:#475569">
        <th style="padding:6px;text-align:left">Código</th>
        <th style="padding:6px;text-align:left">Descripción</th>
        <th style="padding:6px;text-align:right">Cant.</th>
        <th style="padding:6px;text-align:right">P. Unit.</th>
        <th style="padding:6px;text-align:right">Dscto.</th>
        <th style="padding:6px;text-align:right">Subtotal</th>
      </tr></thead>
      <tbody>${lineas}</tbody>
    </table>
  </div>
  <div style="padding:8px 16px 16px;display:flex;justify-content:flex-end">
    <table style="border-collapse:collapse;min-width:280px">
      ${data.subtotal15 > 0 ? `<tr><td style="padding:3px 8px">Subtotal 15%</td><td style="padding:3px 8px;text-align:right;font-family:monospace">${f2(data.subtotal15)}</td></tr>` : ''}
      ${data.subtotal5  > 0 ? `<tr><td style="padding:3px 8px">Subtotal 5%</td><td style="padding:3px 8px;text-align:right;font-family:monospace">${f2(data.subtotal5)}</td></tr>` : ''}
      ${data.subtotal0  > 0 ? `<tr><td style="padding:3px 8px">Subtotal 0%</td><td style="padding:3px 8px;text-align:right;font-family:monospace">${f2(data.subtotal0)}</td></tr>` : ''}
      <tr><td style="padding:3px 8px">IVA</td><td style="padding:3px 8px;text-align:right;font-family:monospace">${f2(data.iva)}</td></tr>
      <tr style="background:#1e293b;color:white;font-weight:700">
        <td style="padding:5px 8px;border-radius:4px 0 0 4px">VALOR TOTAL</td>
        <td style="padding:5px 8px;text-align:right;font-family:monospace;border-radius:0 4px 4px 0">${f2(data.total)}</td>
      </tr>
    </table>
  </div>
  <div style="background:#f1f5f9;padding:10px 16px;font-size:10px;text-align:center;color:#64748b;border-top:1px solid #e2e8f0">
    ${data.ambiente === 1
      ? 'DOCUMENTO EMITIDO EN AMBIENTE DE PRUEBAS – SIN VALIDEZ TRIBUTARIA'
      : 'Comprobante electrónico autorizado por el SRI – Ecuador'}
  </div>
</div></body></html>`;
}

export async function POST(request: Request) {
  try {
    const { saleId, emailTo } = await request.json();
    if (!saleId) return NextResponse.json({ error: 'Falta saleId' }, { status: 400 });

    const { data: sale, error: sErr } = await supabase
      .from('sale_order')
      .select(`
        id, name, date_order, invoice_ref, invoice_auth, company_id,
        amount_untaxed, amount_tax, amount_total, sri_ambiente, sri_fecha_aut,
        partner:res_partner!sale_order_partner_id_fkey(id, name, vat, city, email),
        lines:sale_order_line(
          quantity, price_unit, iva_rate, price_subtotal,
          product:product_product(id, code, template:product_template(name))
        )
      `)
      .eq('id', saleId).single();
    if (sErr) throw sErr;

    const { data: company } = await supabase
      .from('res_company').select('*').eq('id', (sale as any).company_id).single();

    const destino = emailTo || (sale as any).partner?.email || '';
    if (!destino) {
      return NextResponse.json({ error: 'El cliente no tiene correo registrado.' }, { status: 422 });
    }

    let subtotal15 = 0, subtotal5 = 0, subtotal0 = 0;
    const lineas: any[] = [];
    for (const l of ((sale as any).lines || []) as any[]) {
      const sub  = Number(l.price_subtotal) || Number(l.quantity) * Number(l.price_unit);
      const rate = Number(l.iva_rate);
      if (rate >= 15) subtotal15 += sub; else if (rate === 5) subtotal5 += sub; else subtotal0 += sub;
      lineas.push({
        codigo: l.product?.code || `P${l.product?.id || 0}`,
        descripcion: l.product?.template?.name || 'Producto',
        cantidad: Number(l.quantity),
        precioUnitario: Number(l.price_unit),
        descuento: 0,
        subtotal: sub,
      });
    }

    const ambiente: 1 | 2 = (sale as any).sri_ambiente === 2 ? 2 : (company?.sri_ambiente === 2 ? 2 : 1);
    const [y, m, d]       = ((sale as any).date_order || '').slice(0, 10).split('-');
    const claveAcceso     = ((sale as any).invoice_auth || '').replace(/\D/g, '') || '0'.repeat(49);

    const html = buildRideHtml({
      razonSocial: company?.name || '', ruc: company?.vat || '',
      dirMatriz: company?.sri_dir_matriz || 'S/D', dirEstab: company?.sri_dir_estab || null,
      obligadoContab: company?.sri_obligado_contab !== false, rimpe: company?.sri_rimpe || null,
      numeroFactura: (sale as any).invoice_ref || (sale as any).name || '',
      claveAcceso: claveAcceso.padEnd(49, '0').slice(0, 49),
      fechaEmision: `${d || '01'}/${m || '01'}/${y || '2025'}`, ambiente,
      fechaAutorizacion: (sale as any).sri_fecha_aut
        ? new Date((sale as any).sri_fecha_aut).toLocaleDateString('es-EC') : null,
      compradorNombre: (sale as any).partner?.name || 'CONSUMIDOR FINAL',
      compradorId: (sale as any).partner?.vat || '', compradorDir: (sale as any).partner?.city || null,
      lineas,
      subtotal15: Math.round(subtotal15 * 100) / 100,
      subtotal5:  Math.round(subtotal5  * 100) / 100,
      subtotal0:  Math.round(subtotal0  * 100) / 100,
      iva: Number((sale as any).amount_tax) || 0,
      total: Number((sale as any).amount_total) || 0,
    });

    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return NextResponse.json({ error: 'SMTP no configurado en .env.local' }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const asunto = ambiente === 1
      ? `[PRUEBAS] Factura ${(sale as any).invoice_ref || ''} - ${company?.name}`
      : `Factura electrónica ${(sale as any).invoice_ref || ''} - ${company?.name}`;

    await transporter.sendMail({
      from:    process.env.SMTP_FROM || process.env.SMTP_USER,
      to:      destino,
      subject: asunto,
      html,
    });

    return NextResponse.json({ ok: true, sentTo: destino });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error enviando correo' }, { status: 500 });
  }
}
```

---

## 14. Catálogos SRI

### Tipos de identificación del comprador

| Código | Tipo | Cuándo usarlo |
|---|---|---|
| `04` | RUC | 13 dígitos numéricos |
| `05` | Cédula | 10 dígitos numéricos |
| `06` | Pasaporte | Cualquier otro formato (extranjeros) |
| `07` | Consumidor final | Sin identificación; se usa `9999999999999` |

### Códigos de IVA (`codigoPorcentaje`)

| Código | Tarifa | Cuándo aplica |
|---|---|---|
| `0` | 0% | Exentos de IVA |
| `2` | 12% | Histórica 2007–2024 |
| `3` | 14% | Transitoria 2016–2017 |
| `4` | 15% | Vigente desde mayo 2024 |
| `5` | 5% | Salud y educación básica |
| `6` | — | No objeto de IVA |
| `7` | — | Exento de IVA (canasta básica) |

### Formas de pago

| Código | Descripción |
|---|---|
| `01` | Sin utilización del sistema financiero (efectivo) |
| `15` | Compensación de deudas |
| `16` | Tarjeta de débito |
| `17` | Dinero electrónico |
| `18` | Tarjeta prepago |
| `19` | Tarjeta de crédito |
| `20` | Otros con utilización del sistema financiero |
| `21` | Endoso de títulos |

### Tipos de comprobante (`codDoc`)

| Código | Comprobante |
|---|---|
| `01` | Factura |
| `04` | Nota de Crédito |
| `05` | Nota de Débito |
| `06` | Guía de Remisión |
| `07` | Comprobante de Retención |

---

## 15. Estructura de la clave de acceso (49 dígitos)

```
Posición  Longitud  Campo
1-8       8         Fecha de emisión: DDMMAAAA
9-10      2         Tipo comprobante: 01=Factura, 07=Retención, etc.
11-23     13        RUC del emisor
24        1         Ambiente: 1=pruebas, 2=producción
25-27     3         Establecimiento (estab)
28-30     3         Punto de emisión (ptoEmi)
31-39     9         Secuencial (9 dígitos con ceros a la izquierda)
40-47     8         Código numérico (aleatorio, para unicidad adicional)
48        1         Tipo de emisión: siempre 1 (normal)
49        1         Dígito verificador (módulo 11)
```

### Algoritmo dígito verificador

```
1. Tomar los 48 dígitos (sin el verificador).
2. Recorrer de DERECHA a IZQUIERDA.
3. Pesos cíclicos: 2, 3, 4, 5, 6, 7, 2, 3, 4, 5, 6, 7 ...
4. Sumar cada dígito × su peso.
5. dv = 11 - (suma % 11)
6. Si dv == 11 → dv = 0
7. Si dv == 10 → dv = 1
```

> ⚠️ **Los tres deben ser idénticos:** dígito 24 de la clave, campo `<ambiente>` del XML, y la URL SOAP. Si no coinciden → error "El ambiente no corresponde".

---

## 16. Guía de implementación paso a paso

### Paso 1 — Instalar dependencias

```bash
npm install node-forge jspdf jsbarcode nodemailer
npm install --save-dev @types/node-forge @types/nodemailer
```

### Paso 2 — Aplicar el esquema SQL

```bash
psql -d tu_base_de_datos -f sql/schema_sri_facturacion.sql
```

### Paso 3 — Configurar variables de entorno

Copiar la sección [5. Variables de entorno](#5-variables-de-entorno) a tu `.env.local`.

### Paso 4 — Copiar los archivos de lógica pura

Copiar **sin modificar** a tu proyecto:
- `sri-factura.ts`
- `sri-firma.ts`
- `sri-soap.ts`

### Paso 5 — Adaptar `sri-factura-db.ts`

Reemplazar las llamadas a `supabase.from(...)` con tu cliente de BD. La interfaz `FacturaInput` que construye **no cambia**. El mapa de campos es:

```
sale_order.id                          → secuencial (si no hay invoice_ref)
sale_order.date_order                  → fechaEmision
sale_order.forma_pago                  → formaPago
res_partner.vat                        → comprador.identificacion
res_partner.name                       → comprador.razonSocial
res_partner.city                       → comprador.direccion
res_company.vat                        → emisor.ruc
res_company.name                       → emisor.razonSocial
res_company.sri_dir_matriz             → emisor.dirMatriz
res_company.sri_estab                  → emisor.estab
res_company.sri_pto_emi                → emisor.ptoEmi
res_company.sri_ambiente               → emisor.ambiente
res_company.sri_obligado_contab        → emisor.obligadoContabilidad
res_company.sri_rimpe                  → emisor.contribuyenteRimpe
res_company.sri_agente_retencion       → emisor.agenteRetencion
res_company.sri_contrib_especial       → emisor.contribuyenteEspecial
sale_order_line.quantity               → lineas[i].cantidad
sale_order_line.price_unit             → lineas[i].precioUnitario
sale_order_line.iva_rate               → lineas[i].ivaRate
product_product.code                   → lineas[i].codigo
product_template.name                  → lineas[i].descripcion
```

### Paso 6 — Implementar los tres endpoints

Si tu servidor no es Next.js, la misma lógica en Express sería:

```typescript
// Express equivalente de /api/sri/sign
app.post('/sri/sign', async (req, res) => {
  const { xml, company_id } = req.body;
  // cargar p12 desde BD o .env según company_id
  const signedXml = signXml(xml, p12Override);
  res.json({ signedXml });
});

// Express equivalente de /api/sri/send
app.post('/sri/send', async (req, res) => {
  const { signedXml, claveAcceso, ambiente } = req.body;
  const recepcion = await enviarComprobante(signedXml, ambiente);
  if (recepcion.estado !== 'RECIBIDA') { res.json(recepcion); return; }
  let aut = null;
  for (let i = 0; i < 5; i++) {
    await sleep(2000);
    aut = await consultarAutorizacion(claveAcceso, ambiente);
    if (aut.estado === 'AUTORIZADO' || aut.estado === 'NO AUTORIZADO') break;
  }
  res.json({ estado: aut?.estado, numeroAutorizacion: aut?.numeroAutorizacion, ... });
});
```

### Paso 7 — Obtener y cargar el certificado .p12

El certificado de firma electrónica se obtiene en:
- **Banco Central del Ecuador (BCE):** bce.fin.ec
- **Security Data:** securitydata.net.ec
- **ANF Ecuador:** anfac.com

Para cargarlo a la BD (columna `sri_p12_b64`):

```typescript
import fs from 'fs';
const p12Bytes = fs.readFileSync('./mi-firma.p12');
const p12B64   = p12Bytes.toString('base64');
// Guardar p12B64 en res_company.sri_p12_b64 y la contraseña en sri_p12_pwd
```

### Paso 8 — Probar en ambiente 1 (PRUEBAS)

1. Verificar `sri_ambiente = 1` en `res_company`.
2. Emitir una factura de prueba y verificar que `sri_estado = 'AUTORIZADO'`.
3. Descargar el XML autorizado y validarlo en el portal del SRI.
4. Solo cambiar a `sri_ambiente = 2` después de que el SRI autorice tu certificado de producción.

> ⚠️ **Nunca usar `sri_ambiente = 2` con un certificado de pruebas.** Genera comprobantes reales con datos incorrectos.

---

## 17. Errores frecuentes del SRI

| Error | Causa | Solución |
|---|---|---|
| `DEVUELTA` — "El ambiente no corresponde" | Dígito 24 ≠ URL SOAP o campo `<ambiente>` | Verificar que los tres usan el mismo valor (1 o 2) |
| `DEVUELTA` — "La clave de acceso ya existe" | Secuencial repetido | Revisar `sri_document_sequence.next_number` |
| `DEVUELTA` — "Estructura del comprobante" | XML no cumple el XSD | Revisar orden de elementos y campos obligatorios vacíos |
| `DEVUELTA` — "Firma no válida" | Hora con offset `-05:00` en lugar de `Z`, o SHA-256 en lugar de SHA-1 | Verificar `signingTimeEcuador()` y algoritmos en `sri-firma.ts` |
| `NO AUTORIZADO` — "RUC no válido" | RUC sin 13 dígitos o no activo en el SRI | Verificar `res_company.vat` |
| `NO AUTORIZADO` — "Certificado vencido" | El .p12 expiró | Renovar certificado y actualizar `sri_p12_b64` |
| `EN PROCESO` persistente | Alta carga del SRI | Guardar el XML firmado y consultar `AutorizacionComprobantesOffline` con la misma clave de acceso más tarde |
| HTTP 500 del SRI | Web service caído | Guardar el XML firmado y reenviar. **No regenerar** el XML (cambiaría la clave de acceso) |

---

## 18. Qué adaptar al migrar a otro software

| Qué | Necesita cambio | Cómo |
|---|---|---|
| `sri-factura.ts` | ❌ No | Copiar tal cual |
| `sri-firma.ts` | ❌ No | Copiar tal cual |
| `sri-soap.ts` | ❌ No | Copiar tal cual |
| `sri-ride.ts` | Solo si cambias el generador de PDF | Reemplazar jsPDF por ReportLab (Python), FPDF (PHP), etc. La estructura del RIDE no cambia. |
| `sri-factura-db.ts` | ✅ Sí (capa de datos) | Reemplazar `supabase.from(...)` con tu ORM/cliente. El mapa de campos está en el Paso 5. |
| Endpoints API | ✅ Sí (capa HTTP) | Reimplementar en tu framework (Express, FastAPI, Laravel…). La lógica interna es la misma. |
| Schema SQL | ⚠️ Adaptar nombres si tu ORM usa convenciones distintas | Las columnas y la tabla `sri_document_sequence` son obligatorias; los nombres de las tablas base pueden variar. |
| Variables de entorno | ✅ Sí | Adaptar al sistema de configuración de tu plataforma. |

### Equivalentes en otros lenguajes

| Función | Python | PHP |
|---|---|---|
| `buildFacturaXml()` | `lxml` o `xml.etree` + f-strings | `DOMDocument` |
| `digitoVerificadorMod11()` | Aritmética pura | Aritmética pura |
| `signXml()` — XAdES-BES | `lxml-xmlsec` + `cryptography` | `RobRichards/xmlseclibs` |
| SOAP | `zeep` o `urllib3` | `SoapClient` nativo |
| PDF RIDE | `ReportLab` o `fpdf2` | `FPDF` o `DOMPDF` |

---

*Documento generado desde el proyecto ERP Ecuador. Versión 1.0 — Junio 2026.*
