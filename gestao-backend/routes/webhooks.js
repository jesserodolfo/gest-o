const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const db      = require('../db');

// ── HELPER: salvar pedido vindo de webhook ─────────────
function salvarPedidoWebhook(dados) {
  const { nome, tel, valor, status, plataforma, plataforma_id, pagamento, rastreio, atendente_nome } = dados;

  // Verificar se já existe pelo ID da plataforma
  if (plataforma_id) {
    const existe = db.prepare('SELECT id FROM pedidos WHERE plataforma_id = ? AND plataforma = ?').get(plataforma_id, plataforma);
    if (existe) {
      db.prepare(`
        UPDATE pedidos SET status=?, rastreio=?, updated_at=datetime('now') WHERE id=?
      `).run(status || 'AGENDADO', rastreio || '', existe.id);
      db.prepare('INSERT INTO historico (pedido_id, texto) VALUES (?,?)').run(
        existe.id, `[Webhook ${plataforma}] Status atualizado: ${status}`
      );
      return { acao: 'atualizado', id: existe.id };
    }
  }

  // Novo pedido
  const r = db.prepare(`
    INSERT INTO pedidos (nome,tel,valor,status,plataforma,plataforma_id,pagamento,rastreio,
      atendente_nome,dataPedido,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
  `).run(
    nome||'Desconhecido', tel||'', valor||0,
    status||'AGENDADO', plataforma||'', plataforma_id||'',
    pagamento||'', rastreio||'',
    atendente_nome||'Michele'
  );

  db.prepare('INSERT INTO historico (pedido_id, texto) VALUES (?,?)').run(
    r.lastInsertRowid, `[Webhook] Pedido recebido via ${plataforma}`
  );

  return { acao: 'criado', id: r.lastInsertRowid };
}

// ══ BRAIP ══════════════════════════════════════════════
router.post('/braip', express.json(), (req, res) => {
  console.log('[Webhook Braip]', JSON.stringify(req.body).slice(0,200));
  try {
    const b = req.body;
    const dados = {
      nome:        b.subscriber_name || b.name || 'Desconhecido',
      tel:         b.subscriber_phone || b.phone || '',
      valor:       parseFloat(b.sale_amount || b.value || 0),
      status:      mapBraip(b.sale_status || b.status),
      plataforma:  'Braip',
      plataforma_id: b.transaction || b.sale_id || '',
      pagamento:   b.payment_type || '',
    };
    const r = salvarPedidoWebhook(dados);
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[Braip Error]', e.message);
    res.status(500).json({ error: e.message });
  }
});

function mapBraip(s) {
  const m = { approved:'AGENDADO', refused:'CANCELADO', refunded:'EM DEVOLUÇÃO', chargeback:'ADVOGADO', waiting:'FUTURO' };
  return m[s] || 'AGENDADO';
}

// ══ PAYT ═══════════════════════════════════════════════
router.post('/payt', express.json(), (req, res) => {
  console.log('[Webhook Payt]', JSON.stringify(req.body).slice(0,200));
  try {
    const b = req.body;
    const dados = {
      nome:        b.customer?.name || b.name || 'Desconhecido',
      tel:         b.customer?.phone || b.phone || '',
      valor:       parseFloat(b.amount || b.value || 0) / 100,
      status:      mapPayt(b.status || b.event),
      plataforma:  'Payt',
      plataforma_id: b.id || b.order_id || '',
      pagamento:   b.payment_method === 'credit_card' ? 'PAGO CARTÃO' : b.payment_method === 'pix' ? 'PAGO PIX' : 'AFTER PAY',
      rastreio:    b.tracking_code || '',
    };
    const r = salvarPedidoWebhook(dados);
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[Payt Error]', e.message);
    res.status(500).json({ error: e.message });
  }
});

function mapPayt(s) {
  const m = {
    paid:'AGENDADO', approved:'AGENDADO', pending:'FUTURO',
    cancelled:'CANCELADO', refunded:'EM DEVOLUÇÃO', shipped:'PAD', delivered:'PAD - PAGO'
  };
  return m[s] || 'AGENDADO';
}

