// Prueba: verifica headers de seguridad HTTP
const https = require('https');

const options = {
  hostname: 'restaurante-ia-sand.vercel.app',
  path: '/',
  method: 'GET'
};

const esperados = [
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'strict-transport-security',
  'permissions-policy'
];

const req = https.request(options, (res) => {
  console.log('=== Headers de seguridad ===\n');
  let todos = true;
  for (const h of esperados) {
    const valor = res.headers[h];
    if (valor) {
      console.log('OK  ' + h + ': ' + valor);
    } else {
      console.log('FALTA  ' + h);
      todos = false;
    }
  }
  console.log(todos ? '\nRESULTADO: TODOS LOS HEADERS ACTIVOS.' : '\nRESULTADO: FALTAN HEADERS. Verifica el deploy.');
});

req.end();
