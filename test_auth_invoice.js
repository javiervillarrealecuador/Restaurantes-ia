// Prueba: verifica que /api/sri/invoice requiere autenticacion
const https = require('https');

const options = {
  hostname: 'restaurante-ia-sand.vercel.app',
  path: '/api/sri/invoice',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Codigo HTTP:', res.statusCode);
    console.log('Respuesta: ', data);
    if (res.statusCode === 401) {
      console.log('\n RESULTADO: FIX ACTIVO - El endpoint rechaza solicitudes sin autenticacion.');
    } else {
      console.log('\n RESULTADO: FIX NO APLICADO - El endpoint procesa sin autenticacion (status ' + res.statusCode + ').');
    }
  });
});

req.write(JSON.stringify({ orderId: 'test' }));
req.end();
