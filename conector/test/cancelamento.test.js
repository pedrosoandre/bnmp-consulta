// Cancelar enquanto o navegador ainda está abrindo: a janela tem de fechar e a consulta tem de parar,
// sem ir ao portal nem gravar arquivo (antes, o aviso de cancelamento chegava tarde e se perdia).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarExecutor, criarExecutorLote } from '../server/consulta.js';

// Janela falsa que só fica pronta depois de `ms`. A página nunca carrega: se a consulta
// seguir adiante depois do cancelamento, ela fica presa esperando (como esperaria o captcha).
function janelaLenta(ms) {
  const janela = { fechada: 0 };
  const nunca = () => new Promise(() => {});
  const page = {
    goto: nunca, bringToFront: nunca, evaluate: nunca, waitForTimeout: nunca,
    locator: () => ({ waitFor: nunca, fill: nunca, first: () => ({ click: nunca }) }),
  };
  const abrir = () => new Promise(ok => setTimeout(() => ok({
    page, fechar: async () => { janela.fechada++; },
  }), ms));
  return { janela, abrir };
}

const noMaximo = (p, ms) => Promise.race([
  p, new Promise((_, falha) => setTimeout(() => falha(new Error(`não terminou em ${ms} ms`)), ms)),
]);

test('cancelar enquanto o navegador abre fecha a janela e para a consulta', async t => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'bnmp-teste-'));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  const { janela, abrir } = janelaLenta(30);
  const executar = criarExecutor({ pastaSaida: pasta, abrirJanela: abrir });
  const ctl = new AbortController();
  const consulta = executar('Maria da Silva', { sinal: ctl.signal }, () => {});
  ctl.abort();
  await assert.rejects(noMaximo(consulta, 500), /cancelada/);
  assert.equal(janela.fechada, 1);
  assert.deepEqual(fs.readdirSync(pasta), []);
});

test('cancelar o lote enquanto o navegador abre fecha a janela e não grava arquivo', async t => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'bnmp-teste-'));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  const { janela, abrir } = janelaLenta(30);
  const executarLote = criarExecutorLote({ pastaSaida: pasta, abrirJanela: abrir });
  const ctl = new AbortController();
  const lote = executarLote(['Ana Souza', 'Bruno Lima'], { sinal: ctl.signal }, () => {});
  ctl.abort();
  await assert.rejects(noMaximo(lote, 500), /cancelada/);
  assert.equal(janela.fechada, 1);
  assert.deepEqual(fs.readdirSync(pasta), []);
});
