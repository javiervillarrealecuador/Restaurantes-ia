// Prueba: verifica que los 3 endpoints SRI requieren autenticacion
const https = require('https');

function probar(path, method, body) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'restaurante-ia-sand.vercel.app',
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ path, status: res.statusCode }));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== Verificando endpoints SRI ===\n');
  const resultados = await Promise.all([
    probar('/api/sri/metadata', 'POST', { p12B64: 'test', pwd: 'test' }),
    probar('/api/sri/test-connection', 'POST', { p12B64: 'test', pwd: 'test' }),
    probar('/api/sri/next-seq?restaurantId=test', 'GET', null),
  ]);

  let todos = true;
  for (const r of resultados) {
    if (r.status === 401) {
      console.log('OK  ' + r.path);
    } else {
      console.log('FALTA  ' + r.path + ' (status ' + r.status + ')');
      todos = false;
    }
  }
  console.log(todos
    ? '\nRESULTADO: TODOS PROTEGIDOS.'
    : '\nRESULTADO: FALTAN ENDPOINTS. Verifica el deploy.');
}

main();
