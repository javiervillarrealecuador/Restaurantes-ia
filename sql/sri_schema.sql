-- =============================================================================
-- SCHEMA SRI — FACTURACIÓN ELECTRÓNICA ECUADOR (RESTAURANTE SAAS)
-- PostgreSQL >= 13. Aplica sobre restaurants, branches, orders, order_items, menu_items, customers.
-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql/new)
-- =============================================================================

SET search_path TO public;

-- ── 1. RESTAURANTS — Configuración del emisor electrónico e IVA ──────────────
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS ruc                    VARCHAR(13),
  ADD COLUMN IF NOT EXISTS sri_dir_matriz         VARCHAR(300) DEFAULT 'S/D',
  ADD COLUMN IF NOT EXISTS sri_dir_estab          VARCHAR(300),
  ADD COLUMN IF NOT EXISTS sri_estab              VARCHAR(3)   DEFAULT '001',
  ADD COLUMN IF NOT EXISTS sri_pto_emi            VARCHAR(3)   DEFAULT '001',
  ADD COLUMN IF NOT EXISTS sri_obligado_contab    BOOLEAN      DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sri_rimpe              VARCHAR(80), -- 'CONTRIBUYENTE RÉGIMEN RIMPE EMPRENDEDOR' o 'CONTRIBUYENTE NEGOCIO POPULAR - RÉGIMEN RIMPE'
  ADD COLUMN IF NOT EXISTS sri_agente_retencion   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS sri_contrib_especial   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS sri_ambiente           SMALLINT     DEFAULT 1, -- 1 = pruebas | 2 = producción
  ADD COLUMN IF NOT EXISTS sri_p12_b64            TEXT,
  ADD COLUMN IF NOT EXISTS sri_p12_pwd            TEXT,
  ADD COLUMN IF NOT EXISTS sri_firma_expira       DATE,
  ADD COLUMN IF NOT EXISTS sri_firma_razon        TEXT,
  ADD COLUMN IF NOT EXISTS sri_logo_b64           TEXT,
  ADD COLUMN IF NOT EXISTS sri_email_envio        TEXT,
  -- Configuración de IVA flexible
  ADD COLUMN IF NOT EXISTS sri_iva_rate           NUMERIC(5,2) DEFAULT 15.00,
  ADD COLUMN IF NOT EXISTS sri_iva_temporal       NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS sri_iva_temporal_inicio DATE,
  ADD COLUMN IF NOT EXISTS sri_iva_temporal_fin    DATE;

-- ── 2. BRANCHES — Códigos de sucursal independientes (Establecimiento y Punto de Emisión) ─────
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS sri_estab              VARCHAR(3), -- NULL = hereda del principal
  ADD COLUMN IF NOT EXISTS sri_pto_emi            VARCHAR(3); -- NULL = hereda del principal

-- ── 3. CUSTOMERS — Datos de facturación guardados en el perfil CRM ──────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS vat                    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS billing_name           VARCHAR(150),
  ADD COLUMN IF NOT EXISTS email                  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address                TEXT;

-- ── 4. ORDERS — Estado de comprobante y datos del comprador ────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_ref            VARCHAR(20),   -- 001-001-000000001
  ADD COLUMN IF NOT EXISTS invoice_auth           VARCHAR(49),   -- clave de acceso
  ADD COLUMN IF NOT EXISTS sri_estado             VARCHAR(20),   -- NULL -> RECIBIDA -> AUTORIZADO / DEVUELTA
  ADD COLUMN IF NOT EXISTS sri_autorizacion       VARCHAR(49),
  ADD COLUMN IF NOT EXISTS sri_fecha_aut          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sri_ambiente           SMALLINT,
  ADD COLUMN IF NOT EXISTS sri_mensajes           TEXT,
  ADD COLUMN IF NOT EXISTS forma_pago             VARCHAR(2)   NOT NULL DEFAULT '01',
  -- Datos de facturación del comprador (capturados por robot o caja)
  ADD COLUMN IF NOT EXISTS sri_requiere_factura   BOOLEAN      DEFAULT FALSE NOT NULL,
  ADD COLUMN IF NOT EXISTS billing_vat            VARCHAR(20),
  ADD COLUMN IF NOT EXISTS billing_name           VARCHAR(150),
  ADD COLUMN IF NOT EXISTS billing_email          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS billing_address        TEXT;

-- ── 5. ORDER ITEMS — IVA aplicado al ítem de venta ──────────────────────────────
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS iva_rate               NUMERIC(5,2) DEFAULT 15.00;

-- ── 6. MENU ITEMS — Código de plato para identificación en factura ──────────────
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS code                   VARCHAR(50);

-- ── 7. SECUENCIAL DE DOCUMENTOS — Control atómico ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.sri_document_sequence (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    doc_type      VARCHAR(20) NOT NULL, -- 'factura' | 'nota_credito' | 'nota_debito' | 'guia_remision' | 'retencion'
    estab         VARCHAR(3)  NOT NULL DEFAULT '001',
    pto_emi       VARCHAR(3)  NOT NULL DEFAULT '001',
    next_number   INTEGER     NOT NULL DEFAULT 1,
    CONSTRAINT sri_doc_seq_unique UNIQUE (restaurant_id, doc_type, estab, pto_emi)
);

CREATE INDEX IF NOT EXISTS idx_sri_doc_seq_restaurant
    ON public.sri_document_sequence (restaurant_id, doc_type);

-- Función PostgreSQL: obtiene y avanza el secuencial de forma atómica
CREATE OR REPLACE FUNCTION public.sri_next_secuencial(
    p_restaurant_id UUID, p_doc_type VARCHAR,
    p_estab VARCHAR DEFAULT '001', p_pto_emi VARCHAR DEFAULT '001'
) RETURNS INTEGER AS $$
DECLARE v_next INTEGER;
BEGIN
    UPDATE public.sri_document_sequence
    SET next_number = next_number + 1
    WHERE restaurant_id = p_restaurant_id AND doc_type = p_doc_type
      AND estab = p_estab AND pto_emi = p_pto_emi
    RETURNING next_number - 1 INTO v_next;

    IF v_next IS NULL THEN
        INSERT INTO public.sri_document_sequence
            (restaurant_id, doc_type, estab, pto_emi, next_number)
        VALUES (p_restaurant_id, p_doc_type, p_estab, p_pto_emi, 2)
        ON CONFLICT (restaurant_id, doc_type, estab, pto_emi)
        DO UPDATE SET next_number = sri_document_sequence.next_number + 1
        RETURNING next_number - 1 INTO v_next;
    END IF;
    RETURN v_next;
END;
$$ LANGUAGE plpgsql;
