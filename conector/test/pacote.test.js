// O pacote .mcpb leva tudo da pasta: arquivo vazio perdido (sobra de comando de terminal) não pode entrar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('pasta do conector não tem arquivos vazios fora de node_modules', () => {
  const vazios = [];
  const andar = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) andar(p); else if (fs.statSync(p).size === 0) vazios.push(p);
    }
  };
  andar(path.resolve(import.meta.dirname, '..'));
  assert.deepEqual(vazios, []);
});

// O manifesto promete uma versão mínima do Node: ela não pode ser menor que a exigida pelas dependências.
test('versão mínima do Node no manifesto cobre a das dependências', () => {
  const raiz = path.resolve(import.meta.dirname, '..');
  const minimo = faixa => Number((/>=\s*(\d+)/.exec(faixa || '') || [])[1] || 0);
  const manifesto = JSON.parse(fs.readFileSync(path.join(raiz, 'manifest.json'), 'utf8'));
  const prometido = minimo(manifesto.compatibility.runtimes.node);
  const pacote = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
  const exigencias = Object.keys(pacote.dependencies).map(d => {
    const p = JSON.parse(fs.readFileSync(path.join(raiz, 'node_modules', d, 'package.json'), 'utf8'));
    return [d, minimo(p.engines && p.engines.node)];
  });
  const acima = exigencias.filter(([, v]) => v > prometido);
  assert.deepEqual(acima, [], `manifesto promete Node >=${prometido}`);
  assert.equal(minimo(pacote.engines.node), prometido, 'package.json e manifest.json devem dizer o mesmo');
});
