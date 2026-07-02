# Arquitectura del Sistema - Plataforma SaaS de Gestion para Restaurantes

> **Ultima actualizacion:** Julio 2026
> **Proposito:** Este documento describe de forma exhaustiva la arquitectura tecnica, el stack tecnologico, la estructura de base de datos, las rutas de API y los flujos de datos del sistema. Orientado a que cualquier ingeniero de software pueda entender, mantener y escalar la plataforma.

---

## Vision General del Sistema

Este sistema es una **plataforma SaaS multi-tenant** para la gestion integral de restaurantes. Permite:

- Tomar pedidos (mesa, delivery, para llevar / takeaway)
- Gestionar el menu, cocinas y personal con roles
- Recibir pedidos automaticamente via **WhatsApp** con un **Agente de IA**
- Emitir **facturas electronicas** integradas con el **SRI de Ecuador**
- Ver reportes de ventas, gestionar clientes (CRM) y llevar control de inventario visual
- Administrar multiples restaurantes como **Super Admin** (panel SaaS)

---

## 1. Stack Tecnologico

### Frontend

| Tecnologia | Version | Rol |
|---|---|---|
| **Next.js** | 14.2.x | Framework React con App Router. Maneja SSR/SSG y las API Routes del backend |
| **React** | 18.x | Libreria de UI |
| **TypeScript** | 5.x | Tipado estatico del proyecto completo |
| **Tailwind CSS** | 3.4.x | Framework de estilos utilitarios |
| **Framer Motion** | 12.x | Animaciones de UI (login, transiciones) |
| **Sonner** | 2.x | Notificaciones tipo toast (alertas de nuevos pedidos) |
| **Lucide React** | 1.x | Libreria de iconos SVG |
| **next-themes** | 0.4.x | Soporte de modo oscuro / claro |

### Backend (API Routes de Next.js - Node.js)

| Tecnologia | Version | Rol |
|---|---|---|
| **Next.js API Routes** | 14.2.x | Endpoints REST del servidor (`/src/app/api/`) |
| **Supabase JS SDK** | 2.x | Cliente para autenticacion, consultas y Realtime |
| **node-forge** | 1.4.x | Firma digital XML para facturas electronicas (SRI) con certificados `.p12` |
| **nodemailer** | 9.x | Envio de facturas por correo electronico (SMTP configurable) |
| **jspdf** | 4.x | Generacion de PDFs de facturas |
| **jsbarcode** | 3.12.x | Generacion de codigos de barras para facturas |
| **uuid** | 14.x | Generacion de UUIDs unicos |

### Base de Datos y Servicios Cloud

| Servicio | Rol |
|---|---|
| **Supabase (PostgreSQL)** | Base de datos principal relacional, autenticacion (Supabase Auth), Row Level Security (RLS) y Realtime via WebSockets |
| **Supabase Storage** | Almacenamiento de imagenes del menu y logos |
| **Vercel** | Hosting y despliegue del frontend + API Routes |
| **DeepSeek API** | Modelo de lenguaje grande (LLM) para el Agente de IA de WhatsApp |
| **WhatsApp Cloud API (Meta)** | Canal de mensajeria bidireccional con clientes |
| **SRI de Ecuador (Web Services SOAP)** | Validacion y autorizacion de facturas electronicas |

### Herramientas de Exportacion y Utilidades

| Libreria | Uso |
|---|---|
| **xlsx** | Exportacion de reportes a archivos Excel `.xlsx` |
| **react-to-print** | Impresion de tickets termicos POS (80mm) |
| **@vercel/functions** | Configuracion de timeouts extendidos para API Routes pesadas |

---

## 2. Estructura de Directorios (`/src`)

