// Teste manual: fala com o servidor instalado como o Claude Desktop faria (não roda no npm test).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const [servidor, nome, pasta] = process.argv.slice(2);
const t = new StdioClientTransport({ command: process.execPath, args: [servidor], env: { ...process.env, BNMP_PASTA: pasta }, stderr: 'inherit' });
const c = new Client({ name: 'teste-manual', version: '0' });
await c.connect(t);
const ini = await c.callTool({ name: 'consultar_mandados_bnmp', arguments: { nome, baixar_pdfs: true } });
console.log('INICIAR (' + (ini.isError ? 'erro' : 'ok') + '):\n' + ini.content[0].text + '\n');
for (let i = 1; i <= 12; i++) {
  const t0 = Date.now();
  const r = await c.callTool({ name: 'resultado_consulta_bnmp', arguments: {} }, undefined, { timeout: 60_000 });
  const txt = r.content[0].text;
  console.log(`RESULTADO #${i} (${Math.round((Date.now() - t0) / 1000)} s):\n${txt}\n`);
  if (!txt.startsWith('status: em_andamento')) break;
}
await c.close();
