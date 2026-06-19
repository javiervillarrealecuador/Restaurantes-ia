// src/lib/sri/firma.ts
// FASE 2 — Firma XAdES-BES para comprobantes electrónicos SRI.
// Algoritmos: RSA-SHA1, digest SHA1, canonicalización c14n 2001.

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
  const emisor = cert.issuer.attributes.map((a: any) => `${a.shortName || a.name || '?'}=${a.value}`).join(', ');
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
    .map((a: any) => `${a.shortName || a.name || '?'}=${a.value}`).join(',');

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
</ds:KeyInfo>`.replace(/\r\n/g, '\n');

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
</ds:SignedInfo>`.replace(/\r\n/g, '\n');

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
<ds:Object Id="Signature${sId}-Object${objId}"><etsi:QualifyingProperties Target="#Signature${sId}">${signedProperties}</etsi:QualifyingProperties></ds:Object></ds:Signature>`.replace(/\r\n/g, '\n');

  const rootMatch = unsignedXml.match(/<\/(\w+)>\s*$/);
  if (!rootMatch) throw new Error('No se pudo identificar la etiqueta raíz del comprobante.');
  const closeTag = `</${rootMatch[1]}>`;
  const idx = unsignedXml.lastIndexOf(closeTag);
  return unsignedXml.slice(0, idx) + signature + unsignedXml.slice(idx);
}