```
/src
+-- app/
|   +-- api/                            <- BACKEND: Todos los endpoints REST
|   |   +-- activity/                   # Registro de actividad de staff
|   |   +-- admin/                      # Operaciones del Super Admin SaaS
|   |   +-- bootstrap/                  # Inicializacion de nuevos restaurantes
|   |   +-- kushki/                     # Integracion pasarela de pago Kushki
|   |   +-- orders/
|   |   |   +-- [id]/
|   |   |   |   +-- route.ts            # PATCH/DELETE de un pedido especifico
|   |   |   |   +-- items/route.ts      # PATCH items de un pedido (por cocina)
|   |   |   +-- split/route.ts          # Division de cuentas
|   |   +-- saas/                       # Facturacion y gestion SaaS
|   |   +-- sri/                        # Modulo de Facturacion Electronica SRI
|   |   |   +-- invoice/route.ts        # Emitir facturas al SRI
|   |   |   +-- metadata/route.ts       # Metadatos de la firma digital
|   |   |   +-- next-seq/route.ts       # Obtener proximo secuencial de factura
|   |   |   +-- settings/route.ts       # Leer/guardar configuracion SRI
|   |   |   +-- test-connection/route.ts # Probar conexion con el SRI
|   |   |   +-- test-smtp/route.ts      # Probar configuracion SMTP
|   |   |   +-- upload-p12/route.ts     # Subir certificado de firma digital
|   |   |   +-- xml/route.ts            # Generar/devolver XML de factura
|   |   +-- upload-receipt/route.ts     # Subir comprobantes de pago (imagenes)
|   |   +-- webhook/
|   |       +-- whatsapp/route.ts       <- CRITICO: Agente IA + Webhook WhatsApp
|   +-- fonts/                          # Fuentes tipograficas locales
|   +-- forgot-password/page.tsx        # Pagina de recuperacion de contrasena
|   +-- login/page.tsx                  # Interfaz de autenticacion animada
|   +-- privacidad/page.tsx             # Politica de privacidad (requerida por Meta)
|   +-- signup/page.tsx                 # Pagina de registro
|   +-- update-password/page.tsx        # Actualizacion de contrasena post-reset
|   +-- globals.css                     # Estilos globales y tokens CSS
|   +-- layout.tsx                      # Layout raiz (next-themes, Sonner Toaster)
|   +-- page.tsx                        # Punto de entrada -> redirige al Dashboard
|
+-- components/
|   +-- Dashboard.tsx                   <- NUCLEO: Contenedor SPA principal, navegacion por roles
|   +-- MenuPanel.tsx                   # Gestion del menu (CRUD completo, categorias, items)
|   +-- OrderTable.tsx                  # Vista y gestion de pedidos (vendedor/admin)
|   +-- TakeOrderPanel.tsx              # Toma de pedidos en mesa con plano visual
|   +-- KitchenDisplay.tsx              # KDS: Pantalla Kanban para cocina
|   +-- KitchensPanel.tsx               # CRUD de cocinas (estaciones de trabajo)
|   +-- AuxiliarDisplay.tsx             # Vista auxiliar para operaciones de apoyo
|   +-- DeliveryDisplay.tsx             # Tracker mobile-first para repartidores
|   +-- CustomersPanel.tsx              # CRM y ranking de fidelizacion de clientes
|   +-- ReportsPanel.tsx                # Metricas, graficos y exportacion Excel
|   +-- SaaSAdminPanel.tsx              # Panel exclusivo del Super Admin (gestion SaaS)
|   +-- SimulatorPanel.tsx              # Simulador de pedidos WhatsApp para pruebas
|   +-- DeunaPaymentModal.tsx           # Modal de pago con pasarela Deuna
|   +-- KushkiPaymentModal.tsx          # Modal de pago con pasarela Kushki
|   +-- ReceiptPrinter.tsx              # Componente oculto para impresion termica 80mm
|   +-- Skeletons.tsx                   # Esqueletos de carga (loading states)
|   +-- ThemeProvider.tsx               # Proveedor de modo claro/oscuro
|   +-- ThemeToggle.tsx                 # Boton de cambio de tema
|
+-- context/
|   +-- AuthContext.tsx                 # Estado de sesion, roles y permisos (RBAC)
|   +-- ThemeProvider.tsx               # Alias del proveedor de tema
|
+-- hooks/
|   +-- useOrders.ts                    # Hook para suscripcion Realtime + CRUD de pedidos
|
+-- lib/
|   +-- supabase.ts                     # Cliente Supabase publico (frontend, usa anon key)
|   +-- supabaseAdmin.ts                # Cliente Supabase admin (backend, bypass RLS)
|
+-- types/
    +-- index.ts                        # Interfaces TypeScript: Order, MenuItem, Restaurant...
```

