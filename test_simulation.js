import { config } from './src/config.js';

const SERVER_URL = `http://localhost:${config.port}/webhook`;

// Payloads idênticos aos exemplos fornecidos na imagem da Sendhook
const payloadMembroAdicionado = {
  id: "D6E5A03BC13366DA",
  event: "group.updated.members.added",
  data: {
    campaignId: "AAAAAAAAAAAAAAAAAAAAAA",
    campaignName: "Campanha Natal",
    groupName: "Grupo de Natal #1",
    groupJid: "000000000000000000@g.us",
    groupId: "000000000000000000",
    number: "5511999990001",
    createdAt: new Date().toISOString(),
    createdAt_with_timezone_br: "2026-10-21T16:00:00.000-03:00"
  },
  version: "1.0.0"
};

const payloadMembroRemovido = {
  id: "341961EAFB39271D",
  event: "group.updated.members.removed",
  data: {
    campaignId: "AAAAAAAAAAAAAAAAAAAAAA",
    campaignName: "Campanha Natal",
    groupName: "Grupo de Natal #1",
    groupJid: "000000000000000000@g.us",
    groupId: "000000000000000000",
    number: "5511999990001",
    createdAt: new Date().toISOString(),
    createdAt_with_timezone_br: "2026-10-21T16:05:00.000-03:00"
  },
  version: "1.0.0"
};

async function enviarTeste(nome, payload) {
  console.log(`\n⏳ Enviando teste: [${nome}] para ${SERVER_URL}...`);
  try {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (config.sendtok) {
      headers['sendtok'] = config.sendtok;
    }

    const response = await fetch(SERVER_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const resJson = await response.json();
    console.log(`Status HTTP: ${response.status}`);
    console.log(`Resposta do Servidor:`, resJson);
  } catch (err) {
    console.error(`❌ Erro ao enviar teste:`, err.message);
  }
}

async function run() {
  console.log('🧪 INICIANDO TESTE DOS WEBHOOKS SENDFLOW...');
  await enviarTeste('1. Membro Adicionado', payloadMembroAdicionado);
  await new Promise(r => setTimeout(r, 1000));
  await enviarTeste('2. Membro Removido', payloadMembroRemovido);
  console.log('\n✅ Teste finalizado!');
}

run();
