#!/usr/bin/env node
// Conector (servidor MCP local) do Claude Desktop: consulta mandados de prisão no BNMP (CNJ).
// Tudo que não for protocolo vai para stderr: stdout é o canal do MCP.
import os from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { GerenteDeConsulta } from './gerente.js';
import { criarExecutor, criarExecutorLote } from './consulta.js';
import { formatarEstado, formatarLote, respostaCurta } from './texto.js';

function pastaDeSaida() {
  const v = (process.env.BNMP_PASTA || '').trim();
  if (v && !v.includes('${')) return v; // "${user_config...}" sem valor chega literal
  return path.join(os.homedir(), 'Documents', 'BNMP consultas');
}

const pasta = pastaDeSaida();
const gerente = new GerenteDeConsulta({
  executar: criarExecutor({ pastaSaida: pasta }),
  executarLote: criarExecutorLote({ pastaSaida: pasta }),
});
const ESPERA_POR_CHAMADA_MS = 40_000;

const server = new McpServer({ name: 'bnmp-consulta', version: '0.3.2' });
const texto = t => ({ content: [{ type: 'text', text: t }] });

server.registerTool('consultar_mandados_bnmp', {
  title: 'Consultar mandados de prisão (BNMP/CNJ)',
  description:
    'Começa uma consulta de mandados de prisão por NOME no BNMP (Banco Nacional de Medidas Penais e Prisões, do CNJ). ' +
    'Abre o portal numa janela do Edge/Chrome no computador da pessoa e responde na hora. ' +
    'Depois de chamar: diga à pessoa para marcar "Não sou um robô" na janela que abriu e não fechar a janela; ' +
    'então chame resultado_consulta_bnmp (repita enquanto o status for "em_andamento"). ' +
    'Uma consulta por vez; curingas como * não são aceitos. O captcha é sempre resolvido pela pessoa.',
  inputSchema: {
    nome: z.string().max(120).describe('Nome completo da pessoa'),
    baixar_pdfs: z.boolean().optional().describe('Baixar o PDF oficial de cada mandado (padrão: não)'),
    max_paginas: z.number().int().min(1).max(10).optional().describe('Páginas de resultado a ler, 10 mandados cada (padrão 3)'),
    resposta_curta: z.boolean().optional().describe('Responder só SIM/NÃO (com nº de mandados e aviso de homônimo), sem a tabela. Use quando a pessoa só quer saber se há mandado para o nome.'),
  },
  annotations: { readOnlyHint: false, openWorldHint: true, idempotentHint: false, destructiveHint: false },
}, async ({ nome, baixar_pdfs, max_paginas, resposta_curta }) => {
  try {
    gerente.iniciar(nome, { baixarPdfs: !!baixar_pdfs, maxPaginas: max_paginas ?? 3, formato: resposta_curta ? 'curto' : 'completo' });
  } catch (e) {
    return { ...texto(String(e.message)), isError: true };
  }
  return texto(
    `Consulta iniciada para "${gerente.estado().nome}". Uma janela do navegador está abrindo com o portal do BNMP.\n` +
    'Peça à pessoa: marque "Não sou um robô" nessa janela e deixe-a aberta (ela fecha sozinha no fim).\n' +
    'Em seguida chame resultado_consulta_bnmp.');
});

server.registerTool('resultado_consulta_bnmp', {
  title: 'Resultado da consulta no BNMP',
  description:
    'Devolve o andamento ou o resultado da consulta iniciada com consultar_mandados_bnmp. Espera até ~40 s por chamada. ' +
    'Se o status for "em_andamento", chame de novo (a pessoa pode ainda estar marcando o captcha). ' +
    'Ao apresentar o resultado, sempre lembre que a busca é por nome e que homônimos são comuns.',
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async () => {
  const e = await gerente.aguardar(ESPERA_POR_CHAMADA_MS);
  const txt = (e.status === 'concluida' && !e.lote && e.formato === 'curto')
    ? respostaCurta(e.resultado)
    : (e.lote ? formatarLote(e) : formatarEstado(e));
  return { ...texto(txt), isError: e.status === 'erro' };
});

server.registerTool('consultar_mandados_bnmp_em_lote', {
  title: 'Consultar vários nomes no BNMP (um captcha para vários)',
  description:
    'Começa uma consulta de VÁRIOS nomes no BNMP numa só janela: a pessoa marca o captcha uma vez e o conector ' +
    'consulta os nomes em sequência, pedindo um novo captcha a cada 10 nomes (ou se a sessão cair). ' +
    'Use quando a pessoa der uma lista de nomes. Responde na hora; depois diga para marcar "Não sou um robô" ' +
    'e chame resultado_consulta_bnmp (repita enquanto o status for "em_andamento"). ' +
    'Curingas como * não são aceitos; nomes repetidos ou inválidos são descartados.',
  inputSchema: {
    nomes: z.array(z.string().max(120)).min(1).max(50).describe('Lista de nomes completos a consultar (até 50)'),
    baixar_pdfs: z.boolean().optional().describe('Baixar o PDF oficial de cada mandado (padrão: não)'),
    max_paginas: z.number().int().min(1).max(10).optional().describe('Páginas de resultado por nome (padrão 3)'),
  },
  annotations: { readOnlyHint: false, openWorldHint: true, idempotentHint: false, destructiveHint: false },
}, async ({ nomes, baixar_pdfs, max_paginas }) => {
  try {
    gerente.iniciarLote(nomes, { baixarPdfs: !!baixar_pdfs, maxPaginas: max_paginas ?? 3 });
  } catch (e) {
    return { ...texto(String(e.message)), isError: true };
  }
  return texto(
    `Lote iniciado (${gerente.estado().nome}). Uma janela do navegador está abrindo com o portal do BNMP.\n` +
    'Peça à pessoa: marque "Não sou um robô" nessa janela e deixe-a aberta. Um captcha vale para até 10 nomes; ' +
    'se houver mais, o portal pedirá o captcha de novo na mesma janela.\n' +
    'Em seguida chame resultado_consulta_bnmp (repita até concluir).');
});

server.registerTool('cancelar_consulta_bnmp', {
  title: 'Cancelar consulta no BNMP',
  description: 'Cancela a consulta em andamento e fecha a janela do navegador.',
  inputSchema: {},
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async () => {
  const r = gerente.cancelar();
  return texto(r.cancelada ? `Consulta de "${r.cancelada}" cancelada.` : 'Não havia consulta em andamento.');
});

await server.connect(new StdioServerTransport());
console.error(`bnmp-consulta pronto; resultados em ${pasta}`);
