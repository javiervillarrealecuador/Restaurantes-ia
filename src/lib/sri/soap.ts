// src/lib/sri/soap.ts
// FASE 3 — Cliente SOAP del SRI (esquema offline).

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
  const out: string[] = [];
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  let match;
  while ((match = regex.exec(xml)) !== null) {
    out.push(match[1].trim());
  }
  return out;
}

function parseMensajes(resp: string): string[] {
  const out: string[] = [];
  const ids    = extractAll(resp, 'identificador');
  
  const textos: string[] = [];
  const msgRegex = /<mensaje>([^<]+)<\/mensaje>/g;
  let msgMatch;
  while ((msgMatch = msgRegex.exec(resp)) !== null) {
    textos.push(msgMatch[1].trim());
  }
  
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
