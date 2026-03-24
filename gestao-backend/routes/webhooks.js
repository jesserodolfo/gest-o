const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ── HELPER: normalizar texto para comparação ───────────
function norm(s) {
  return (s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]/g,' ')
    .replace(/\s+/g,' ').trim();
}

// ── HELPER: normalizar telefone ────────────────────────
function normTel(s) {
  return (s||'').replace(/\D/g,'').slice(-8); // últimos 8 dígitos
}

// ══ 123LOG — Postback de rastreio ══════════════════════
router.post('/rastreio/123log', express.json(), (req, res) => {
  console.log('[Postback 123Log]', JSON.stringify(req.body).slice(0,400));

  // Validar Chave Única
  const chaveRecebida = req.headers['x-123log-key'] 
    || req.headers['x-api-key']
    || req.body.chave_unica 
    || req.query.key 
    || req.query.chave;
  const chaveEsperada = process.env.WEBHOOK_SECRET_123LOG;
  
  if (chaveEsperada && chaveRecebida && chaveRecebida !== chaveEsperada) {
    console.warn('[123Log] Chave invalida:', chaveRecebida);
    return res.status(401).json({ error: 'Chave invalida.' });
  }

  try {
    const b = req.body;

    // Campos que a 123Log envia no postback
    const rastreio   = b.codigo_rastreio || b.tracking_code || b.codigo || b.rastreio || '';
    const nomeDestinatario = b.destinatario || b.nome_destinatario || b.nome || b.name || '';
    const telDestinatario  = b.telefone || b.fone || b.phone || b.celular || '';
    const statusRaw  = b.status || b.situacao || b.descricao_status || '';
    const descricao  = b.descricao || b.description || b.ocorrencia || statusRaw;
    const previsao   = b.previsao_entrega || b.data_previsao || b.eta || '';

    console.log(`[123Log] Rastreio: ${rastreio} | Nome: ${nomeDestinatario} | Tel: ${telDestinatario} | Status: ${statusRaw}`);

    if (!rastreio && !nomeDestinatario && !telDestinatario) {
      return res.status(400).json({ error: 'Nenhum dado identificador recebido.' });
    }

    let pedido = null;
    let metodoBusca = '';

    // 1. Buscar pelo código de rastreio
    if (rastreio) {
      pedido = db.prepare('SELECT * FROM pedidos WHERE rastreio = ?').get(rastreio);
      if (pedido) metodoBusca = 'rastreio';
    }

    // 2. Buscar pelo telefone (últimos 8 dígitos)
    if (!pedido && telDestinatario) {
      const telNorm = normTel(telDestinatario);
      if (telNorm.length >= 7) {
        const todos = db.prepare("SELECT * FROM pedidos WHERE status NOT IN ('CANCELADO','COMPLETO','PAD - PAGO')").all();
        pedido = todos.find(p => normTel(p.tel) === telNorm);
        if (pedido) metodoBusca = 'telefone';
      }
    }

    // 3. Buscar pelo nome do destinatário
    if (!pedido && nomeDestinatario) {
      const nomeNorm = norm(nomeDestinatario);
      const todos = db.prepare("SELECT * FROM pedidos WHERE status NOT IN ('CANCELADO')").all();
      
      // Busca exata primeiro
      pedido = todos.find(p => norm(p.nome) === nomeNorm);
      if (pedido) metodoBusca = 'nome-exato';
      
      // Busca parcial — nome contém pelo menos 2 palavras em comum
      if (!pedido) {
        const palavrasNome = nomeNorm.split(' ').filter(w => w.length > 3);
        pedido = todos.find(p => {
          const palavrasPedido = norm(p.nome).split(' ').filter(w => w.length > 3);
          const matches = palavrasNome.filter(w => palavrasPedido.includes(w));
          return matches.length >= 2;
        });
        if (pedido) metodoBusca = 'nome-parcial';
      }
    }

    // 4. Se não achou — registrar mas não criar duplicata
    if (!pedido) {
      console.log(`[123Log] Pedido nao encontrado para: rastreio=${rastreio} nome=${nomeDestinatario} tel=${telDestinatario}`);
      // Salvar em log para análise
      db.prepare("INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)").run(
        '123log_nao_encontrado_' + Date.now(),
        JSON.stringify({ rastreio, nome: nomeDestinatario, tel: telDestinatario, status: statusRaw, data: new Date().toISOString() })
      );
      return res.json({ 
        ok: false, 
        info: 'Pedido nao encontrado — cadastre manualmente ou verifique o nome/telefone.',
        dados_recebidos: { rastreio, nome: nomeDestinatario, tel: telDestinatario }
      });
    }

    console.log(`[123Log] Pedido encontrado por ${metodoBusca}: ID=${pedido.id} | ${pedido.nome}`);

    // Mapear status 123Log → status CRM
    const novoStatus = map123Log(statusRaw);

    // Atualizar pedido
    const updates = [];
    const params  = [];

    if (novoStatus && novoStatus !== pedido.status) {
      updates.push('status=?');
      params.push(novoStatus);
    }
    if (rastreio && rastreio !== pedido.rastreio) {
      updates.push('rastreio=?');
      params.push(rastreio);
    }
    if (previsao && previsao !== pedido.previsaoEntrega) {
      updates.push('previsaoEntrega=?');
      params.push(previsao);
    }
    if (!pedido.transportadora) {
      updates.push('transportadora=?');
      params.push('123Log');
    }

    if (updates.length > 0) {
      updates.push("updated_at=datetime('now')");
      params.push(pedido.id);
      db.prepare(`UPDATE pedidos SET ${updates.join(',')} WHERE id=?`).run(...params);
    }

    // Registrar no histórico
    const dataEvento = b.data_evento || b.data || new Date().toLocaleDateString('pt-BR');
    db.prepare('INSERT INTO historico (pedido_id, texto) VALUES (?,?)').run(
      pedido.id,
      `[123Log] ${descricao || statusRaw} — ${dataEvento} (via ${metodoBusca})`
    );

    console.log(`[123Log] Pedido ${pedido.id} atualizado: status=${novoStatus} rastreio=${rastreio}`);

    res.json({ 
      ok: true, 
      pedido_id: pedido.id,
      nome: pedido.nome,
      status_anterior: pedido.status,
      status_novo: novoStatus,
      rastreio,
      metodo_busca: metodoBusca
    });

  } catch (e) {
    console.error('[123Log Error]', e.message);
    res.status(500).json({ error: e.message });
  }
});

