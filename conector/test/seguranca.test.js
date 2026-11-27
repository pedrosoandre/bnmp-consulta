// Proteções: limites de entrada, parada em 429, uma janela por vez e arquivos sem acentuação quebrada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarNome, nomeArquivo } from '../server/bnmp.js';
import { rodarLote } from '../server/lote.js';
import { GerenteDeConsulta } from '../server/gerente.js';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('validarNome recusa nome com mais de 120 caracteres', () => {
  assert.throws(() => validarNome('Maria '.repeat(30)), /longo/);
  assert.equal(validarNome('Maria da Silva'), 'Maria da Silva');
});

test('nomeArquivo limita o tamanho do nome do arquivo', () => {
  assert.ok(nomeArquivo('a'.repeat(500)).length <= 80);
});

test('lote para no primeiro 429, sem continuar batendo no portal', async () => {
  const buscados = [];
  const deps = {
    pausaMs: 0,
    maxPorCaptcha: 10,
    abrirSessao: async function abrir() {},
    pesquisar: async function pesquisar(nome) {
      buscados.push(nome);
      throw new Error('O portal pediu para desacelerar (429). Tente mais tarde.');
    },
  };
  const lote = await rodarLote({ nomes: ['Ana Souza', 'Bruno Lima', 'Carla Dias'], progresso() {}, deps });
  assert.deepEqual(buscados, ['Ana Souza']);
  assert.equal(lote.interrompido, true);
});

test('depois de cancelar, só abre outra consulta quando a janela antiga fechar', async () => {
  let liberar;
  const fechou = new Promise(function (ok) { liberar = ok; });
  const g = new GerenteDeConsulta({
    executar: function executar(nome, opcoes) {
      return new Promise(function (_ok, falha) {
        opcoes.sinal.addEventListener('abort', function () { fechou.then(function () { falha(new Error('cancelada')); }); });
      });
    },
  });
  g.iniciar('Maria da Silva');
  g.cancelar();
  assert.throws(() => g.iniciar('João Souza'), /fechando/);
  liberar();
  await new Promise(function (ok) { setTimeout(ok, 10); });
  assert.equal(g.iniciar('João Souza').status, 'em_andamento');
  g.cancelar();
});

test('código-fonte sem BOM e sem acentuação quebrada (UTF-8 lido como ANSI)', () => {
  const pastas = ['server', 'test', 'ferramentas'];
  const quebrados = [];
  for (const p of pastas) {
    for (const f of fs.readdirSync(path.join(raiz, p))) {
      const b = fs.readFileSync(path.join(raiz, p, f));
      const s = b.toString('utf8');
      if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) quebrados.push(`${p}/${f}: BOM`);
      if (/Ã[\u0080-¿§£©¡ª³µº¢]|Â[\u0080-¿]/.test(s)) quebrados.push(`${p}/${f}: acentuação quebrada`);
    }
  }
  assert.deepEqual(quebrados, []);
});
