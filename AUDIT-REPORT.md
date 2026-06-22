# Audit Report: app-restaurante

**Fecha:** 22 de junio de 2026  
**Stack:** Next.js 14.2.35 + Supabase + Vercel  
**Router:** App Router  
**Puntuación:** 34/100

---

## Resumen Ejecutivo

La aplicación tiene una arquitectura funcional correctamente separada entre cliente y servidor, con uso apropiado de `supabaseAdmin` en rutas API. Sin embargo, presenta **vulnerabilidades críticas de seguridad** que deben corregirse antes de operar en producción con datos tributarios reales. Los problemas más graves son: cinco rutas de la API de facturación electrónica sin ningún control de autenticación (incluyendo la ruta que genera y envía facturas firmadas al SRI), almacenamiento de claves privadas de firma digital en texto plano en la base de datos, ausencia total de rate limiting, y políticas RLS de "demo" que exponen datos de clientes a cualquier visitante anónimo. La puntuación de 34/100 indica que la aplicación **no está lista para producción** en su estado actual.

---

## Puntuación por Categoría

| Categoría       | Puntuación | Críticos | Mayores | Menores |
|-----------------|------------|----------|---------|---------|
| Seguridad       | 0/25       | 7        | 5       | 2       |
| Base de Datos   | 2/25       | 2        | 4       | 1       |
| Performance     | 14/25      | 0        | 3       | 2       |
| Escalabilidad   | 18/25      | 0        | 2       | 1       |
| **TOTAL**       | **34/100** | **9**    | **14**  | **6**   |

---

## Hallazgos Críticos (corregir de inmediato)

### SEC-CRIT-1: `/api/sri/invoice` sin autenticación
**El endpoint que genera facturas electrónicas firmadas no verifica quién lo llama.** Cualquier persona en internet que conozca un `orderId` (UUID) puede:
- Generar un XML firmado con la firma digital del restaurante y enviarlo al SRI
- Disparar el envío de correos electrónicos desde el SMTP del restaurante
- Modificar datos de facturación de cualquier pedido en la base de datos
- Consumir el secuencial de facturas del restaurante

Esto representa un riesgo tributario directo: un tercero puede emitir facturas electrónicas legítimas en nombre del restaurante sin su consentimiento.

**Archivo:** `src/app/api/sri/invoice/route.ts` — función `POST` completa, línea 1 en adelante.

**Corrección:**
```typescript
// Agregar al inicio de la función POST:
const authHeader = request.headers.get('Authorization');
if (!authHeader?.startsWith('Bearer ')) {
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
}
const token = authHeader.slice(7);
const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
if (authErr || !user) {
  return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
}
// Luego verificar que el user es staff del restaurante del pedido
```

---

### SEC-CRIT-2: `/api/sri/test-smtp` — relay de correo abierto, sin autenticación y sin eliminar
Este endpoint fue marcado con el comentario `// ELIMINAR después de verificar` pero permanece activo. Acepta host, puerto, usuario y contraseña SMTP como **parámetros GET en la URL** (quedan en logs de servidor, historial del navegador y logs de Vercel), y envía un correo real desde cualquier servidor SMTP que el atacante proporcione.

Un atacante puede usarlo como proxy para enviar spam desde servidores SMTP ajenos, o para probar credenciales robadas de cuentas de correo.

**Archivo:** `src/app/api/sri/test-smtp/route.ts`

**Corrección:** Eliminar el archivo completamente. Si se necesita diagnóstico SMTP, hacerlo localmente con un script separado que nunca se suba al repositorio.

---

### SEC-CRIT-3: `/api/sri/metadata` y `/api/sri/test-connection` sin autenticación
`/api/sri/metadata` acepta cualquier archivo `.p12` en base64 más su contraseña, y devuelve los metadatos del certificado. Sin autenticación, cualquiera puede usarlo para extraer información de certificados digitales arbitrarios.