// ══ LOGZZ ══════════════════════════════════════════════
router.post('/logzz', express.json(), (req, res) => {
  console.log('[Webhook Logzz]', JSON.stringify(req.body).slice(0,200));
  try {
    const b = req.body;
    const dados = {
      nome:        b.customer_name || b.name || 'Desconhecido',
      tel:         b.customer_phone || b.phone || '',
      valor:       parseFloat(b.amount || 0),
      status:      mapLogzz(b.status),
      plataforma:  'Logzz',
      plataforma_id: b.order_id || b.id || '',
      pagamento:   b.payment_method || 'AFTER PAY',
    };
    const r = salvarPedidoWebhook(dados);
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function mapLogzz(s) {
  const m = { paid:'AGENDADO', pending:'FUTURO', cancelled:'CANCELADO', refunded:'EM DEVOLUÇÃO' };
  return m[s] || 'AGENDADO';
}

// ══ COINZZ ═════════════════════════════════════════════
router.post('/coinzz', express.json(), (req, res) => {
  console.log('[Webhook Coinzz]', JSON.stringify(req.body).slice(0,200));
  try {
    const b = req.body;
    const dados = {
      nome:        b.buyer_name || b.name || 'Desconhecido',
      tel:         b.buyer_phone || b.phone || '',
      valor:       parseFloat(b.price || b.amount || 0),
      status:      mapLogzz(b.status),
      plataforma:  'Coinzz',
      plataforma_id: b.transaction_id || b.id || '',
      pagamento:   b.payment_type || 'AFTER PAY',
    };
    const r = salvarPedidoWebhook(dados);
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══ 123LOG (Postback de rastreio) ══════════════════════
router.post('/rastreio/123log', express.json(), (req, res) => {
  console.log('[Postback 123Log]', JSON.stringify(req.body).slice(0,300));

  // Validar Chave Única
  const chaveRecebida = req.headers['x-123log-key'] || req.body.chave_unica || req.query.key;
  const chaveEsperada = process.env.WEBHOOK_SECRET_123LOG;
  if (chaveEsperada && chaveRecebida !== chaveEsperada) {
    console.warn('[123Log] Chave inválida recebida:', chaveRecebida);
    return res.status(401).json({ error: 'Chave inválida.' });
  }

  try {
    const b = req.body;
    // 123Log envia: codigo_rastreio, status, descricao, data_evento, pedido_id
    const rastreio   = b.codigo_rastreio || b.tracking_code || '';
    const statusRaw  = b.status || b.situacao || '';
    const descricao  = b.descricao || b.description || statusRaw;

    if (!rastreio) return res.status(400).json({ error: 'Código de rastreio ausente.' });

    // Buscar pedido pelo código de rastreio
    const pedido = db.prepare('SELECT * FROM pedidos WHERE rastreio = ?').get(rastreio);

    if (!pedido) {
      console.log('[123Log] Pedido não encontrado para rastreio:', rastreio);
      return res.json({ ok: true, info: 'Pedido não encontrado, ignorado.' });
    }

    // Mapear status 123Log → status do CRM
    const novoStatus = map123Log(statusRaw);

    db.prepare(`
      UPDATE pedidos SET status=?, updated_at=datetime('now') WHERE id=?
    `).run(novoStatus, pedido.id);

    db.prepare('INSERT INTO historico (pedido_id, texto) VALUES (?,?)').run(
      pedido.id,
      `[123Log] ${descricao} — ${new Date().toLocaleDateString('pt-BR')}`
    );

    console.log(`[123Log] Pedido ${pedido.id} atualizado → ${novoStatus}`);
    res.json({ ok: true, pedido_id: pedido.id, status: novoStatus });
  } catch (e) {
    console.error('[123Log Error]', e.message);
    res.status(500).json({ error: e.message });
  }
});

function map123Log(s) {
  const sl = (s || '').toLowerCase();
  if (sl.includes('entregue') || sl.includes('delivered'))    return 'PAD - PAGO';
  if (sl.includes('saiu') || sl.includes('rota'))             return 'PAD';
  if (sl.includes('postado') || sl.includes('coletado'))      return 'PAD';
  if (sl.includes('devolu') || sl.includes('retorno'))        return 'EM DEVOLUÇÃO';
  if (sl.includes('extravi') || sl.includes('perdido'))       return 'RETIRAR CORREIOS';
  if (sl.includes('canc'))                                     return 'CANCELADO';
  return 'PAD'; // em trânsito por padrão
}

// ══ ENDPOINT DE TESTE ══════════════════════════════════
router.get('/ping', (req, res) => {
  res.json({ ok: true, message: 'Webhooks ativos!', timestamp: new Date().toISOString() });
});

module.exports = router;
