// src/app/api/sri/test-connection/route.ts
// POST /api/sri/test-connection
// Tests the connection to the official SRI Web Services (PRUEBAS environment)
// and validates the digital certificate.

import { NextResponse } from 'next/server';
import { signXml } from '@/lib/sri/firma';
import { enviarComprobante, consultarAutorizacion } from '@/lib/sri/soap';
import forge from 'node-forge';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { p12B64, pwd, ambiente } = await request.json();

    if (!p12B64 || !pwd) {
      return NextResponse.json({ error: 'Falta la firma digital (.p12) o la contraseña de la misma.' }, { status: 400 });
    }

    const targetAmbiente = ambiente === 2 ? 2 : 1;

    // 1. Validate certificate locally using node-forge
    let subject = '';
    let expira = '';
    try {
      const p12Der = forge.util.decode64(p12B64);
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, pwd);
      
      // Get certificate details
      const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const certBag = bags[forge.pki.oids.certBag]?.[0];
      if (!certBag || !certBag.cert) {
        throw new Error('No se encontró el certificado dentro del archivo .p12.');
      }
      
      const cert = certBag.cert;
      const validTo = cert.validity.notAfter;
      expira = validTo.toISOString();
      
      // Extract common name from subject
      const cnAttr = cert.subject.getField('CN');
      subject = cnAttr ? String(cnAttr.value) : 'Desconocido';
    } catch (certErr: any) {
      return NextResponse.json({ 
        success: false, 
        error: `Firma digital inválida o contraseña incorrecta: ${certErr.message}` 
      }, { status: 422 });
    }

    // 2. Query official SRI celcer.sri.gob.ec (PRUEBAS) or cel.sri.gob.ec (PRODUCCIÓN)
    // We send a dummy query with a 49-digit access key of all zeros (or formatted).
    // The SRI server should answer. Even if it says "CLAVE NO ENCONTRADA" (which is expected),
    // it confirms the connection, SOAP client, SSL/TLS handshake and SRI server response work!
    const dummyAccessKey = '1806202601179000000000110010010000000011234567813'; // Valid 49-digit Mod11 key
    let sriMessages = '';

    try {
      const res = await consultarAutorizacion(dummyAccessKey, targetAmbiente);
      sriMessages = res.estado || 'Respuesta Recibida';
    } catch (sriErr: any) {
      // If it's a SOAP connection error or timeout
      return NextResponse.json({
        success: false,
        certificate: { subject, expira },
        error: `Error al conectar con los servidores del SRI en ambiente ${targetAmbiente === 2 ? 'PRODUCCIÓN' : 'PRUEBAS'}: ${sriErr.message}`
      });
    }

    return NextResponse.json({
      success: true,
      certificate: {
        subject,
        expira,
        isExpired: new Date(expira) < new Date()
      },
      sriConnection: {
        status: 'OK',
        environment: targetAmbiente === 2 ? 'PRODUCCIÓN (cel.sri.gob.ec)' : 'PRUEBAS (celcer.sri.gob.ec)',
        sriResponse: `Servidores del SRI respondieron correctamente en ambiente de ${targetAmbiente === 2 ? 'PRODUCCIÓN' : 'PRUEBAS'} (Handshake exitoso).`
      }
    });

  } catch (error: any) {
    console.error('Error in SRI connection test:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}