`/api/sri/test-connection` acepta un `.p12` + contraseña + ambiente, valida el certificado localmente con `node-forge`, y realiza llamadas reales a los servidores del SRI (`cel.sri.gob.ec`, `celcer.sri.gob.ec`). Sin autenticación, cualquiera puede hacer llamadas a los servidores del SRI usando el servidor de la aplicación como proxy, potencialmente agotando cuotas de conexión o generando bloqueos de IP.

**Corrección:** Agregar verificación de sesión igual que en `upload-p12/route.ts`.

---

### SEC-CRIT-4: `/api/sri/next-seq` sin autenticación
Expone el número secuencial actual de facturas de cualquier restaurante. Permite a un atacante conocer el volumen de facturación de cada cliente del SaaS.

**Corrección:** Agregar verificación Bearer token + membership check.

---

### SEC-CRIT-5: Sin middleware de autenticación
No existe ningún archivo `middleware.ts`. Esto significa que **no hay protección de rutas a nivel de infraestructura**. Toda la seguridad depende de que cada handler individual recuerde implementar su propia verificación. Los hallazgos SEC-CRIT-1 al SEC-CRIT-4 son la consecuencia directa de esto.

**Corrección:** Crear `src/middleware.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/update-password', '/api/webhook/whatsapp'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/sri/:path*', '/api/admin/:path*', '/api/saas/:path*', '/api/activity', '/api/orders/:path*'],
};
```

---

### SEC-CRIT-6: Sin rate limiting en ningún endpoint
No existe ningún paquete ni lógica de rate limiting. Los endpoints de autenticación (login, signup, password reset), los endpoints de email SMTP, las llamadas al SRI y las operaciones de facturación no tienen ninguna protección contra uso abusivo.

Consecuencias concretas:
- Un atacante puede intentar millones de combinaciones de contraseña contra cualquier cuenta (brute force).
- Puede generar miles de emails desde el servidor (si no se corrige SEC-CRIT-1/2).
- Puede consumir toda la cuota de facturas secuenciales del restaurante.

**Corrección:** Instalar `@upstash/ratelimit` + `@upstash/redis` y aplicar límites en middleware:
```typescript
// Límites recomendados:
// Login: 10 intentos / 15 minutos por IP
// Signup: 5 por hora por IP
// /api/sri/invoice: 100 por hora por restaurante
// /api/sri/test-smtp: eliminar (ver SEC-CRIT-2)
```

---

### SEC-CRIT-7: Clave privada de firma digital (.p12) almacenada en texto plano
La columna `sri_p12_b64` en la tabla `restaurants` guarda el certificado digital de firma electrónica (que incluye la clave privada RSA del emisor) como texto base64 sin cifrar. La columna `sri_p12_pwd` guarda la contraseña del certificado en texto plano.

**Esto es el equivalente digital de guardar tu cédula de identidad y tu PIN bancario en una hoja pegada en la vitrina del restaurante.** Cualquier brecha en la base de datos (backup filtrado, empleado malicioso con acceso, query SQL no autorizada) compromete la firma digital de forma permanente — no se puede "cambiar la contraseña" de un certificado robado, hay que revocar el certificado y obtener uno nuevo.

**Corrección:**
```sql
-- Usar pgcrypto para cifrar antes de guardar:
UPDATE restaurants SET 
  sri_p12_b64 = pgp_sym_encrypt(sri_p12_b64, 'ENCRYPTION_KEY_FROM_ENV'),
  sri_p12_pwd = pgp_sym_encrypt(sri_p12_pwd, 'ENCRYPTION_KEY_FROM_ENV');
```
En la aplicación, descifrar solo en el momento de firmar, en memoria, nunca guardar el valor descifrado en la BD.

---

### DB-CRIT-1: Credenciales SMTP y API keys en texto plano
La tabla `restaurants` almacena `smtp_pass` (contraseña del servidor de correo de cada restaurante) en texto plano. La tabla `settings` almacena `gemini_api_key` y `whatsapp_access_token` también en texto plano. Cualquier usuario autenticado con acceso a la tabla `settings` vía el cliente anon puede leer estas credenciales.

