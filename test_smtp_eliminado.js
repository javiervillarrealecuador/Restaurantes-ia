// Prueba: verifica que /api/sri/test-smtp fue eliminado
const https = require('https');

const options = {
  hostname: 'restaurante-ia-sand.vercel.app',
  path: '/api/sri/test-smtp',
  method: 'GET'
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Codigo HTTP:', res.statusCode);
    if (res.statusCode === 404) {
      console.log('\n RESULTADO: CORRECTO - El endpoint ya no existe en produccion.');
    } else {
      console.log('\n RESULTADO: PENDIENTE - El endpoint sigue activo (status ' + res.statusCode + '). Verifica que el deploy se completó.');
    }
  });
});

req.end();
