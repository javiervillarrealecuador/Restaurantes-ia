import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col items-center py-12 px-6 relative overflow-hidden">
      {/* Decorative background glows */}
      <div className="absolute top-0 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-emerald-600/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-0 translate-x-1/4 translate-y-1/2 w-[500px] h-[500px] rounded-full bg-emerald-950/20 blur-[150px] pointer-events-none"></div>

      <div className="max-w-4xl w-full relative z-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-emerald-400 transition-colors mb-8 font-medium">
          <ArrowLeft className="h-4 w-4" /> Volver al Inicio
        </Link>

        <div className="bg-zinc-900/40 border border-zinc-800 p-8 md:p-12 rounded-3xl backdrop-blur-lg shadow-2xl">
          <div className="flex items-center gap-4 mb-8 border-b border-zinc-800 pb-8">
            <div className="h-14 w-14 bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Política de Privacidad y Tratamiento de Datos</h1>
              <p className="text-zinc-400 mt-1">Última actualización: Junio 2026</p>
            </div>
          </div>

          <div className="prose prose-invert prose-emerald max-w-none text-zinc-300">
            <p className="lead text-zinc-400 text-lg">
              Este documento establece las Políticas de Privacidad y Tratamiento de Datos Personales para los usuarios que utilizan nuestro servicio de pedidos a través de WhatsApp y nuestra plataforma tecnológica.
            </p>
            <p className="mb-8">
              Esta política ha sido redactada en estricto cumplimiento con la <strong>Ley Orgánica de Protección de Datos Personales (LOPDP)</strong> de la República del Ecuador.
            </p>

            <h2 className="text-xl font-semibold text-zinc-100 mt-8 mb-4">1. Responsable del Tratamiento de Datos</h2>
            <p>El responsable del tratamiento de los datos personales es <strong>[Nombre de tu Restaurante]</strong>, con domicilio en Ecuador, y correo electrónico de contacto <strong>[Tu Correo]</strong>.</p>

            <h2 className="text-xl font-semibold text-zinc-100 mt-8 mb-4">2. Datos Personales que Recopilamos</h2>
            <p>Al interactuar con nuestro asistente virtual en WhatsApp o nuestra aplicación web para realizar un pedido, recopilamos única y exclusivamente los datos estrictamente necesarios:</p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li><strong>Datos de Identificación:</strong> Nombre, apellido (según conste en WhatsApp) y número de teléfono celular.</li>
              <li><strong>Datos de Ubicación:</strong> Dirección de domicilio o ubicación compartida por GPS para entregas a domicilio (delivery).</li>
              <li><strong>Datos de Consumo:</strong> Historial de pedidos, preferencias de menú y alergias alimentarias (si son informadas).</li>
              <li><strong>Datos de Facturación:</strong> Número de cédula de identidad o RUC, dirección fiscal y correo electrónico (únicamente si requieres factura electrónica).</li>
            </ul>

            <h2 className="text-xl font-semibold text-zinc-100 mt-8 mb-4">3. Finalidad del Tratamiento de Datos</h2>
            <p>Conforme a la LOPDP, los datos recopilados serán utilizados con los siguientes fines explícitos y legítimos:</p>
            <ol className="list-decimal pl-6 space-y-2 mt-4">
              <li><strong>Gestión de Pedidos:</strong> Recibir, procesar, preparar y despachar los pedidos solicitados a través de WhatsApp.</li>
              <li><strong>Comunicación:</strong> Notificarte sobre el estado de tu pedido, tiempos de entrega y responder a tus dudas.</li>
              <li><strong>Facturación:</strong> Emitir comprobantes de venta válidos según la normativa del Servicio de Rentas Internas (SRI).</li>
              <li><strong>Mejora del Servicio:</strong> Analizar el historial de consumo para mejorar nuestro menú, respetando los lineamientos de privacidad de Meta.</li>
            </ol>

            <h2 className="text-xl font-semibold text-zinc-100 mt-8 mb-4">4. Base Legal para el Tratamiento (LOPDP)</h2>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li><strong>Consentimiento explícito:</strong> Otorgado al iniciar la conversación por WhatsApp.</li>
              <li><strong>Ejecución de un contrato:</strong> Indispensables para cumplir con la compra-venta de nuestros productos.</li>
              <li><strong>Cumplimiento legal:</strong> Relacionadas con el ámbito tributario (SRI).</li>
            </ul>

            <h2 className="text-xl font-semibold text-zinc-100 mt-8 mb-4">5. Integración con WhatsApp y Meta</h2>
            <p>Nuestra plataforma utiliza la API oficial de WhatsApp Business. Al usar este canal, aceptas que tus mensajes están sujetos también a las Políticas de Privacidad y Condiciones de Servicio de <strong>WhatsApp Inc. (Meta)</strong>. Garantizamos que la información se procesa en servidores seguros utilizando encriptación en tránsito.</p>

            <h2 className="text-xl font-semibold text-zinc-100 mt-8 mb-4">6. Seguridad de los Datos</h2>
            <p>Implementamos las medidas de seguridad técnicas requeridas por la LOPDP para proteger sus datos contra acceso no autorizado, pérdida, destrucción o alteración. Contamos con controles de acceso estrictos.</p>

            <h2 className="text-xl font-semibold text-zinc-100 mt-8 mb-4">7. Derechos del Titular de los Datos</h2>
            <p>Como ciudadano protegido por la legislación ecuatoriana (LOPDP), usted tiene el derecho a:</p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li><strong>Acceso:</strong> Conocer qué datos personales tenemos sobre usted.</li>
              <li><strong>Rectificación:</strong> Modificar datos incorrectos o incompletos.</li>
              <li><strong>Eliminación (Derecho al olvido):</strong> Solicitar la eliminación de sus datos, siempre que no exista una obligación legal de conservarlos (ej. SRI).</li>
              <li><strong>Oposición:</strong> Negarse a que usemos sus datos para fines publicitarios.</li>
            </ul>
            <p className="mt-4">Para ejercer cualquiera de estos derechos, puede enviar un mensaje directamente a nuestra línea de WhatsApp o escribir a nuestro correo de soporte.</p>

            <h2 className="text-xl font-semibold text-zinc-100 mt-8 mb-4">8. Compartición de Datos a Terceros</h2>
            <p>Sus datos <strong>NO serán vendidos ni comercializados</strong>. Solo compartiremos información con proveedores logísticos (repartidores), tecnológicos (servidores en la nube) y autoridades gubernamentales (SRI).</p>

            <h2 className="text-xl font-semibold text-zinc-100 mt-8 mb-4">9. Actualizaciones</h2>
            <p>Nos reservamos el derecho de actualizar esta política para adaptarla a nuevas exigencias legislativas de Ecuador.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
