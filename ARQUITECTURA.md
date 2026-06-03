# Documentación de Arquitectura y Mantenimiento Técnico

Este documento detalla la estructura completa de la aplicación, flujos de datos y la integración del Agente de Inteligencia Artificial. Está diseñado para que cualquier ingeniero de software pueda comprender el sistema y realizar labores de mantenimiento, depuración o escalamiento.

---

## 1. Stack Tecnológico Principal

- **Framework Frontend/Backend:** Next.js (App Router)
- **Base de Datos y Tiempo Real:** Supabase (PostgreSQL, Supabase Realtime)
- **Estilos y UI:** Tailwind CSS, Framer Motion (animaciones de login), Sonner (notificaciones toast), Lucide React (íconos).
- **Inteligencia Artificial:** DeepSeek API (modelo `deepseek-chat`). *Nota: El motor de IA configurado actualmente en el código es DeepSeek, actuando bajo la directriz del sistema.*
- **Exportación / Impresión:** `xlsx` para Excel, `react-to-print` para tickets térmicos POS.
- **Integración de Mensajería:** WhatsApp Cloud API (Webhooks).

---

## 2. Estructura de Directorios (`/src`)

```text
/src
 ├── app/
 │   ├── api/
 │   │   └── webhook/
 │   │       └── whatsapp/
 │   │           └── route.ts     # (CRÍTICO) Webhook de WhatsApp, Lógica IA y CRM
 │   ├── globals.css              # Estilos globales y tokens de Tailwind
 │   ├── layout.tsx               # Layout raíz (Next-themes context, Sonner Toaster)
 │   └── login/                   # Interfaz de autenticación animada
 │   └── page.tsx                 # Punto de entrada de la UI administrativa
 ├── components/
 │   ├── Dashboard.tsx            # Contenedor principal SPA (Navegación por roles)
 │   ├── MenuPanel.tsx            # Gestión del menú (CRUD, Optimización con next/image)
 │   ├── OrderTable.tsx           # Vista y gestión de pedidos (Vendedores/Admins)
 │   ├── KitchenDisplay.tsx       # (KDS) Vista optimizada para el rol de Cocinero
 │   ├── DeliveryDisplay.tsx      # (Delivery Tracker) Vista móvil para Repartidores
 │   ├── CustomersPanel.tsx       # Gestión CRM y Fidelización (Ranking en DB)
 │   ├── ReportsPanel.tsx         # Lógica de métricas y exportación nativa a Excel (.xlsx)
 │   └── ReceiptPrinter.tsx       # Componente oculto para impresión térmica (80mm)
 ├── context/
 │   ├── AuthContext.tsx          # Gestión de estado de sesión, Roles y Permisos (RBAC)
 │   └── ThemeProvider.tsx        # Proveedor de Modo Claro/Oscuro
 ├── hooks/
 │   └── useOrders.ts             # Custom hook que maneja la suscripción a Supabase Realtime
 ├── lib/
 │   ├── supabase.ts              # Cliente Supabase público (Frontend)
 │   ├── supabaseAdmin.ts         # Cliente Supabase con Service Role (Bypass RLS)
 │   └── whatsapp.ts              # Utilidades para enviar mensajes a la API de WhatsApp
 └── types/
     └── index.ts                 # Interfaces TypeScript (Order, MenuItem, Roles, etc.)
```

---

## 3. Seguridad y Autenticación Basada en Roles (RBAC)

La aplicación utiliza un sistema de roles robusto apoyado por **Supabase Auth** y políticas de seguridad a nivel de fila (RLS):

- **Roles Definidos:** `admin_general`, `vendedor_cajero`, `cocinero`, `repartidor`.
- **Seguridad UI (`AuthContext.tsx` y `Dashboard.tsx`):** La interfaz oculta o muestra los componentes dinámicamente según los permisos. 
  - *Cocineros:* Solo ven el KDS (`KitchenDisplay.tsx`) y opciones básicas.
  - *Repartidores:* Solo ven el Delivery Tracker (`DeliveryDisplay.tsx`).
  - *Vendedores:* Acceden a CRM y Pedidos, pero no a reportes.
  - *Admins:* Tienen acceso total.
- **Seguridad Backend (RLS en Postgres):** Se usa la función `is_restaurant_staff` para verificar que solo los empleados autenticados puedan acceder a tablas sensibles (como `customers` o `logs`).

---

## 4. Arquitectura del Agente de Inteligencia Artificial (API / Backend)

