const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { auth, adminOnly } = require('./auth');

// ── ADS CAMPANHAS ──────────────────────────────────────
router.get('/ads', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM ads_campanhas ORDER BY data DESC').all();
  res.json(rows);
});

router.post('/ads', auth, adminOnly, (req, res) => {
  const { data, campanha, gasto, leads, cliques, impressoes } = req.body;
  if (!data || !campanha) return res.status(400).json({ error: 'Data e campanha obrigatórios.' });
  const r = db.prepare(
    'INSERT INTO ads_campanhas (data,campanha,gasto,leads,cliques,impressoes) VALUES (?,?,?,?,?,?)'
  ).run(data, campanha, gasto||0, leads||0, cliques||0, impressoes||0);
  res.json({ id: r.lastInsertRowid });
});

router.put('/ads/:id', auth, adminOnly, (req, res) => {
  const { data, campanha, gasto, leads, cliques, impressoes } = req.body;
  db.prepare(
    'UPDATE ads_campanhas SET data=?,campanha=?,gasto=?,leads=?,cliques=?,impressoes=? WHERE id=?'
  ).run(data, campanha, gasto||0, leads||0, cliques||0, impressoes||0, req.params.id);
  res.json({ ok: true });
});

router.delete('/ads/:id', auth, adminOnly, (req, res) => {
  db.prepare('DELETE FROM ads_campanhas WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── CONFIGURAÇÕES (webhook keys, rastreio tokens) ──────
router.get('/config', auth, adminOnly, (req, res) => {
  const rows = db.prepare('SELECT chave, valor FROM config').all();
  const cfg = {};
  rows.forEach(r => { cfg[r.chave] = r.valor; });
  // Nunca retornar senhas em claro
  const seguras = ['wh_braip','wh_payt','wh_logzz','wh_coinzz'];
  seguras.forEach(k => { if (cfg[k]) cfg[k] = '••••••••'; });
  res.json(cfg);
});

router.post('/config', auth, adminOnly, (req, res) => {
  const entries = Object.entries(req.body);
  const upsert = db.prepare('INSERT OR REPLACE INTO config (chave, valor) VALUES (?,?)');
  const tx = db.transaction(() => {
    entries.forEach(([k, v]) => upsert.run(k, v));
  });
  tx();
  res.json({ ok: true, saved: entries.length });
});

module.exports = router;
