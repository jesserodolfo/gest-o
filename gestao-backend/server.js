require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

// ── CORS: permitir o frontend acessar ─────────────────
app.use(cors({
  origin: '*', // Em produção: coloque a URL do seu frontend
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// ── BODY PARSERS ───────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── SERVIR FRONTEND (opcional) ─────────────────────────
// Se quiser servir o HTML pelo mesmo servidor:
const frontendPath = path.join(__dirname, 'public');
const fs = require('fs');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

// ── LOG de requests ────────────────────────────────────
app.use((req, res, next) => {
  if (!req.path.includes('/favicon')) {
    console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${req.method} ${req.path}`);
  }
  next();
});

// ── INICIALIZAR BANCO ──────────────────────────────────
require('./db');

// ── ROTAS ──────────────────────────────────────────────
const { router: authRouter } = require('./routes/auth');
app.use('/api/auth',     authRouter);
app.use('/api/pedidos',  require('./routes/pedidos'));
app.use('/api',          require('./routes/dados'));
app.use('/webhook',      require('./routes/webhooks'));

// ── HEALTH CHECK ───────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()) + 's'
  });
});

// ── 404 ────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

// ── ERROS ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Erro]', err.message);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

// ── INICIAR ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 GestãoPedidos Backend rodando na porta ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Webhook 123Log: http://localhost:${PORT}/webhook/rastreio/123log`);
  console.log(`   Webhook Braip:  http://localhost:${PORT}/webhook/braip`);
  console.log(`   Webhook Payt:   http://localhost:${PORT}/webhook/payt\n`);
});