**Corrección:** Misma estrategia que SEC-CRIT-7: cifrar con `pgp_sym_encrypt` usando una clave maestra guardada en variable de entorno del servidor.

---

## Hallazgos Mayores (corregir pronto)

### SEC-MAY-1: Políticas RLS de "demo" exponen datos de todos los clientes
Las siguientes políticas tienen `USING (true)`, lo que significa que **cualquier visitante anónimo puede leer estos datos sin autenticarse**:

```sql
-- En schema.sql:
CREATE POLICY "Public select orders for demo" ON orders
    FOR SELECT USING (true);  -- TODOS los pedidos visibles para todos

CREATE POLICY "Public select order items for demo" ON order_items
    FOR SELECT USING (true);  -- TODOS los ítems visibles

CREATE POLICY "Public select logs for demo" ON whatsapp_webhook_logs
    FOR SELECT USING (true);  -- Logs de WhatsApp con raw_payload (datos personales)
```

Los logs de WhatsApp contienen el número de teléfono del cliente, el contenido de sus mensajes y el `raw_payload` completo de la API de Meta. Esto es una violación de la Ley Orgánica de Protección de Datos Personales del Ecuador (LOPDP).

**Corrección:** Eliminar las tres políticas "demo" y reemplazarlas con políticas que requieran `is_restaurant_staff(restaurant_id)`.

---

### SEC-MAY-2: Tabla `customers` — política RLS permite a cualquiera modificar cualquier cliente
```sql
CREATE POLICY "System can create and update customers" ON customers
    FOR ALL USING (true) WITH CHECK (true);
```
Cualquier usuario anónimo puede INSERTAR, ACTUALIZAR o ELIMINAR registros de clientes de cualquier restaurante. Esto incluye datos de facturación (RUC, nombre, dirección).

**Corrección:**
```sql
DROP POLICY "System can create and update customers" ON customers;
-- Solo el webhook (vía service_role en API) puede crear clientes:
-- Las inserciones del webhook ya pasan por supabaseAdmin (bypassa RLS), no necesitan política pública.
CREATE POLICY "Staff can manage customers" ON customers
    FOR ALL USING (is_restaurant_staff(restaurant_id));
```

---

### SEC-MAY-3: Signup permite auto-asignarse cualquier rol incluyendo `admin_general`
En `AuthContext.tsx`, la función `signUp` usa el cliente anon (ejecutado en el navegador) para insertar directamente en `restaurant_staff`:
```typescript
const { error: staffErr } = await supabase.from('restaurant_staff').insert({
  restaurant_id: restId,
  profile_id: data.user.id,
  role: targetRole,  // ← el usuario envía el rol que quiere
});
```
Si la política RLS de `restaurant_staff` permite INSERT sin restricción de rol, cualquier usuario puede registrarse como `admin_general`.

**Corrección:** Mover el registro de staff a una API route server-side, y en esa ruta ignorar el rol enviado por el cliente (asignar siempre el rol mínimo por defecto, o validar contra una lista de roles permitidos en auto-registro).

---

### SEC-MAY-4: Sin headers de seguridad HTTP
`next.config.mjs` no define headers de seguridad. `vercel.json` solo tiene `{ "framework": "nextjs" }`. Faltan todos los headers estándar:

| Header | Impacto si falta |
|---|---|
| `X-Frame-Options: DENY` | La app puede ser embebida en iframes de terceros (clickjacking) |
| `X-Content-Type-Options: nosniff` | El navegador puede malinterpretar el tipo de archivo |
| `Strict-Transport-Security` | Sin HTTPS forzado en el lado del servidor |
| `Content-Security-Policy` | Sin protección contra XSS |
| `Referrer-Policy` | URLs internas filtradas a terceros |

**Corrección:** Agregar en `next.config.mjs`:
```javascript
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ],
  }];
}
```

---