function map123Log(s) {
  const sl = (s||'').toLowerCase();
  if (sl.includes('entregue') || sl.includes('delivered'))           return 'PAD - PAGO';
  if (sl.includes('saiu para entrega') || sl.includes('rota'))       return 'PAD';
  if (sl.includes('postado') || sl.includes('coletado'))             return 'PAD';
  if (sl.includes('em transito') || sl.includes('transporte'))       return 'PAD';
  if (sl.includes('devolu') || sl.includes('retorno'))               return 'EM DEVOLUÇÃO';
  if (sl.includes('extravi') || sl.includes('perdido'))              return 'RETIRAR CORREIOS';
  if (sl.includes('aguardando retirada') || sl.includes('retirar'))  return 'RETIRAR CORREIOS';
  if (sl.includes('canc'))                                           return 'CANCELADO';
  return null; // não altera o status se não reconhecer
}

// ══ ENDPOINT DE TESTE ══════════════════════════════════
router.get('/ping', (req, res) => {
  res.json({ 
    ok: true, 
    message: 'Webhooks ativos!',
    endpoints: {
      '123log': '/webhook/rastreio/123log',
      braip:    '/webhook/braip',
      payt:     '/webhook/payt',
      logzz:    '/webhook/logzz',
      coinzz:   '/webhook/coinzz'
    },
    timestamp: new Date().toISOString() 
  });
});

// ══ BRAIP ══════════════════════════════════════════════
router.post('/braip', express.json(), (req, res) => {
  console.log('[Webhook Braip]', JSON.stringify(req.body).slice(0,200));
  res.json({ ok: true, info: 'Recebido — use cadastro manual por enquanto.' });
});

// ══ PAYT ═══════════════════════════════════════════════
router.post('/payt', express.json(), (req, res) => {
  console.log('[Webhook Payt]', JSON.stringify(req.body).slice(0,200));
  res.json({ ok: true, info: 'Recebido — use cadastro manual por enquanto.' });
});

// ══ LOGZZ ══════════════════════════════════════════════
router.post('/logzz', express.json(), (req, res) => {
  console.log('[Webhook Logzz]', JSON.stringify(req.body).slice(0,200));
  res.json({ ok: true, info: 'Recebido — use cadastro manual por enquanto.' });
});

// ══ COINZZ ═════════════════════════════════════════════
router.post('/coinzz', express.json(), (req, res) => {
  console.log('[Webhook Coinzz]', JSON.stringify(req.body).slice(0,200));
  res.json({ ok: true, info: 'Recebido — use cadastro manual por enquanto.' });
});

module.exports = router;
