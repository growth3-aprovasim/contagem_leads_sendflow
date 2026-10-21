import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import webhookRoutes from './routes/webhookRoutes.js';

const app = express();

// Middlewares essenciais
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rotas da aplicação
app.use(webhookRoutes);

// Rota 404 padrão
app.use((req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    dica: 'O webhook do Sendflow deve enviar requisições POST para /webhook'
  });
});

// Middleware de tratamento global de erros
app.use((err, req, res, next) => {
  console.error('[ERRO INTERNO]', err);
  res.status(500).json({
    error: 'Ocorreu um erro no servidor.',
    message: err.message
  });
});

// Inicialização do servidor
app.listen(config.port, () => {
  console.log('====================================================');
  console.log('🚀 SERVIDOR SENDHOOK - CONTAGEM LEADS SENDFLOW');
  console.log('====================================================');
  console.log(`📡 Servidor ativo na porta: ${config.port}`);
  console.log(`🔗 Webhook URL Local: http://localhost:${config.port}/webhook`);
  console.log(`💚 Healthcheck:        http://localhost:${config.port}/health`);
  console.log(`📊 Estatísticas:       http://localhost:${config.port}/stats`);
  console.log('----------------------------------------------------');
  
  if (!config.supabaseUrl || !config.supabaseKey) {
    console.warn('⚠️  ATENÇÃO: SUPABASE_URL ou SUPABASE_KEY não configuradas no arquivo .env!');
    console.warn('👉 Abra o arquivo .env e preencha as credenciais do seu Supabase.');
  } else {
    console.log(`🗄️  Supabase conectado em: ${config.supabaseUrl}`);
    console.log(`📋 Tabela configurada:    ${config.supabaseTable}`);
  }

  if (config.sendtok) {
    console.log(`🔒 Proteção SENDTOK ativada: ${config.sendtok.substring(0, 8)}...`);
  } else {
    console.log('🔓 Proteção SENDTOK desativada (aceitando todas as origens)');
  }
  console.log('====================================================');
});
