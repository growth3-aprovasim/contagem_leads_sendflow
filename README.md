# 🚀 Servidor Sendhook para Contagem de Leads (Sendflow -> Supabase)

Servidor para receber os webhooks do **Sendhook (Sendflow)** e registrar automaticamente na sua tabela **`leads_grupos`** no **Supabase**.

---

## 🎯 Mapeamento Exato para a Tabela `leads_grupos`

Conforme a sua estrutura, o servidor grava apenas os dados solicitados:

| Coluna no Supabase | Tipo | Origem no Sendhook | Descrição / Exemplo |
| :--- | :--- | :--- | :--- |
| `nome_campanha` | `text` | `data.campaignName` | Ex: `"Campanha Natal"` |
| `id_campanha` | `text` | `data.campaignId` | Ex: `"AAAAAAAAAAAAAAAAAAAAAA"` |
| `nome_grupo` | `text` | `data.groupName` | Ex: `"Grupo de Natal #1"` |
| `ent_sai` | `text` | Evento | **"Entrou"** se adicionado / **"Saiu"** se removido |
| `numero_lead` | `text` | `data.number` | Ex: `"5511999990001"` |
| `timestamp` | `timestamptz`| `data.createdAt` | Data e hora do evento |
| `id` | `uuid` | *(automático)* | Gerado automaticamente pelo Supabase |

---

## 📁 Estrutura do Projeto

```text
Contagem Leads Sendflow/
├── src/
│   ├── index.js                     # Ponto de entrada do servidor Express
│   ├── config.js                    # Configurações e variáveis do .env
│   ├── supabase.js                  # Conexão com o Supabase
│   ├── controllers/
│   │   └── webhookController.js     # Tratamento das requisições e logs
│   ├── middlewares/
│   │   └── authMiddleware.js        # Validação do token SENDTOK
│   ├── routes/
│   │   └── webhookRoutes.js         # Rotas /webhook, /health e /stats
│   └── services/
│       └── leadsService.js          # Mapeia e grava na tabela leads_grupos
├── supabase/
│   └── functions/
│       └── sendflow-webhook/        # Edge Function alternativa para rodar no Supabase
├── supabase_schema.sql              # Views opcionais de contagem para o Supabase
├── test_simulation.js               # Script de teste real
├── .env                             # Suas credenciais já configuradas
├── .env.example                     # Exemplo do arquivo de ambiente
└── package.json                     # Dependências instaladas
```

---

## ⚡ Como Iniciar o Servidor

No terminal da pasta do projeto:

```bash
npm start
```
Ou em modo de desenvolvimento:
```bash
npm run dev
```

Você verá a confirmação no console:
```text
====================================================
🚀 SERVIDOR SENDHOOK - CONTAGEM LEADS SENDFLOW
====================================================
📡 Servidor ativo na porta: 3000
🔗 Webhook URL Local: http://localhost:3000/webhook
💚 Healthcheck:        http://localhost:3000/health
📊 Estatísticas:       http://localhost:3000/stats
----------------------------------------------------
🗄️  Supabase conectado em: https://bjfapsvlhojiouarbzap.supabase.co
📋 Tabela configurada:    leads_grupos
🔒 Proteção SENDTOK ativada: 5C976380...
====================================================
```

---

## 🧪 Como Testar

Com o servidor rodando, abra outro terminal e execute:
```bash
node test_simulation.js
```
O servidor receberá os eventos e gravará diretamente na sua tabela `leads_grupos`.
