'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Smartphone, 
  User, 
  Clock, 
  Check, 
  CheckCheck, 
  AlertCircle, 
  Image as ImageIcon, 
  HelpCircle,
  Copy,
  Info
} from 'lucide-react';

interface SimulatorPanelProps {
  restaurantId: string;
}

interface ChatMessage {
  id: string;
  sender: 'customer' | 'bot' | 'system';
  text: string;
  timestamp: string;
  type: 'text' | 'image' | 'system';
  imageUrl?: string;
}

export default function SimulatorPanel({ restaurantId }: SimulatorPanelProps) {
  // Simulator configurations
  const [senderName, setSenderName] = useState('María López');
  const [senderPhone, setSenderPhone] = useState('593987654322');
  const [phoneId, setPhoneId] = useState('123456789012345');
  
  // Chat log state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'system',
      text: 'Simulación de Chat de WhatsApp iniciada. Puedes enviar mensajes como cliente o repartidor para interactuar con la IA de Gemini.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'system'
    }
  ]);
  
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat window
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Quick Preset Actions
  const handleSelectPreset = (name: string, phone: string) => {
    setSenderName(name);
    setSenderPhone(phone);
  };

  // Main send handler
  const sendMessage = async (text: string, type: 'text' | 'image' = 'text', customImgUrl?: string) => {
    if (type === 'text' && !text.trim()) return;

    setErrorText(null);
    const msgId = 'TEST_MSG_' + Math.random().toString(36).substring(2, 11).toUpperCase();
    const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. Add user message locally
    const newUserMessage: ChatMessage = {
      id: msgId,
      sender: 'customer',
      text: type === 'image' ? '[Foto de Comprobante]' : text,
      timestamp: timestampStr,
      type,
      imageUrl: customImgUrl
    };

    setMessages(prev => [...prev, newUserMessage]);
    if (type === 'text') setInputValue('');

    // 2. Trigger Chatbot Typing state
    setIsTyping(true);

    // 3. Build WhatsApp Meta Webhook Payload
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '12345',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '1234567890',
                  phone_number_id: phoneId
                },
                contacts: [
                  {
                    profile: {
                      name: senderName
                    },
                    wa_id: senderPhone
                  }
                ],
                messages: [
                  {
                    from: senderPhone,
                    id: msgId,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type,
                    ...(type === 'text' ? {
                      text: {
                        body: text
                      }
                    } : {
                      image: {
                        mime_type: 'image/jpeg',
                        sha255: 'abc123sha',
                        id: 'mock_image_id_555'
                      }
                    })
                  }
                ]
              },
              field: 'messages'
            }
          ]
        }
      ]
    };

    try {
      const response = await fetch('/api/webhook/whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      setIsTyping(false);

      if (response.ok && data.reply_message) {
        // Add chatbot response
        const botMessage: ChatMessage = {
          id: 'BOT_REPLY_' + Math.random().toString(36).substring(2, 10).toUpperCase(),
          sender: 'bot',
          text: data.reply_message,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'text'
        };
        setMessages(prev => [...prev, botMessage]);
      } else {
        // If there was no text but api worked
        const statusMsg = `Mensaje procesado por el servidor. Estado: ${data.status || 'desconocido'}.`;
        const sysMessage: ChatMessage = {
          id: 'SYS_REPLY_' + Math.random().toString(36).substring(2, 10).toUpperCase(),
          sender: 'system',
          text: statusMsg + (data.message ? ` Detalle: ${data.message}` : ''),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'system'
        };
        setMessages(prev => [...prev, sysMessage]);
      }
    } catch (err: unknown) {
      const fetchErr = err as Error;
      setIsTyping(false);
      console.error('Webhook simulation error:', fetchErr);
      setErrorText('Error al enviar el webhook al servidor local. Revisa la consola.');
      
      const errMsg: ChatMessage = {
        id: 'ERR_REPLY_' + Math.random().toString(36).substring(2, 10).toUpperCase(),
        sender: 'system',
        text: `❌ Error de red local: ${fetchErr.message || 'No se pudo conectar con /api/webhook/whatsapp'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'system'
      };
      setMessages(prev => [...prev, errMsg]);
    }
  };

  // Templates
  const templates = [
    {
      title: "🍔 Comida Rápida (Mesa 3)",
      text: "Hola, quiero pedir una hamburguesa completa (código 1) y un fuze tea 250ml (código 83) para la mesa 3"
    },
    {
      title: "🍜 Almuerzo a Domicilio",
      text: "Buenas, me gustaría ordenar 2 Chaulafanes especiales (código 25) y una gaseosa de 1 litro (código 72) a domicilio para Av. Amazonas N32 y Eloy Alfaro"
    },
    {
      title: "💵 Seleccionar Efectivo",
      text: "1"
    },
    {
      title: "🏦 Seleccionar Transferencia",
      text: "2"
    },
    {
      title: "🛵 Comando Repartidor (Entregar)",
      text: "entregado [Código]"
    }
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start animate-in fade-in-50 duration-200">
      
      {/* Simulation configurations & Preset templates */}
      <div className="xl:col-span-1 space-y-5">
        
        {/* Presets and configuration */}
        <div className="bg-zinc-950/40 border border-zinc-900 p-5 rounded-2xl space-y-4">
          <div className="border-b border-zinc-900 pb-3">
            <h4 className="text-xs font-bold text-zinc-350 uppercase tracking-widest flex items-center gap-1.5">
              <Smartphone className="h-4 w-4 text-emerald-500" /> Remitente Simulado
            </h4>
            <p className="text-[10px] text-zinc-550 mt-1">Configura quién envía el mensaje por WhatsApp.</p>
          </div>

          <div className="space-y-3.5 text-xs">
            {/* Quick buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleSelectPreset("María López", "593987654322")}
                className={`py-2 px-3 rounded-lg border text-center transition-all cursor-pointer ${
                  senderPhone === '593987654322'
                    ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/60 font-bold'
                    : 'bg-zinc-900/50 text-zinc-400 border-zinc-850 hover:text-zinc-250'
                }`}
              >
                María (Cliente)
              </button>
              <button
                onClick={() => handleSelectPreset("Repartidor Juan", "593987654323")}
                className={`py-2 px-3 rounded-lg border text-center transition-all cursor-pointer ${
                  senderPhone === '593987654323'
                    ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/60 font-bold'
                    : 'bg-zinc-900/50 text-zinc-400 border-zinc-850 hover:text-zinc-250'
                }`}
              >
                Juan (Repartidor)
              </button>
            </div>

            {/* Custom Inputs */}
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Nombre del Perfil</label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-zinc-700 p-2 rounded-lg text-zinc-200 outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Teléfono de WhatsApp</label>
                <input
                  type="text"
                  value={senderPhone}
                  onChange={(e) => setSenderPhone(e.target.value)}
                  className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-zinc-700 p-2 rounded-lg text-zinc-200 font-mono outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Phone Number ID (Fijo)</label>
                <input
                  type="text"
                  value={phoneId}
                  onChange={(e) => setPhoneId(e.target.value)}
                  className="w-full bg-zinc-900/30 border border-zinc-850 p-2 rounded-lg text-zinc-500 font-mono outline-none cursor-not-allowed"
                  readOnly
                />
              </div>
            </div>
          </div>
        </div>

        {/* Templates Panel */}
        <div className="bg-zinc-950/40 border border-zinc-900 p-5 rounded-2xl space-y-4">
          <div className="border-b border-zinc-900 pb-3">
            <h4 className="text-xs font-bold text-zinc-350 uppercase tracking-widest flex items-center gap-1.5">
              <Info className="h-4 w-4 text-emerald-500" /> Plantillas de Prueba
            </h4>
            <p className="text-[10px] text-zinc-550 mt-1">Haz clic para rellenar la entrada y enviar rápidamente.</p>
          </div>

          <div className="space-y-2 text-xs">
            {templates.map((tpl, idx) => (
              <button
                key={idx}
                onClick={() => {
                  if (tpl.text.includes("[Código]")) {
                    const codeInput = prompt("Introduce el código del pedido (ej. QR-1002):");
                    if (codeInput) {
                      sendMessage(tpl.text.replace("[Código]", codeInput), 'text');
                    }
                  } else {
                    sendMessage(tpl.text, 'text');
                  }
                }}
                className="w-full text-left bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-900 hover:border-zinc-800 p-2.5 rounded-xl transition-all cursor-pointer space-y-1"
              >
                <div className="font-bold text-zinc-300 text-[11px]">{tpl.title}</div>
                <div className="text-[10px] text-zinc-550 italic line-clamp-2 leading-relaxed">
                  &quot;{tpl.text}&quot;
                </div>
              </button>
            ))}

            {/* Special Upload Receipt Button */}
            <button
              onClick={() => {
                const mockUrl = 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600';
                sendMessage('[Imagen de Comprobante]', 'image', mockUrl);
              }}
              className="w-full flex items-center justify-center gap-2 bg-emerald-950/20 text-emerald-400 border border-emerald-900/30 hover:border-emerald-800/80 p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              <ImageIcon className="h-4 w-4 shrink-0" />
              <span>Simular Subir Comprobante</span>
            </button>
          </div>
        </div>

      </div>

      {/* Mock WhatsApp Mobile Chat Window */}
      <div className="xl:col-span-2 flex justify-center">
        
        {/* Smartphone Shell Frame */}
        <div className="max-w-[420px] w-full bg-[#0b141a] border-[8px] border-zinc-900 rounded-[40px] shadow-2xl flex flex-col overflow-hidden relative min-h-[580px] md:min-h-[640px] aspect-[9/18]">
          
          {/* Phone camera notch */}
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 h-5 w-32 bg-zinc-900 rounded-b-2xl z-20 flex items-center justify-center">
            <span className="h-1.5 w-1.5 bg-zinc-800 rounded-full"></span>
          </div>

          {/* WhatsApp Header */}
          <div className="bg-[#128c7e] text-white pt-7 pb-3.5 px-4 flex items-center gap-3 shrink-0 shadow-md z-10 relative">
            <div className="h-9 w-9 rounded-full bg-teal-800 border border-teal-700/60 flex items-center justify-center text-sm font-bold text-teal-200">
              <User className="h-4.5 w-4.5" />
            </div>
            <div>
              <h5 className="text-xs font-bold tracking-wide line-clamp-1">{senderName}</h5>
              <p className="text-[9px] text-teal-150 flex items-center gap-1 font-medium mt-0.5">
                <span className="h-1.5 w-1.5 bg-emerald-350 rounded-full animate-pulse"></span>
                {isTyping ? 'Escribiendo...' : 'En línea'}
              </p>
            </div>
            <span className="ml-auto text-[9px] font-bold bg-teal-900/40 py-0.5 px-2 rounded-full border border-teal-800/30 text-teal-150 tracking-wider">
              WHATSAPP BOT
            </span>
          </div>

          {/* Chat Window Message Area */}
          <div 
            className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col relative"
            style={{
              backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")',
              backgroundSize: 'contain',
              backgroundRepeat: 'repeat',
            }}
          >
            {/* Dark tint overlay */}
            <div className="absolute inset-0 bg-[#090e11]/92 pointer-events-none"></div>

            {/* Render messages */}
            {messages.map((msg) => {
              if (msg.type === 'system') {
                return (
                  <div key={msg.id} className="relative mx-auto my-1.5 max-w-[85%] bg-zinc-900/90 text-zinc-400 border border-zinc-850 p-2 rounded-lg text-center text-[10px] leading-relaxed shadow-sm z-10">
                    {msg.text}
                  </div>
                );
              }

              const isBot = msg.sender === 'bot';
              return (
                <div 
                  key={msg.id}
                  className={`relative max-w-[80%] rounded-xl px-3 py-2 text-xs shadow-sm flex flex-col gap-1 z-10 ${
                    isBot 
                      ? 'self-start bg-[#202c33] text-zinc-150 rounded-tl-none' 
                      : 'self-end bg-[#005c4b] text-white rounded-tr-none'
                  }`}
                >
                  {/* Image bubble */}
                  {msg.type === 'image' && msg.imageUrl && (
                    <div className="rounded-lg overflow-hidden border border-emerald-950/40 mb-1 max-w-[180px]">
                      <img 
                        src={msg.imageUrl} 
                        alt="Comprobante" 
                        className="w-full h-auto object-cover max-h-[140px] hover:scale-105 transition-all"
                      />
                    </div>
                  )}

                  {/* Message body with parsed markdown-like bold strings */}
                  <p className="leading-relaxed whitespace-pre-wrap font-medium">
                    {msg.text.split(/(\*[^*]+\*)/g).map((part, i) => {
                      if (part.startsWith('*') && part.endsWith('*')) {
                        return <strong key={i} className="font-extrabold text-white">{part.slice(1, -1)}</strong>;
                      }
                      return part;
                    })}
                  </p>

                  <div className="flex items-center gap-1 self-end text-[8px] text-zinc-400 font-medium">
                    <span>{msg.timestamp}</span>
                    {!isBot && (
                      <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb] shrink-0" />
                    )}
                  </div>
                </div>
              );
            })}

            {/* Bot Typing Bubble Indicator */}
            {isTyping && (
              <div className="relative self-start bg-[#202c33] text-zinc-400 rounded-xl rounded-tl-none px-3.5 py-3 shadow-sm z-10 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 bg-zinc-550 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="h-1.5 w-1.5 bg-zinc-550 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="h-1.5 w-1.5 bg-zinc-550 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Chat Window Footer Input */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(inputValue, 'text');
            }}
            className="bg-[#202c33] p-2.5 flex items-center gap-2 shrink-0 z-10"
          >
            <input
              type="text"
              placeholder="Escribe un mensaje de WhatsApp..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="flex-1 bg-[#2a3942] border border-[#2a3942] focus:border-zinc-700/60 p-2.5 rounded-full text-xs text-zinc-150 outline-none transition-all placeholder:text-zinc-550"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isTyping}
              className="h-9 w-9 bg-[#00a884] disabled:bg-zinc-800 disabled:text-zinc-650 hover:bg-[#009c7a] rounded-full flex items-center justify-center text-white shadow-md cursor-pointer transition-all shrink-0"
            >
              <Send className="h-4.5 w-4.5" />
            </button>
          </form>

        </div>

      </div>

    </div>
  );
}