---

## 3. Modelo de Base de Datos (PostgreSQL via Supabase)

### Tablas Principales

| Tabla | Descripcion |
|---|---|
| `restaurants` | Datos del restaurante (nombre, RUC, configuracion SRI, SMTP) |
| `profiles` | Usuarios enlazados a `auth.users` de Supabase |
| `restaurant_staff` | Relacion N:N entre profiles y restaurants con un rol asignado |
| `menu_categories` | Categorias del menu (Entradas, Platos Fuertes, etc.) |
| `menu_items` | Items del menu con precio, tiempo de preparacion y cocina asignada |
| `menu_modifiers` | Modificadores de items (extra queso, sin cebolla, etc.) |
| `orders` | Pedidos (estado, tipo, cliente, totales, referencias SRI) |
| `order_items` | Lineas de detalle de cada pedido |
| `settings` | Configuracion del restaurante (credenciales WhatsApp, instruccion IA) |
| `restaurant_tables` | Mesas con posicion en el plano (x, y) y estado actual |
| `kitchens` | Cocinas o estaciones de trabajo (parrilla, postres, bar, etc.) |
| `branches` | Sucursales del restaurante |
| `customers` | CRM: clientes con historial de pedidos y ticket promedio |
| `whatsapp_webhook_logs` | Log de todos los mensajes entrantes de WhatsApp |
| `saas_invoices` | Facturas SaaS emitidas a los restaurantes por uso del sistema |
| `admin_alerts` | Alertas manuales para el administrador |

### Tipos Enum

```sql
order_status: 'draft' | 'pending' | 'pending_payment' | 'confirmed' |
              'preparing' | 'ready' | 'delivering' | 'delivered' | 'cancelled'

order_type:   'dine_in' | 'delivery' | 'pickup'

staff_role:   'admin_general' | 'vendedor_cajero' | 'cocinero' | 'repartidor' |
              'camarero' | 'repartidor_domicilio' | 'admin' | 'manager' | 'staff'
```

### Triggers de Base de Datos

| Trigger | Descripcion |
|---|---|
| `update_modified_column` | Actualiza automaticamente `updated_at` en cada UPDATE |
| `decrement_restaurant_credits` | Descuenta 1 credito prepago cuando un pedido cambia a `delivered`. Si llega a 0, suspende la cuenta |

### Funcion de Seguridad Principal

```sql
is_restaurant_staff(restaurant_uuid UUID) -> BOOLEAN
```

Verifica si el usuario autenticado (`auth.uid()`) pertenece al staff del restaurante.
Se usa como guardia en todas las politicas RLS del sistema.

---

## 4. Seguridad y Control de Acceso por Roles (RBAC)

### Roles de Usuario

| Rol | Descripcion | Acceso Principal |
|---|---|---|
| `admin_general` | Dueno o administrador del restaurante | Acceso total al sistema |
| `vendedor_cajero` | Cajero o vendedor | Pedidos, CRM, Simulador. Sin reportes ni configuracion |
| `cocinero` | Personal de cocina | Solo ve el KDS (Kitchen Display) |
| `camarero` | Mesero | Toma pedidos en mesa (TakeOrderPanel) |
| `repartidor` | Repartidor local | Solo ve el Delivery Tracker |
| `repartidor_domicilio` | Repartidor externo | Acceso limitado al modulo de delivery |

### Capas de Seguridad

**Capa 1 - UI dinamica (`AuthContext.tsx` + `Dashboard.tsx`):**
Cada componente se renderiza condicionalmente segun el rol del usuario autenticado.

**Capa 2 - Row Level Security (RLS) en Supabase:**
Todas las tablas tienen RLS activado. Las politicas usan `is_restaurant_staff()` para garantizar
que cada restaurante solo acceda a sus propios datos. Ningun restaurante puede ver datos de otro.

**Capa 3 - Middleware de API Routes:**
Las rutas criticas del backend verifican el JWT de Supabase (`Authorization: Bearer <token>`)
antes de ejecutar operaciones sensibles.

