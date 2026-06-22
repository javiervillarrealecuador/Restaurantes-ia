const forge = require('node-forge');
const fs = require('fs');

const XMLNS = 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:etsi="http://uri.etsi.org/01903/v1.3.2#"';

function sha256B64(input) {
  const md = forge.md.sha256.create(); md.update(input, 'utf8');
  return forge.util.encode64(md.digest().getBytes());
}
function wrap76(b64) { return b64.match(/.{1,76}/g)?.join('\n') || b64; }
function rand(max=999000) { return Math.floor(Math.random()*max)+990; }

// ─── Cargar certificado ───────────────────────────────────────────────────────
const p12B64 = fs.readFileSync('C:\\DESCARGAS NUEVAS\\997515524593512350360116819.p12', 'base64');
const password = 'Fiama97324582@@';

const der = forge.util.decode64(p12B64);
const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), password);

const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
const privateKey = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0].key;

const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
const cert = certBags.find(b => {
  const pub = b.cert?.publicKey;
  return pub?.n && privateKey.n && pub.n.compareTo(privateKey.n) === 0;
})?.cert || certBags[0].cert;

const certAsn1  = forge.pki.certificateToAsn1(cert);
const certDer   = forge.asn1.toDer(certAsn1).getBytes();
const certDerB64 = forge.util.encode64(certDer);

const mdCert = forge.md.sha256.create(); mdCert.update(certDer);
const certHashB64 = forge.util.encode64(mdCert.digest().getBytes());

const pub = cert.publicKey;
let nHex = pub.n.toString(16); if (nHex.length % 2) nHex = '0' + nHex;
const modulusB64 = forge.util.encode64(forge.util.hexToBytes(nHex));
let eHex = pub.e.toString(16); if (eHex.length % 2) eHex = '0' + eHex;
const exponentB64 = forge.util.encode64(forge.util.hexToBytes(eHex));

const issuerName   = cert.issuer.attributes.map(a => `${a.shortName || a.name || '?'}=${a.value}`).join(',');
const serialDecimal = BigInt('0x' + cert.serialNumber).toString(10);

console.log('Certificado cargado:');
console.log('  Titular:', cert.subject.getField('CN')?.value || cert.subject.getField('O')?.value);
console.log('  Vence  :', cert.validity.notAfter.toISOString().slice(0,10));

// ─── Firmar XML ───────────────────────────────────────────────────────────────
const unsignedXml = fs.readFileSync('C:\\RESTAURANTES\\unsigned_real.xml', 'utf8');

// Extraer claveAcceso del XML para consultarla luego
const claveAcceso = unsignedXml.match(/<claveAcceso>([^<]+)<\/claveAcceso>/)?.[1];
console.log('\nclaveAcceso:', claveAcceso);

const sId=rand(), siId=rand(), spId=rand(), spRefId=rand();
const cId=rand(), refId=rand(), objId=rand();

const docCanonical = unsignedXml.replace(/<\?xml[^?]*\?>\s*/, '').trim();
const docDigest    = sha256B64(docCanonical);

const now = new Date(Date.now() - 5 * 3600 * 1000);
const signingTime  = now.toISOString().slice(0, 19) + 'Z';

