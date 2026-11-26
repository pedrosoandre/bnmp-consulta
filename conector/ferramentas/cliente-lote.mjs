// Teste manual do lote: um captcha para vários nomes, pelo mesmo protocolo do Claude Desktop.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const pasta = process.argv[2];
const nomes = process.argv.slice(3);
const t = new StdioClientTransport({ command: process.execPath, args: ['server/index.js'], env: { ...process.env, BNMP_PASTA: pasta }, stderr: 'inherit' });
const c = new Client({ name: 'teste-lote', version: '0' });
await c.connect(t);
const ini = await c.callTool({ name: 'consultar_mandados_bnmp_em_lote', arguments: { nomes, baixar_pdfs: false, max_paginas: 1 } });
console.log('INICIAR:\n' + ini.content[0].text + '\n');
for (let i = 1; i <= 40; i++) {
  const r = await c.callTool({ name: 'resultado_consulta_bnmp', arguments: {} }, undefined, { timeout: 60_000 });
  const txt = r.content[0].text;
  if (txt.startsWith('status: em_andamento')) { console.log(`#${i} ${txt.split('\n')[0]}`); continue; }
  console.log('\nFINAL:\n' + txt);
  break;
}
await c.close();