**Capa 4 - Service Role Key:**
El cliente `supabaseAdmin.ts` usa la `SUPABASE_SERVICE_ROLE_KEY` que bypassa el RLS.
Se usa EXCLUSIVAMENTE en el backend para operaciones del sistema.

**Capa 5 - Security Headers HTTP (`next.config.mjs`):**
- `X-Frame-Options: DENY` - Previene clickjacking
- `X-Content-Type-Options: nosniff` - Previene MIME sniffing
- `Strict-Transport-Security` - Fuerza HTTPS
- `Referrer-Policy: strict-origin-when-cross-origin`

---

## 5. Agente de Inteligencia Artificial (WhatsApp)

**Archivo central:** `src/app/api/webhook/whatsapp/route.ts`

Este es el cerebro conversacional del sistema. Recibe mensajes de WhatsApp, los procesa
con un LLM (DeepSeek) y responde al cliente en lenguaje natural mientras gestiona pedidos en tiempo real.

### Flujo de Procesamiento de un Mensaje

```
Cliente WhatsApp
      |
      v
[POST /api/webhook/whatsapp]
      |
      +-> Verificar mensaje no duplicado (whatsapp_webhook_logs)
      |
      +-> Identificar restaurante por phone_number_id
      |
      +-> Leer configuracion: settings, menu, historial de conversacion
      |
      +-> Enriquecer con datos CRM (cliente nuevo vs. recurrente)
      |
      +-> Llamar a DeepSeek API (runAIAgent)
      |       +- Si falla -> runFallbackAgent() [regex NLP]
      |
      +-> Validar el intent devuelto (Strict Backend Enforcement)
      |       +- Si confirm_order prematuro -> forzar add_to_order
      |
      +-> Ejecutar accion segun intent:
      |       +- full_menu / menu_query -> Enviar carta formateada
      |       +- add_to_order -> Guardar borrador del pedido en sesion
      |       +- confirm_order -> Crear pedido en DB + notificar cocina
      |       +- other -> Responder sin crear pedido
      |
      +-> Responder al cliente por WhatsApp Cloud API
```

### Intents del Agente

| Intent | Descripcion |
|---|---|
| `greeting` | Saludo inicial al cliente |
| `full_menu` | El cliente solicita ver toda la carta |
| `menu_query` | El cliente pregunta por una categoria especifica |
| `add_to_order` | El cliente esta construyendo su pedido (fase de borrador) |
| `confirm_order` | El cliente confirma y cierra el pedido |
| `other` | Conversacion fuera de dominio, calificaciones post-entrega |

### Capas de Resiliencia

- **Fallback NLP:** Si DeepSeek falla, `runFallbackAgent()` usa expresiones regulares para interpretar mensajes comunes.
- **Strict Enforcement:** Antes de confirmar un pedido deben existir: tipo de orden, direccion (si es delivery), y metodo de pago.
- **Deduplicacion:** Cada `whatsapp_message_id` se registra en logs para evitar pedidos duplicados en reintento.

### Memoria Contextual y CRM

Antes de cada llamada al LLM, el sistema:
1. Lee los ultimos N mensajes de la sesion activa del cliente.
2. Consulta la tabla `customers` para identificar si es cliente recurrente.
3. Si es recurrente, inyecta en el System Prompt: total gastado, cantidad de pedidos, preferencia de canal.
4. Permite saludos personalizados y sugerencias basadas en historial real de compras.

### Calificaciones Automaticas Post-Entrega

Cuando un repartidor marca un pedido como `delivered`, el sistema envia automaticamente
un mensaje de WhatsApp al cliente solicitando calificacion del 1 al 5. La IA detecta la
respuesta como intent `other` y agradece el feedback sin abrir un nuevo pedido.

---

## 6. Modulo de Facturacion Electronica (SRI Ecuador)

**Rutas backend:** `/src/app/api/sri/`

### Flujo de Emision de Factura

