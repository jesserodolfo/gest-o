// keep-alive.js — roda como Cron Job no Render
// Faz ping no backend a cada 10 minutos para não dormir

const https = require('https');

const BACKEND_URL = 'https://gestao-pedidos-vf86.onrender.com/health';

function ping() {
  const req = https.get(BACKEND_URL, (res) => {
    console.log(`[${new Date().toLocaleTimeString('pt-BR')}] Ping OK — status ${res.statusCode}`);
  });
  req.on('error', (e) => {
    console.log(`[${new Date().toLocaleTimeString('pt-BR')}] Ping falhou: ${e.message}`);
  });
  req.end();
}

// Ping imediato e depois a cada 10 minutos
ping();
setInterval(ping, 10 * 60 * 1000);

console.log('Keep-alive iniciado — ping a cada 10 minutos');