### SEC-MAY-5: URLs y anon key de Supabase hardcodeadas en el código fuente
```typescript
// src/lib/supabase.ts
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://firophcgqwhmhztgcxqi.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_...';
```
Si las variables de entorno no están configuradas (error de deploy, nueva máquina, CI/CD), la app usa valores reales de producción hardcodeados. Además, estos valores quedan en el historial de git para siempre.

**Corrección:** Eliminar los fallbacks. Si la variable no está, lanzar error explícito en lugar de usar un valor hardcodeado.

---

### DB-MAY-1: Tabla `whatsapp_webhook_logs` crece sin límite con payloads completos
Cada mensaje de WhatsApp recibido genera un registro con `raw_payload JSONB NOT NULL` que contiene el payload completo de la API de Meta. Con uso real (cientos de mensajes diarios), esta tabla puede crecer a gigabytes en meses, sin ningún mecanismo de limpieza.

**Corrección:**
```sql
-- Política de retención: eliminar logs de más de 90 días
CREATE OR REPLACE FUNCTION cleanup_old_webhook_logs() RETURNS void AS $$
BEGIN
  DELETE FROM whatsapp_webhook_logs WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;
```
Invocar via cron en Supabase Edge Functions o Vercel Cron.

---

### DB-MAY-2: `activity_logs` crece sin límite
Referenciada en el código pero sin archivo de schema visible. Si existe en producción, aplica el mismo problema que DB-MAY-1. Implementar retención de 90-180 días.

---

### DB-MAY-3: Credenciales de API guardadas en tabla `settings` accesible vía anon key
La tabla `settings` contiene `gemini_api_key`, `whatsapp_access_token` y `whatsapp_verify_token`. La política RLS permite que cualquier staff member autenticado las lea vía el cliente anon (que usa la `ANON_KEY` pública). Estas credenciales deberían estar solo en variables de entorno del servidor, nunca en la base de datos.

---

### DB-MAY-4: `customers` — datos modificables por webhook sin restricción de tenant
La política `FOR ALL USING (true)` también permite que el webhook de WhatsApp de un restaurante modifique clientes de otro restaurante (si hay un bug en el webhook). La restricción de tenant debe ser garantizada por RLS, no solo por la lógica de la aplicación.

---

### PERF-MAY-1: Todos los datos se cargan en el cliente vía `useEffect` (48 ocurrencias)
La aplicación no usa Server Components para fetching de datos. Cada componente (`Dashboard`, `MenuPanel`, `TakeOrderPanel`, `ReportsPanel`) hace sus propias consultas a Supabase desde el navegador después de que el componente monta. Esto significa:
- El usuario ve una pantalla en blanco o un spinner hasta que todas las consultas terminan
- Cada usuario genera múltiples round-trips al servidor de base de datos
- No hay ninguna forma de hacer caching de estas respuestas

**Corrección a largo plazo:** Migrar la carga inicial de datos a Server Components o Route Handlers con `unstable_cache`.

---

### PERF-MAY-2: `select('*')` en tablas con campos grandes (más de 25 ocurrencias)
La tabla `restaurants` contiene `sri_p12_b64` (el certificado completo en base64, típicamente 4-8 KB), `sri_logo_b64`, y campos de SMTP. Cuando un componente hace `.from('restaurants').select('*')`, trae todos estos campos aunque solo necesite el nombre del restaurante.

Ejemplo en `Dashboard.tsx` línea 338: `select('*')` en la tabla de pedidos, que incluye `sri_mensajes` (respuesta XML del SRI), `billing_*` y otros campos pesados.

**Corrección:** Especificar solo las columnas necesarias en cada query: `.select('id, name, ruc, sri_ambiente')` en lugar de `select('*')`.

---

### PERF-MAY-3: Sin paginación en listas de pedidos ni reportes
`ReportsPanel.tsx` carga todos los pedidos del restaurante con `select('*')` sin `.range()` ni `.limit()`. Con 10.000 pedidos en la base de datos, esta query devolverá 10.000 filas completas a la memoria del servidor y luego al navegador del usuario.