```
Admin presiona "Facturar" en la UI
      |
      +-> [GET /api/sri/next-seq]       -> Obtener proximo secuencial de factura
      |
      +-> [GET /api/sri/xml]            -> Generar XML con estructura del SRI
      |                                    (incluye RUC, IVA, RIMPE, etc.)
      |
      +-> [POST /api/sri/invoice]       -> Firmar digitalmente con certificado P12
      |       +- Usar node-forge para firma XML
      |       +- Enviar al Web Service SOAP del SRI (pruebas o produccion)
      |
      +-> SRI responde con numero de autorizacion
      |
      +-> Guardar autorizacion en tabla orders
              (invoice_auth, sri_estado, sri_fecha_aut)
              |
              +-> Generar PDF (jspdf) y enviar por email (nodemailer)
```

### Configuracion por Restaurante

Cada restaurante configura desde su panel de administrador:

- Numero de RUC, razon social, direccion de matriz y establecimiento
- Numero de establecimiento y punto de emision (serie de factura)
- Regimen RIMPE, agente de retencion, contribuyente especial
- Ambiente SRI: `1 = Pruebas`, `2 = Produccion`
- Certificado digital P12 (almacenado cifrado en Supabase)
- Tasa de IVA configurable con soporte de IVA temporal por rango de fechas
- Configuracion SMTP propia para envio de facturas por email

---

## 7. Sistema de Tiempo Real (Supabase Realtime)

**Hook:** `src/hooks/useOrders.ts`

El dashboard recibe actualizaciones instantaneas sin recargar la pagina.

### Suscripciones Activas

```
Channel 1: restaurant-orders-{restaurantId}
  +- Escucha INSERT / UPDATE / DELETE en tabla `orders`
  +- Filtra por restaurant_id para multi-tenancy

Channel 2: restaurant-order-items-{restaurantId}
  +- Escucha INSERT / UPDATE / DELETE en tabla `order_items`
  +- Refresca el pedido afectado automaticamente
```

### Estrategias de Actualizacion

| Mecanismo | Intervalo | Proposito |
|---|---|---|
| Supabase Realtime WebSocket | Instantaneo | Actualizaciones de pedidos en vivo |
| Polling de respaldo | Cada 5 segundos | Garantia si el WebSocket falla |
| Visibilidad de pestana | Al enfocar | Refresca al volver a la pestana del navegador |
| Reconexion de red | Al reconectar | Refresca cuando vuelve el internet |

---

## 8. Modulos de la SPA (Frontend)

### Kitchen Display System (KDS) - `KitchenDisplay.tsx`
- Tablero tipo Kanban con los pedidos activos en cocina
- Calcula el tiempo transcurrido desde la creacion del pedido
- Semaforo de colores: Verde (< 10 min) | Amarillo (< 20 min) | Rojo (> 20 min)
- Filtrado por cocina asignada al cocinero que inicio sesion

### Plano de Mesas - `TakeOrderPanel.tsx`
- Visualizacion interactiva del plano de mesas del restaurante
- Mesas con posicion configurable (X, Y) desde el panel de administracion
- Soporte de **mesas para llevar** (takeaway) configurables desde admin
- Permite tomar pedidos directamente sobre la mesa seleccionada (dine_in)

### Delivery Tracker - `DeliveryDisplay.tsx`
- Interfaz Mobile-First para repartidores
- Muestra pedidos en estado `ready` o `delivering`
- Genera deep-link a Google Maps con la direccion del cliente
- Actualiza el estado a `delivered` y dispara el mensaje de calificacion automatico

### CRM de Clientes - `CustomersPanel.tsx`
- Ranking de mejores clientes por total gastado
- Historial de pedidos y preferencia de canal (Mesa, Delivery, Pickup)
- Informacion de contacto y notas del cliente

### Reportes - `ReportsPanel.tsx`
- Metricas de ventas por periodo, por tipo de pedido, por item del menu
- Graficos de tendencias
- Exportacion nativa a Excel `.xlsx` en el navegador

### Panel SaaS Admin - `SaaSAdminPanel.tsx`
- Exclusivo para Super Admins (`is_super_admin = true` en tabla `profiles`)
- Muestra todos los restaurantes registrados en la plataforma
- Control de creditos prepagos, estado de cuenta (activo / suspendido / trial)
- Estadisticas de facturacion por restaurante

