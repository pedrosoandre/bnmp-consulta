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