La inteligencia de la aplicación reside enteramente en el archivo **`src/app/api/webhook/whatsapp/route.ts`**. Este endpoint maneja la comunicación bidireccional entre el usuario de WhatsApp y la base de datos de Supabase.

### 4.1. Memoria Contextual Avanzada (CRM Inyectado)
Antes de invocar al modelo, el backend lee la tabla `customers` y detecta si es un cliente nuevo o recurrente. Si es recurrente, inyecta métricas como *total gastado* y *cantidad de pedidos* en el System Prompt. Esto permite a la IA saludar de manera personalizada reconociendo la lealtad del cliente.

### 4.2. Los Intents Fundamentales del Agente
- `greeting`: Saludos básicos.
- `full_menu`: El cliente solicita la carta completa.
- `menu_query`: El cliente pregunta por una categoría específica.
- `add_to_order`: **(Fase de Borrador)** El cliente arma su pedido.
- `confirm_order`: **(Cierre)** El cliente cierra el pedido y elige método de pago.
- `other`: Utilizado para conversaciones fuera de dominio o para la **evaluación de Calificaciones (Post-Entrega)**.

### 4.3. Calificaciones y Automatización Logística
Al marcar un pedido como `delivered` (ejecutado por el repartidor en el `DeliveryDisplay`), el backend envía automáticamente un mensaje de WhatsApp pidiendo calificar el servicio del 1 al 5. Si el usuario responde con estrellas o números, la IA (bajo la regla 6 de calificaciones) asume el intent `other` y responde agradeciendo el feedback sin intentar tomar una orden nueva.

### 4.4. Strict Backend Enforcement (Prevención de Alucinaciones)
*Esta es la capa de seguridad más importante.* Si el LLM intenta confirmar una orden (`intent === 'confirm_order'`) prematuramente, el backend intercepta el resultado y fuerza un retroceso a `add_to_order` si faltan datos obligatorios (Tipo de orden, Dirección, Método de Pago).

### 4.5. Fallback NLP (Plan de Contingencia)
Si la API de DeepSeek falla, agota su tiempo de espera o no tiene configurada la llave, el sistema invoca automáticamente `runFallbackAgent()`, garantizando la resiliencia del chatbot mediante expresiones regulares (Regex).

---

## 5. Módulos Visuales de la SPA (Frontend)

1. **Kitchen Display System (KDS):** Tablero estilo Kanban que calcula en vivo los tiempos de espera del pedido y cambia de color (Verde, Amarillo, Rojo).
2. **Delivery Tracking System:** Interfaz Mobile-First. Permite a los repartidores lanzar links de *Google Maps* (Deeplinks) y actualizar el estado de los viajes para notificar a los clientes en tiempo real.
3. **CRM de Fidelización (`CustomersPanel.tsx`):** Analiza la tabla `customers` mostrando rankings de clientes por ticket promedio y su preferencia de compra (Mesa, Delivery, Retiro).
4. **Supabase Realtime (`useOrders.ts`):** Suscripción viva a `INSERT` y `UPDATE` en la tabla `orders`, disparando pop-ups (Toasts) e incluso notificaciones sonoras sin refrescar la página.

---

## 6. Variables de Entorno Clave (.env.local)

- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Para la conexión del cliente frontend.
- `SUPABASE_SERVICE_ROLE_KEY`: Para operaciones críticas en el backend (crear órdenes mediante la API de WhatsApp, actualizar perfiles CRM).
- `DEEPSEEK_API_KEY`: Credencial crítica para la inferencia de la IA.
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `VERIFY_TOKEN`: Variables de Meta para enviar y recibir mensajes a través de los webhooks.

## 7. Consideraciones para Mantenimiento a Futuro

- **Si se requiere cambiar el proveedor de IA (Ej. a Gemini de Google)**: Modifique la función `runAIAgent()` en `route.ts`. Debe cambiar la URL, los encabezados (`Authorization: Bearer`), y la estructura del payload para adaptarse al formato del proveedor elegido. Asegúrese de que el proveedor soporte "JSON Schema / Structured Outputs" para mantener la precisión del `intent`.
- **Nuevos campos en Pedidos**: Para agregar nuevos atributos a un pedido, agregue la columna en la base de datos de Supabase, modifique la interfaz `Order` en `types/index.ts`, actualice el schema JSON dentro del `systemPrompt` en `route.ts` para que la IA sepa que debe extraer ese dato, y finalmente mapee el atributo visualmente en el frontend.