### Simulador de WhatsApp - `SimulatorPanel.tsx`
- Herramienta interna para probar el agente de IA sin usar WhatsApp real
- Envia mensajes al webhook y muestra la respuesta del agente

---

## 9. Variables de Entorno (`.env.local`)

```bash
# ================================
# SUPABASE
# ================================
NEXT_PUBLIC_SUPABASE_URL=           # URL publica del proyecto Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # Clave publica (frontend, respeta RLS)
SUPABASE_SERVICE_ROLE_KEY=          # Clave admin - SOLO BACKEND - SECRETA

# ================================
# INTELIGENCIA ARTIFICIAL
# ================================
DEEPSEEK_API_KEY=                   # API key de DeepSeek - SECRETA

# ================================
# WHATSAPP (Meta)
# ================================
WHATSAPP_TOKEN=                     # Token de acceso a WhatsApp Cloud API - SECRETA
WHATSAPP_PHONE_NUMBER_ID=           # ID del numero de telefono registrado en Meta
VERIFY_TOKEN=                       # Token secreto para verificar el webhook de Meta

# ================================
# DESPLIEGUE
# ================================
NEXT_PUBLIC_APP_URL=                # URL publica de la app (ej. https://tuapp.vercel.app)
```

NOTA IMPORTANTE: Las variables con prefijo NEXT_PUBLIC_ son visibles en el navegador.
Las variables sin ese prefijo (SERVICE_ROLE_KEY, DEEPSEEK_API_KEY, WHATSAPP_TOKEN)
NUNCA deben exponerse al cliente ni subirse a repositorios publicos.

---

## 10. Despliegue e Infraestructura

| Componente | Plataforma | Descripcion |
|---|---|---|
| Aplicacion Web | **Vercel** | CD/CI automatico desde rama `main` de Git |
| Base de Datos | **Supabase (PostgreSQL)** | Region configurable en el dashboard de Supabase |
| Archivos estaticos | **Supabase Storage** | Imagenes de menu, logos, comprobantes de pago |
| Webhook WhatsApp | **Vercel Serverless** | Endpoint `/api/webhook/whatsapp` |
| DNS y SSL | **Vercel** | Certificado TLS automatico |

### Scripts de Build

```bash
npm run dev      # Servidor local de desarrollo en http://localhost:3000
npm run build    # Build de produccion (Node --max-old-space-size=4096)
npm run start    # Servidor de produccion local
npm run lint     # Linter ESLint
```

---

## 11. Arquitectura de Multi-Tenancy (SaaS)

El sistema usa un modelo de **tenancy por fila** (row-based multi-tenancy).
Todos los restaurantes comparten la misma base de datos y el mismo codigo,
pero estan aislados mediante tres mecanismos:

**Mecanismo 1 - Columna `restaurant_id`:**
Todas las tablas de datos tienen una columna `restaurant_id` que identifica al propietario del registro.

**Mecanismo 2 - Politicas RLS:**
Las politicas de Row Level Security filtran automaticamente cada query al `restaurant_id`
del usuario autenticado. Ningun restaurante puede leer datos de otro.

**Mecanismo 3 - Webhook dinamico:**
El `phone_number_id` de WhatsApp permite identificar automaticamente a que restaurante
pertenece cada mensaje entrante, sin configuracion adicional.

### Modelo de Facturacion SaaS (Creditos Prepagos)

```
Por cada pedido que pasa a estado "delivered":
  |
  +-> Trigger SQL ejecuta decrement_restaurant_credits()
        |
        +-- Si creditos > 0: descuenta 1 credito, operacion normal
        |
        +-- Si creditos = 0: status del restaurante -> 'suspended'
                             (acceso bloqueado hasta recargar creditos)
```

El Super Admin puede recargar creditos desde el SaaSAdminPanel.

---

## 12. Guia de Mantenimiento y Extension

### Como cambiar el proveedor de IA (ej. de DeepSeek a Gemini o Claude)

1. Abre `src/app/api/webhook/whatsapp/route.ts`
2. Localiza la funcion `runAIAgent()`
3. Cambia la URL del endpoint, los headers (`Authorization: Bearer`) y el formato del payload
4. Verifica que el nuevo proveedor soporte **JSON Schema / Structured Outputs** para el intent
5. Actualiza la variable de entorno correspondiente (ej. `GEMINI_API_KEY`)

