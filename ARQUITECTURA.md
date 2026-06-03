# Documentación de Arquitectura y Mantenimiento Técnico

Este documento detalla la estructura completa de la aplicación, flujos de datos y la integración del Agente de Inteligencia Artificial. Está diseñado para que cualquier ingeniero de software pueda comprender el sistema y realizar labores de mantenimiento, depuración o escalamiento.

---

## 1. Stack Tecnológico Principal

- **Framework Frontend/Backend:** Next.js (App Router)
- **Base de Datos y Tiempo Real:** Supabase (PostgreSQL, Supabase Realtime)
- **Estilos y UI:** Tailwind CSS, Framer Motion (animaciones), Sonner (notificaciones toast), Lucide React (íconos).
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
 │   │           └── route.ts     # (CRÍTICO) Webhook de WhatsApp y Lógica del Agente IA
 │   ├── globals.css              # Estilos globales y tokens de Tailwind
 │   ├── layout.tsx               # Layout raíz (Next-themes context, Sonner Toaster)
 │   └── page.tsx                 # Punto de entrada de la UI administrativa
 ├── components/
 │   ├── Dashboard.tsx            # Contenedor principal SPA (Navegación por pestañas)
 │   ├── MenuPanel.tsx            # Gestión del menú (CRUD, Optimización con next/image)
 │   ├── OrderTable.tsx           # Vista y gestión de pedidos
 │   ├── ReceiptPrinter.tsx       # Componente oculto para formato de impresión térmica (80mm)
 │   ├── ReportsPanel.tsx         # Lógica de métricas y exportación nativa a Excel (.xlsx)
 │   └── Skeletons.tsx            # Componentes de carga (Loading states)
 ├── context/
 │   └── ThemeProvider.tsx        # Proveedor de Modo Claro/Oscuro
 ├── hooks/
 │   └── useOrders.ts             # Custom hook que maneja la suscripción a Supabase Realtime
 ├── lib/
 │   ├── supabase.ts              # Cliente Supabase público (Frontend)
 │   ├── supabaseAdmin.ts         # Cliente Supabase con Service Role (Bypass RLS para Backend)
 │   └── whatsapp.ts              # Utilidades para enviar mensajes a la API de WhatsApp
 └── types/
     └── index.ts                 # Interfaces y tipos de TypeScript (Order, MenuItem, etc.)
