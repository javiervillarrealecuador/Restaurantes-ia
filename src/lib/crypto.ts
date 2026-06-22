// src/lib/crypto.ts
// Cifrado AES-256-GCM para datos sensibles (firma .p12, contraseñas SMTP)
// Usa la variable de entorno P12_ENCRYPTION_KEY como clave maestra.

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const hex = process.env.P12_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('P12_ENCRYPTION_KEY no configurada o inválida. Debe ser un string hexadecimal de 64 caracteres.');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Cifra un texto plano.
 * Devuelve un string con formato: iv:authTag:datos  (todo en hex)
 */
export function encryptValue(plainText: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Descifra un valor cifrado con encryptValue.
 * Si el valor no tiene el formato esperado (ej: datos legados sin cifrar), los devuelve tal cual.
 */
export function decryptValue(encrypted: string): string {
  // Si no tiene el formato iv:authTag:datos, asumir que es texto plano legado
  const parts = encrypted.split(':');
  if (parts.length !== 3) return encrypted;

  try {
    const key = getKey();
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const data = Buffer.from(parts[2], 'hex');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(data),
      decipher.final()
    ]).toString('utf8');
  } catch {
    // Si falla el descifrado, devolver el valor original (dato legado)
    return encrypted;
  }
}
