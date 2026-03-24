require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Glitch usa .data/ como pasta persistente
const DB_PATH = process.env.DB_PATH || '.data/gestao.db';
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nome       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'atendente',
    ativo      INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS pedidos (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    nome             TEXT NOT NULL,
    tel              TEXT,
    dataPedido       TEXT,
    proximoContato   TEXT,
    qtd              INTEGER,
    valor            REAL,
    status           TEXT DEFAULT 'AGENDADO',
    atendente_nome   TEXT,
    pagamento        TEXT,
    lembrete         INTEGER,
    rastreio         TEXT,
    previsaoEntrega  TEXT,
    transportadora   TEXT,
    obs              TEXT,
    contatoFeitoEm   TEXT DEFAULT '',
    plataforma       TEXT DEFAULT '',
    plataforma_id    TEXT DEFAULT '',
    created_at       TEXT DEFAULT (datetime('now')),
    updated_at       TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS historico (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id  INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    texto      TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ads_campanhas (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    data       TEXT NOT NULL,
    campanha   TEXT NOT NULL,
    gasto      REAL DEFAULT 0,
    leads      INTEGER DEFAULT 0,
    cliques    INTEGER DEFAULT 0,
    impressoes INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS config (
    chave TEXT PRIMARY KEY,
    valor TEXT
  );
`);

const bcrypt = require('bcryptjs');

// Seed admin
const adminExiste = db.prepare("SELECT id FROM users WHERE role='admin'").get();
if (!adminExiste) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || '@j3ss3ac3rL', 10);
  db.prepare("INSERT INTO users (nome,email,password,role) VALUES (?,?,?,'admin')")
    .run('Jesse Rodolfo', process.env.ADMIN_EMAIL || 'jesserodolfo@yahoo.com.br', hash);
  console.log('Admin criado');
}

// Seed Michele
const micheleExiste = db.prepare("SELECT id FROM users WHERE email='michele@gestao.local'").get();
if (!micheleExiste) {
  const hash = bcrypt.hashSync('michele123', 10);
  db.prepare("INSERT INTO users (nome,email,password,role) VALUES ('Michele','michele@gestao.local',?,'atendente')")
    .run(hash);
  console.log('Michele criada');
}

module.exports = db;