**Corrección:** Implementar paginación con cursor o offset-limit:
```typescript
const PAGE_SIZE = 50;
const { data } = await supabase
  .from('orders')
  .select('id, order_code, status, total_price, created_at')
  .eq('restaurant_id', restaurantId)
  .order('created_at', { ascending: false })
  .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
```

---

### ESCAL-MAY-1: Sin estrategia de retención de datos para tablas de log
Las tablas `whatsapp_webhook_logs`, `activity_logs` y `admin_alerts` no tienen ninguna política de limpieza. A medida que el SaaS crezca, estas tablas dominarán el costo de almacenamiento de Supabase.

---

### ESCAL-MAY-2: Vista `restaurant_billing_stats` no filtra por período
```sql
CREATE OR REPLACE VIEW restaurant_billing_stats AS
SELECT restaurant_id, COUNT(*) AS total_orders, ...
FROM orders GROUP BY restaurant_id;
```
Esta vista agrega **todos los pedidos históricos** sin filtro de fecha. Con el tiempo, cada consulta a esta vista escanea la tabla completa de pedidos de todos los restaurantes.

**Corrección:** Particionar `orders` por `created_at` (particionamiento mensual) o agregar un índice en `created_at` y filtrar en la vista por período activo.

---

## Hallazgos Menores

### SEC-MIN-1: TypeScript y ESLint silenciados en el build
```javascript
// next.config.mjs
eslint: { ignoreDuringBuilds: true },
typescript: { ignoreBuildErrors: true },
```
Los errores de tipo y linting no interrumpen el build. Esto oculta potenciales errores de runtime que TypeScript habría detectado en tiempo de compilación.

**Corrección:** Activar ambas verificaciones y corregir los errores reales.

---

### SEC-MIN-2: Archivo `.bak` en código de producción
`src/components/OrderTable.tsx.bak` es un archivo de respaldo que no debería existir en el repositorio. Puede contener código antiguo con vulnerabilidades corregidas o credenciales de prueba.

**Corrección:** `git rm src/components/OrderTable.tsx.bak`

---

### DB-MIN-1: `order_number SERIAL` no es compatible con distribución horizontal
La columna `order_number SERIAL` usa una secuencia de PostgreSQL. Esto puede generar conflictos o saltos de numeración si se usa connection pooling con múltiples conexiones paralelas, o si se migra a una arquitectura distribuida.

**Corrección a largo plazo:** Reemplazar con `order_code` (que ya existe y usa un formato más robusto) como identificador principal de negocio.

---

### PERF-MIN-1: Uso de `<img>` en lugar de `next/image`
`OrderTable.tsx` y `SimulatorPanel.tsx` usan `<img>` nativo en lugar de `next/image`. Esto deshabilita la optimización automática de imágenes de Next.js (WebP, lazy loading, tamaños responsive).

---

### PERF-MIN-2: Sin caché en ninguna consulta de datos estáticos
Los datos que cambian raramente (menú, configuración del restaurante, sucursales) se re-consultan en cada render del componente. Agregar `unstable_cache` de Next.js con `revalidate: 60` reduciría significativamente la carga en Supabase.

---

### ESCAL-MIN-1: Sin estrategia de backup para archivos en Supabase Storage
No se identificó configuración de backup para el Storage de Supabase (logos, comprobantes). Activar Point-in-Time Recovery en el dashboard de Supabase y documentar la estrategia de backup.

---

## Estrategia de Escalabilidad

**Estado actual:** La arquitectura Vercel Serverless + Supabase es correcta para la escala actual (1-50 restaurantes). No se requiere cambio de infraestructura en el corto plazo.

**Recomendaciones por escala:**

