// Sobe o servidor de verdade (stdio) e conversa por MCP, sem abrir navegador nem ir à rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('servidor expõe as 3 ferramentas, recusa curinga e responde "ocioso"', async () => {
  const transporte = new StdioClientTransport({ command: process.execPath, args: ['server/index.js'] });
  const cliente = new Client({ name: 'teste', version: '0' });
  await cliente.connect(transporte);
  try {
    const { tools } = await cliente.listTools();
    assert.deepEqual(tools.map(t => t.name).sort(),
      ['cancelar_consulta_bnmp', 'consultar_mandados_bnmp', 'resultado_consulta_bnmp']);
    const curinga = await cliente.callTool({ name: 'consultar_mandados_bnmp', arguments: { nome: '*' } });
    assert.equal(curinga.isError, true);
    assert.match(curinga.content[0].text, /curinga/i);
    const r = await cliente.callTool({ name: 'resultado_consulta_bnmp', arguments: {} });
    assert.match(r.content[0].text, /não há consulta/i);
  } finally {
    await cliente.close();
  }
});
