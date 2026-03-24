const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// ── LOGIN ──────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email e senha obrigatórios.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND ativo = 1').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });

  const ok = bcrypt.compareSync(password, user.password);
  if (!ok)  return res.status(401).json({ error: 'Usuário ou senha incorretos.' });

  const token = jwt.sign(
    { id: user.id, nome: user.nome, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, role: user.role } });
});

// ── MIDDLEWARE auth ────────────────────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token necessário.' });
  try {
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  next();
}

// ── LISTAR ATENDENTES (admin) ──────────────────────────
router.get('/atendentes', auth, adminOnly, (req, res) => {
  const lista = db.prepare(
    "SELECT id, nome, email, role, ativo, created_at FROM users WHERE role = 'atendente' ORDER BY nome"
  ).all();
  res.json(lista);
});

// ── CRIAR ATENDENTE (admin) ────────────────────────────
router.post('/atendentes', auth, adminOnly, (req, res) => {
  const { nome, email, password } = req.body;
  if (!nome || !email || !password)
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  const existe = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existe) return res.status(409).json({ error: 'E-mail já cadastrado.' });
  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare("INSERT INTO users (nome, email, password, role) VALUES (?,?,?,'atendente')").run(nome, email.toLowerCase(), hash);
  res.json({ id: r.lastInsertRowid, nome, email, role: 'atendente' });
});

// ── REMOVER ATENDENTE (admin) ──────────────────────────
router.delete('/atendentes/:id', auth, adminOnly, (req, res) => {
  db.prepare('UPDATE users SET ativo = 0 WHERE id = ? AND role = ?').run(req.params.id, 'atendente');
  res.json({ ok: true });
});

// ── ALTERAR SENHA ──────────────────────────────────────
router.post('/senha', auth, (req, res) => {
  const { senha_atual, nova_senha } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(senha_atual, user.password))
    return res.status(400).json({ error: 'Senha atual incorreta.' });
  const hash = bcrypt.hashSync(nova_senha, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ ok: true });
});

module.exports = { router, auth, adminOnly };