const signedProperties =
  `<etsi:SignedProperties Id="Signature${sId}-SignedProperties${spId}">` +
  `<etsi:SignedSignatureProperties>` +
  `<etsi:SigningTime>${signingTime}</etsi:SigningTime>` +
  `<etsi:SigningCertificate><etsi:Cert>` +
  `<etsi:CertDigest>` +
  `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
  `<ds:DigestValue>${certHashB64}</ds:DigestValue>` +
  `</etsi:CertDigest>` +
  `<etsi:IssuerSerial>` +
  `<ds:X509IssuerName>${issuerName}</ds:X509IssuerName>` +
  `<ds:X509SerialNumber>${serialDecimal}</ds:X509SerialNumber>` +
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

const spDigest = sha256B64(signedProperties.replace('<etsi:SignedProperties ', `<etsi:SignedProperties ${XMLNS} `));

const keyInfo =
`<ds:KeyInfo Id="Certificate${cId}">
<ds:X509Data>
<ds:X509Certificate>
${wrap76(certDerB64)}
</ds:X509Certificate>
</ds:X509Data>
<ds:KeyValue>
<ds:RSAKeyValue>
<ds:Modulus>
${wrap76(modulusB64)}
</ds:Modulus>
<ds:Exponent>${exponentB64}</ds:Exponent>
</ds:RSAKeyValue>
</ds:KeyValue>
</ds:KeyInfo>`;

const kiDigest = sha256B64(keyInfo.replace('<ds:KeyInfo ', `<ds:KeyInfo ${XMLNS} `));

const signedInfo =
`<ds:SignedInfo Id="Signature-SignedInfo${siId}">
<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>
<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></ds:SignatureMethod>
<ds:Reference Id="SignedPropertiesID${spRefId}" Type="http://uri.etsi.org/01903#SignedProperties" URI="#Signature${sId}-SignedProperties${spId}">
<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>
<ds:DigestValue>${spDigest}</ds:DigestValue>
</ds:Reference>
<ds:Reference URI="#Certificate${cId}">
<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>
<ds:DigestValue>${kiDigest}</ds:DigestValue>
</ds:Reference>
<ds:Reference Id="Reference-ID-${refId}" URI="#comprobante">
<ds:Transforms>
<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform>
</ds:Transforms>
<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>
<ds:DigestValue>${docDigest}</ds:DigestValue>
</ds:Reference>
</ds:SignedInfo>`;

const md = forge.md.sha256.create();
md.update(signedInfo.replace('<ds:SignedInfo ', `<ds:SignedInfo ${XMLNS} `), 'utf8');
const signatureB64 = forge.util.encode64(privateKey.sign(md));

const signature =
`<ds:Signature ${XMLNS} Id="Signature${sId}">
${signedInfo}
<ds:SignatureValue>
${wrap76(signatureB64)}
</ds:SignatureValue>
${keyInfo}
<ds:Object Id="Signature${sId}-Object${objId}"><etsi:QualifyingProperties Target="#Signature${sId}">${signedProperties}</etsi:QualifyingProperties></ds:Object></ds:Signature>`;

const closeTag = `</${unsignedXml.match(/<\/(\w+)>\s*$/)?.[1]}>`;
const idx      = unsignedXml.lastIndexOf(closeTag);
const signedXml = unsignedXml.slice(0, idx) + signature + unsignedXml.slice(idx);

fs.writeFileSync('C:\\RESTAURANTES\\signed_test.xml', signedXml, 'utf8');
console.log('signed_test.xml creado —', signedXml.length, 'chars');

// ─── Helpers SOAP ─────────────────────────────────────────────────────────────
const BASE = 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws';

function extractTag(xml, tag) {
  return xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() || null;
}
function extractAll(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map(m => m[1].trim());
}
function parseMensajes(xml) {
  const ids    = extractAll(xml, 'identificador');
  const textos = extractAll(xml, 'mensaje');
  const infos  = extractAll(xml, 'informacionAdicional');
  return ids.map((id, i) =>
    `  [${id}] ${textos[i] || ''}${infos[i] ? ' — ' + infos[i] : ''}`
  );
}

async function soapPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    body,
  });
  return res.text();
}

// ─── PASO 1: Recepción ────────────────────────────────────────────────────────
(async () => {
  console.log('\n── PASO 1: Enviando al SRI (recepción) ──');
  const xmlB64   = Buffer.from(signedXml, 'utf8').toString('base64');
  const envRecep =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">` +
    `<soapenv:Header/><soapenv:Body>` +
    `<ec:validarComprobante><xml>${xmlB64}</xml></ec:validarComprobante>` +
    `</soapenv:Body></soapenv:Envelope>`;

  const respRecep = await soapPost(`${BASE}/RecepcionComprobantesOffline`, envRecep);
  const estadoRecep = extractTag(respRecep, 'estado') || 'SIN RESPUESTA';
  console.log('Estado recepción:', estadoRecep);
  parseMensajes(respRecep).forEach(m => console.log(m));

  if (estadoRecep !== 'RECIBIDA') {
    console.log('\n✗ El SRI devolvió el comprobante. No se consulta autorización.');
    return;
  }

  // ─── PASO 2: Esperar y consultar autorización ───────────────────────────────
  const ESPERA_SEG = 5;
  console.log(`\n── PASO 2: Esperando ${ESPERA_SEG}s y consultando autorización ──`);
  await new Promise(r => setTimeout(r, ESPERA_SEG * 1000));

  const envAuth =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">` +
    `<soapenv:Header/><soapenv:Body>` +
    `<ec:autorizacionComprobante><claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante></ec:autorizacionComprobante>` +
    `</soapenv:Body></soapenv:Envelope>`;

  const respAuth    = await soapPost(`${BASE}/AutorizacionComprobantesOffline`, envAuth);
  const estadoAuth  = extractTag(respAuth, 'estado') || 'EN PROCESO';
  const nroAut      = extractTag(respAuth, 'numeroAutorizacion');
  const fechaAut    = extractTag(respAuth, 'fechaAutorizacion');

  console.log('Estado autorización:', estadoAuth);
  if (nroAut)   console.log('Número autorización:', nroAut);
  if (fechaAut) console.log('Fecha autorización :', fechaAut);
  parseMensajes(respAuth).forEach(m => console.log(m));

  if (estadoAuth === 'AUTORIZADO') {
    console.log('\n✓ FACTURA AUTORIZADA EXITOSAMENTE');
  } else {
    console.log('\n✗ No autorizado — revisa los mensajes anteriores');
  }
})().catch(e => console.error('Error:', e.message));
