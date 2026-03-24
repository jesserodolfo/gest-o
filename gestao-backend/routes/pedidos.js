const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { auth, adminOnly } = require('./auth');

// ── LISTAR PEDIDOS ─────────────────────────────────────
router.get('/', auth, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  let sql = `
    SELECT p.*, GROUP_CONCAT(h.texto || '||' || h.created_at, ';;;') as historico_raw
    FROM pedidos p
    LEFT JOIN historico h ON h.pedido_id = p.id
  `;
  const params = [];
  if (!isAdmin) {
    sql += ' WHERE p.atendente_nome = ?';
    params.push(req.user.nome);
  }
  sql += ' GROUP BY p.id ORDER BY p.dataPedido DESC, p.id DESC';

  const rows = db.prepare(sql).all(...params);
  const pedidos = rows.map(p => ({
    ...p,
    historico: p.historico_raw
      ? p.historico_raw.split(';;;').map(h => { const [texto] = h.split('||'); return texto; })
      : []
  }));
  delete pedidos.forEach(p => delete p.historico_raw);
  res.json(pedidos);
});

// ── CRIAR PEDIDO ───────────────────────────────────────
router.post('/', auth, (req, res) => {
  const d = req.body;
  const atendente = req.user.role === 'admin'
    ? (d.atendente_nome || req.user.nome)
    : req.user.nome;

  const r = db.prepare(`
    INSERT INTO pedidos (nome,tel,dataPedido,proximoContato,qtd,valor,status,
      atendente_nome,pagamento,lembrete,rastreio,previsaoEntrega,transportadora,obs,plataforma,plataforma_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    d.nome, d.tel||'', d.dataPedido||new Date().toISOString().slice(0,10),
    d.proximoContato||'', d.qtd||null, d.valor||null,
    d.status||'AGENDADO', atendente, d.pagamento||'',
    d.lembrete||null, d.rastreio||'', d.previsaoEntrega||'',
    d.transportadora||'', d.obs||'', d.plataforma||'', d.plataforma_id||''
  );

  db.prepare('INSERT INTO historico (pedido_id, texto) VALUES (?,?)').run(
    r.lastInsertRowid, 'Pedido criado em ' + new Date().toLocaleDateString('pt-BR')
  );

  res.json({ id: r.lastInsertRowid, ...d, atendente_nome: atendente });
});

// ── ATUALIZAR PEDIDO ───────────────────────────────────
router.put('/:id', auth, (req, res) => {
  const d = req.body;
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });

  // Atendente só edita seus próprios pedidos
  if (req.user.role !== 'admin' && pedido.atendente_nome !== req.user.nome)
    return res.status(403).json({ error: 'Sem permissão.' });

  db.prepare(`
    UPDATE pedidos SET
      nome=?, tel=?, dataPedido=?, proximoContato=?, qtd=?, valor=?, status=?,
      atendente_nome=?, pagamento=?, lembrete=?, rastreio=?, previsaoEntrega=?,
      transportadora=?, obs=?, contatoFeitoEm=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    d.nome||pedido.nome, d.tel||pedido.tel, d.dataPedido||pedido.dataPedido,
    d.proximoContato||'', d.qtd||pedido.qtd, d.valor||pedido.valor,
    d.status||pedido.status,
    req.user.role==='admin' ? (d.atendente_nome||pedido.atendente_nome) : pedido.atendente_nome,
    d.pagamento||pedido.pagamento, d.lembrete||pedido.lembrete,
    d.rastreio||pedido.rastreio, d.previsaoEntrega||pedido.previsaoEntrega,
    d.transportadora||pedido.transportadora, d.obs||pedido.obs,
    d.contatoFeitoEm||pedido.contatoFeitoEm,
    req.params.id
  );

  if (d._historico) {
    db.prepare('INSERT INTO historico (pedido_id, texto) VALUES (?,?)').run(req.params.id, d._historico);
  }

  res.json({ ok: true });
});

// ── MARCAR CONTATO FEITO ───────────────────────────────
router.post('/:id/contato', auth, (req, res) => {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });

  const hoje = new Date().toISOString().slice(0,10);
  let proximoContato = '';
  if (pedido.lembrete) {
    const next = new Date();
    next.setDate(next.getDate() + parseInt(pedido.lembrete));
    proximoContato = next.toISOString().slice(0,10);
  }

  db.prepare(`
    UPDATE pedidos SET contatoFeitoEm=?, proximoContato=?, updated_at=datetime('now') WHERE id=?
  `).run(hoje, proximoContato, req.params.id);

  const hora = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
  db.prepare('INSERT INTO historico (pedido_id, texto) VALUES (?,?)').run(
    req.params.id,
    `Contato feito em ${new Date().toLocaleDateString('pt-BR')} às ${hora}`
  );

  res.json({ ok: true, proximoContato });
});

// ── HISTÓRICO DO PEDIDO ────────────────────────────────
router.get('/:id/historico', auth, (req, res) => {
  const hist = db.prepare('SELECT * FROM historico WHERE pedido_id = ? ORDER BY created_at ASC').all(req.params.id);
  res.json(hist);
});

module.exports = router;
