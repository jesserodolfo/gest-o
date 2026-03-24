# GestãoPedidos — Backend

Backend Node.js para o sistema de gestão de pedidos.
Recebe webhooks da 123Log, Braip, Payt, Logzz e Coinzz.

## Deploy no Render.com (gratuito)

### Passo 1 — Criar conta e repositório
1. Crie uma conta em https://render.com (use o Google)
2. Crie uma conta no GitHub em https://github.com (se não tiver)
3. Crie um repositório novo no GitHub chamado `gestao-pedidos-backend`
4. Faça upload de todos os arquivos desta pasta para o repositório

### Passo 2 — Conectar ao Render
1. No Render, clique em **New → Web Service**
2. Conecte sua conta do GitHub
3. Selecione o repositório `gestao-pedidos-backend`
4. Configure:
   - **Name**: gestao-pedidos
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

### Passo 3 — Variáveis de ambiente
No Render, vá em **Environment** e adicione:

| Variável | Valor |
|----------|-------|
| `JWT_SECRET` | Clique em "Generate" |
| `ADMIN_EMAIL` | jesserodolfo@yahoo.com.br |
| `ADMIN_PASSWORD` | Sua senha |
| `WEBHOOK_SECRET_123LOG` | 5fa3a3a3bb7d78d4a3fa97c1c98439fc8920c63a26960f3bc374f85f31c23441 |

### Passo 4 — Disco para o banco de dados
No Render, vá em **Disks** e adicione:
- **Name**: db
- **Mount Path**: /data
- **Size**: 1 GB (gratuito)

Adicione também a variável: `DB_PATH=/data/gestao.db`

### Passo 5 — Deploy
Clique em **Create Web Service**. O Render fará o deploy automaticamente.
Sua URL será algo como: `https://gestao-pedidos.onrender.com`

## URLs dos Webhooks (usar no painel de cada plataforma)

Substitua `SEU-APP` pelo nome do seu serviço no Render:

| Plataforma | URL do Webhook |
|-----------|----------------|
| **123Log** | `https://SEU-APP.onrender.com/webhook/rastreio/123log` |
| **Braip** | `https://SEU-APP.onrender.com/webhook/braip` |
| **Payt** | `https://SEU-APP.onrender.com/webhook/payt` |
| **Logzz** | `https://SEU-APP.onrender.com/webhook/logzz` |
| **Coinzz** | `https://SEU-APP.onrender.com/webhook/coinzz` |

## Testar se está funcionando

Acesse no navegador:
```
https://SEU-APP.onrender.com/health
```

Deve retornar:
```json
{"status":"ok","timestamp":"...","uptime":"..."}
```

## API Endpoints

### Autenticação
- `POST /api/auth/login` — Login

### Pedidos
- `GET /api/pedidos` — Listar pedidos
- `POST /api/pedidos` — Criar pedido
- `PUT /api/pedidos/:id` — Atualizar pedido
- `POST /api/pedidos/:id/contato` — Marcar contato feito

### Anúncios
- `GET /api/ads` — Listar campanhas
- `POST /api/ads` — Criar campanha

## Nota sobre plano gratuito do Render
O plano gratuito "dorme" após 15 minutos sem uso.
A primeira requisição pode demorar ~30 segundos para "acordar".
Para evitar isso, faça upgrade para o plano Starter (~R$ 25/mês).