- **0-50 restaurantes:** Plan actual. Corregir los problemas de seguridad y performance.
- **50-200 restaurantes:** Activar connection pooling de Supabase (PgBouncer ya incluido — agregar `?pgbouncer=true` a la connection string). Implementar la retención de logs. Evaluar Redis (Upstash) para rate limiting y caché.
- **200+ restaurantes:** Considerar particionar la tabla `orders` por `restaurant_id` y `created_at`. Evaluar read replicas para reportes. Considerar separar el servicio de facturación SRI en un worker dedicado (no serverless) para manejar los reintentos y los 5 intentos de autorización.

**Motivo para NO migrar a VPS aún:** La lógica de facturación usa `node-forge` para firmar XML en el servidor. Esto funciona correctamente en Vercel con `runtime: 'nodejs'`. Migrar a VPS solo tiene sentido cuando el costo de Supabase supere el de una instancia dedicada (~$50/mes en DigitalOcean para la base de datos equivalente).

---

## Lista de Correcciones Priorizadas

**Semana 1 — Crítico (bloquea producción):**
- [ ] Agregar autenticación a `/api/sri/invoice`
- [ ] **Eliminar** `/api/sri/test-smtp`
- [ ] Agregar autenticación a `/api/sri/metadata`, `/api/sri/test-connection`, `/api/sri/next-seq`
- [ ] Implementar rate limiting en endpoints de auth (login/signup/forgot-password) con Upstash
- [ ] Cifrar `sri_p12_b64` y `sri_p12_pwd` con `pgp_sym_encrypt` en la base de datos

**Semana 2 — Mayor (seguridad y privacidad):**
- [ ] Eliminar políticas RLS "demo" de `orders`, `order_items`, `whatsapp_webhook_logs`
- [ ] Corregir política de `customers` (eliminar `FOR ALL USING (true)`)
- [ ] Mover el signup de staff a una API route server-side
- [ ] Agregar headers de seguridad en `next.config.mjs`
- [ ] Eliminar valores hardcodeados de Supabase URL y anon key en `supabase.ts` y `supabaseAdmin.ts`
- [ ] Cifrar `smtp_pass`, `gemini_api_key`, `whatsapp_access_token` en la base de datos

**Semana 3 — Performance:**
- [ ] Reemplazar `select('*')` con selección de columnas específicas en todos los componentes
- [ ] Agregar paginación en `ReportsPanel` y `Dashboard` (pedidos y logs)
- [ ] Reemplazar `<img>` con `next/image` en `OrderTable.tsx` y `SimulatorPanel.tsx`

**Semana 4 — Mantenimiento a largo plazo:**
- [ ] Implementar job de retención de datos para `whatsapp_webhook_logs` (90 días)
- [ ] Implementar job de retención para `activity_logs` (180 días)
- [ ] Crear `middleware.ts` con matcher para rutas API protegidas
- [ ] Activar TypeScript y ESLint en el build y corregir los errores resultantes
- [ ] Eliminar `src/components/OrderTable.tsx.bak`
- [ ] Agregar índice en `orders(created_at)` para queries de reportes
- [ ] Actualizar `restaurant_billing_stats` para filtrar por período activo

---

## Hallazgos Positivos

Estos aspectos están bien implementados y no requieren cambios:

- `supabaseAdmin` (service role) se usa exclusivamente en rutas API server-side, nunca en componentes cliente.
- Las rutas admin (`/api/admin/users`) tienen verificación de rol correcta (admin_general o super_admin).
- Los errores de `supabaseAdmin` lanzan excepciones explícitas en lugar de fallar silenciosamente.
- RLS está habilitado en todas las tablas del schema.
- Las claves foráneas tienen comportamiento ON DELETE apropiado (CASCADE donde corresponde).
- Los triggers de `updated_at` están implementados correctamente en todas las tablas mutables.
- El manejo de `orderId` secuencial usa una función PostgreSQL atómica (`sri_next_secuencial`) para evitar duplicados bajo concurrencia.
- `.env.local` está en `.gitignore`.
- No se encontraron API keys hardcodeadas en el código fuente (excepto los fallbacks de Supabase).
- No se usa `dangerouslySetInnerHTML` en ningún componente.