### Como agregar un nuevo campo a los pedidos

1. Agrega la columna en Supabase (SQL Editor o UI de Supabase)
2. Actualiza la interfaz `Order` en `src/types/index.ts`
3. Si la IA debe extraerlo del chat, agrégalo al JSON Schema del `systemPrompt` en `route.ts`
4. Mapea el nuevo campo visualmente en `OrderTable.tsx` o el componente que corresponda

### Como agregar un nuevo rol de usuario

1. Agrega el valor al enum `staff_role` en la base de datos de Supabase
2. Agrega el tipo en `AuthContext.tsx` (tipo `UserRole`)
3. Define sus permisos en la funcion `getDefaultPermissions()` en `AuthContext.tsx`
4. Condiciona la vista correspondiente en `Dashboard.tsx`

### Como agregar un nuevo modulo de la SPA

1. Crea el componente en `/src/components/NuevoModulo.tsx`
2. Importa y renderiza condicionalmente en `Dashboard.tsx` segun el rol
3. Agrega el permiso correspondiente en la interfaz `StaffPermissions` en `AuthContext.tsx`

### Como agregar una nueva ruta de API

1. Crea el archivo en `/src/app/api/nueva-ruta/route.ts`
2. Implementa los handlers `GET`, `POST`, `PATCH`, `DELETE` segun sea necesario
3. Usa `supabaseAdmin` del lado del servidor para operaciones que requieran bypass de RLS
4. Valida siempre el token JWT del usuario antes de ejecutar operaciones sensibles

### Como agregar una nueva sucursal (branch)

1. Insertar el registro en la tabla `branches` con el `restaurant_id` correspondiente
2. Asignar `branch_id` a las mesas (`restaurant_tables`) que pertenecen a esa sucursal
3. El sistema filtrara automaticamente los pedidos y mesas por sucursal usando el `branch_id`

---

## 13. Diagrama General del Sistema

```
                    +-----------------------------+
                    |     CLIENTE (WhatsApp)       |
                    +-------------+---------------+
                                  |  Mensaje
                                  v
                    +-----------------------------+
                    |  Meta WhatsApp Cloud API    |
                    |  (Webhook - POST)           |
                    +-------------+---------------+
                                  |
                                  v
         +-------------------------------------------+
         |         /api/webhook/whatsapp              |
         |                                           |
         |  1. Identifica restaurante                |
         |  2. Carga contexto (menu + hist + CRM)    |
         |  3. Llama DeepSeek API (LLM)              |
         |  4. Valida intent con reglas del backend   |
         |  5. Ejecuta accion (crea pedido, etc.)    |
         |  6. Responde por WhatsApp                 |
         +----------+--------------------------------+
                    |
         +----------+----------+
         v                     v
+------------------+   +--------------------+
|  Supabase DB     |   |  WhatsApp Cloud API|
|  (PostgreSQL)    |   |  (Envio respuesta) |
+------------------+   +--------------------+
         |
         | Supabase Realtime (WebSocket)
         v
+-------------------------------------------+
|         DASHBOARD ADMINISTRATIVO           |
|         (Next.js SPA en Vercel)           |
|                                           |
|  +----------+  +----------+  +----------+ |
|  | Pedidos  |  |   KDS   |  | Delivery | |
|  |(Admin/  |  |(Cocina) |  |(Reparto) | |
|  |Cajero)  |  +----------+  +----------+ |
|  +----------+                            |
|  +----------+  +----------+  +----------+ |
|  |  Menu   |  |   CRM   |  |Reportes  | |
|  +----------+  +----------+  +----------+ |
|  +----------+  +------------------------+ |
|  |   SRI   |  |   SaaS Admin Panel     | |
|  |Factura  |  |   (Super Admin only)   | |
|  +----------+  +------------------------+ |
+-------------------------------------------+
```

---

*Documento generado a partir del analisis del codigo fuente del repositorio.*
*Actualizar este archivo cuando se agreguen nuevos modulos, tablas o integraciones importantes.*