```

---

## 3. Arquitectura del Agente de Inteligencia Artificial (API / Backend)

La inteligencia de la aplicación reside enteramente en el archivo **`src/app/api/webhook/whatsapp/route.ts`**. Este endpoint maneja la comunicación bidireccional entre el usuario de WhatsApp y la base de datos de Supabase, intermediada por un LLM (DeepSeek).

### 3.1. Flujo de Procesamiento del Agente
Cuando un cliente envía un mensaje por WhatsApp, ocurre lo siguiente:

1. **Ingesta y Validación (`POST`)**: Se verifica la firma del webhook y se extrae el número de teléfono y el cuerpo del mensaje.
2. **Construcción de Contexto**: El backend consulta a Supabase:
   - Catálogo de productos disponibles (`menu_items`).
   - Últimos 6 mensajes de la sesión del cliente (`whatsapp_webhook_logs`) para mantener memoria contextual.
   - Estado del "carrito" activo si hay una orden en proceso (filtrando logs recientes).
3. **Inyección de Prompts (Prompt Engineering)**: Se construye un `systemPrompt` altamente estructurado que obliga al modelo `deepseek-chat` a adoptar la personalidad de **"Appy"** y a responder **estrictamente en un objeto JSON**.
4. **Inferencia LLM**: Se hace un request asíncrono a la API de DeepSeek pasando el historial y el menú inyectados dinámicamente.
5. **Decodificación de `Intent`**: El JSON retornado por la IA contiene un atributo clave llamado `intent`.

### 3.2. Los 6 Intents Fundamentales del Agente
El mantenimiento del comportamiento de la IA depende de comprender cómo el agente clasifica la intención del usuario. El JSON estructurado obliga a elegir entre:

- `greeting`: Saludos básicos.
- `full_menu`: El cliente solicita la carta completa.
- `menu_query`: El cliente pregunta por una categoría específica.
- `add_to_order`: **(Fase de Borrador)** El cliente está armando su pedido. La IA acumula los ítems pero NO cierra la orden.
- `confirm_order`: **(Cierre)** El cliente indica que ha finalizado su pedido.
- `other`: Conversación fuera de dominio.

### 3.3. Strict Backend Enforcement (Prevención de Alucinaciones)
*Esta es la capa de seguridad más importante.* Si el LLM intenta confirmar una orden (`intent === 'confirm_order'`) prematuramente, el backend intercepta el resultado y fuerza un retroceso a `add_to_order` si faltan datos obligatorios:
- **`order_type`** (Mesa, Retiro, o Domicilio)
- **`delivery_address`** (Si es a domicilio)
- **`payment_method`** (Efectivo o Transferencia)

Solo cuando estos datos son estrictamente capturados, el sistema procede a registrar los datos en Supabase (`orders` y `order_items`).

### 3.4. Fallback NLP (Plan de Contingencia)
Si la API de DeepSeek falla, agota su tiempo de espera o no tiene configurada la `DEEPSEEK_API_KEY`, el sistema invoca automáticamente `runFallbackAgent()`. 
Este es un **Analizador de Lenguaje Natural basado en Regex y Heurística**. Detecta coincidencias de códigos de producto o nombres exactos en la cadena de texto, extrayendo cantidades y notas básicas. Garantiza que el restaurante jamás quede fuera de línea aunque el servicio de IA caiga.

---

## 4. Frontend y Actualizaciones en Tiempo Real

La interfaz administrativa está diseñada como una Single Page Application (SPA).

1. **Supabase Realtime (`useOrders.ts`)**: Utiliza `supabase.channel` para suscribirse a los eventos de tipo `INSERT` o `UPDATE` en la tabla `orders`. Cuando un cliente termina de armar su pedido por WhatsApp y el Agente inserta el registro, el Dashboard frontend captura el evento instantáneamente, actualiza el estado de React, y dispara un `toast` notificando al comercio.
2. **Generación de Reportes (`ReportsPanel.tsx`)**: Toma el arreglo de pedidos en memoria y, usando la librería `xlsx`, transforma los objetos JSON en hojas de cálculo estructuradas y descarga el Blob a la máquina local sin necesidad de interactuar con el backend.
3. **Impresión de Tickets (`ReceiptPrinter.tsx`)**: Para mantener la UI de la tabla limpia, el ticket térmico de 80mm se renderiza en un componente oculto de React (`display: none`). La librería `react-to-print` clona ese componente en un iframe temporal e invoca el evento nativo `window.print()` del navegador web del SO cliente.
4. **Optimización de Imágenes**: `MenuPanel.tsx` usa el componente `<Image />` de `next/image` asegurando carga asíncrona, prevención de Cumulative Layout Shift (CLS), y conversión automática a WebP.

---

## 5. Variables de Entorno Clave (.env.local)

Para que el sistema completo opere correctamente, es indispensable la correcta configuración de:

- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Para la conexión del cliente frontend.
- `SUPABASE_SERVICE_ROLE_KEY`: Para operaciones críticas en el backend (crear órdenes mediante la API de WhatsApp sin pasar por RLS).
- `DEEPSEEK_API_KEY`: Credencial crítica para la inferencia de la IA.
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `VERIFY_TOKEN`: Variables de Meta para enviar y recibir mensajes a través de los webhooks.

## 6. Consideraciones para Mantenimiento a Futuro

- **Si se requiere cambiar el proveedor de IA (Ej. a Gemini de Google)**: Modifique la función `runAIAgent()` en `route.ts`. Debe cambiar la URL (`api.deepseek.com`), los encabezados (`Authorization: Bearer`), y la estructura del payload para adaptarse al formato del proveedor elegido. Asegúrese de que el proveedor soporte "JSON Schema / Structured Outputs" para mantener la precisión del `intent`.
- **Nuevos campos en Pedidos**: Para agregar nuevos atributos a un pedido (ej. *Método de entrega urgente*), agregue la columna en la base de datos de Supabase, modifique la interfaz `Order` en `types/index.ts`, actualice el schema JSON dentro del `systemPrompt` en `route.ts` para que la IA sepa que debe extraer ese dato, y finalmente mapee el atributo visualmente en `OrderTable.tsx`.
