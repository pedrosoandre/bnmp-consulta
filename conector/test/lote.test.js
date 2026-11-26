// Lote: um captcha serve para até N nomes. Testado com uma sessão e uma pesquisa falsas (sem navegador).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rodarLote } from '../server/lote.js';

function fakes({ pesquisar, maxPorCaptcha = 10, pausaMs = 0 } = {}) {
  const eventos = [];
  const deps = {
    pausaMs,
    maxPorCaptcha,
    abrirSessao: async () => { eventos.push('captcha'); },
    pesquisar: pesquisar || (async nome => { eventos.push('busca:' + nome); return { busca: nome, mandados: [], total_no_portal: 0 }; }),
  };
  return { deps, eventos };
}

const nomes10 = Array.from({ length: 10 }, (_, i) => `Pessoa Numero ${i}`);

test('um captcha cobre até 10 nomes (10 buscas, 1 captcha)', async () => {
  const { deps, eventos } = fakes();
  const r = await rodarLote({ nomes: nomes10, progresso() {}, sinal: null, deps });
  assert.equal(eventos.filter(e => e === 'captcha').length, 1);
  assert.equal(eventos.filter(e => e.startsWith('busca:')).length, 10);
  assert.equal(r.resultados.length, 10);
  assert.equal(r.resumo.consultados, 10);
  assert.equal(r.resumo.com_mandado, 0);
  assert.equal(r.resumo.captchas, 1);
});

test('o 11º nome pede um segundo captcha', async () => {
  const { deps, eventos } = fakes();
  await rodarLote({ nomes: [...nomes10, 'Decima Primeira Pessoa'], progresso() {}, sinal: null, deps });
  assert.equal(eventos.filter(e => e === 'captcha').length, 2);
});

test('nomes repetidos e inválidos não viram busca; inválidos entram como erro', async () => {
  const { deps, eventos } = fakes();
  const r = await rodarLote({ nomes: ['Maria da Silva', 'maria da silva', '*', 'ab'], progresso() {}, sinal: null, deps });
  assert.equal(eventos.filter(e => e.startsWith('busca:')).length, 1); // só uma Maria
  const invalidos = r.resultados.filter(x => x.erro);
  assert.equal(invalidos.length, 2);
  assert.match(invalidos.map(x => x.erro).join(' '), /curinga|letras/i);
});

test('sessão expirada (401) no meio refaz o captcha e repete o mesmo nome uma vez', async () => {
  let tentativasNoB = 0;
  const pesquisar = async nome => {
    if (nome === 'Pessoa B Sobrenome' && tentativasNoB++ === 0) throw new Error('O portal não aceitou a sessão (401): o captcha expirou.');
    return { busca: nome, mandados: [], total_no_portal: 0 };
  };
  const { deps, eventos } = fakes({ pesquisar });
  const r = await rodarLote({ nomes: ['Pessoa A Sobrenome', 'Pessoa B Sobrenome', 'Pessoa C Sobrenome'], progresso() {}, sinal: null, deps });
  assert.equal(eventos.filter(e => e === 'captcha').length, 2); // 1 inicial + 1 após o 401
  assert.equal(r.resultados.filter(x => x.resultado).length, 3); // todos concluídos
  assert.equal(r.resumo.captchas, 2);
});

test('falha de portal na busca vira falha (não nome inválido) e não interrompe o lote', async () => {
  const pesquisar = async nome => {
    if (nome === 'Pessoa B Sobrenome') throw new Error('locator.waitFor: Timeout 30000ms exceeded.');
    return { busca: nome, mandados: [], total_no_portal: 0 };
  };
  const { deps } = fakes({ pesquisar });
  const r = await rodarLote({ nomes: ['Pessoa A Sobrenome', 'Pessoa B Sobrenome', 'Pessoa C Sobrenome'], progresso() {}, sinal: null, deps });
  const b = r.resultados.find(x => x.nome === 'Pessoa B Sobrenome');
  assert.equal(b.falha, 'locator.waitFor: Timeout 30000ms exceeded.');
  assert.equal(b.erro, undefined);          // não é "inválido"
  assert.equal(r.interrompido, false);      // falha de um nome não para o lote
  assert.equal(r.resumo.invalidos, 0);
  assert.equal(r.resumo.falhas, 1);
  assert.equal(r.resumo.consultados, 2);    // A e C concluíram
});

test('403 interrompe o lote e marca os nomes restantes como não consultados', async () => {
  const pesquisar = async nome => {
    if (nome === 'Pessoa B Sobrenome') throw new Error('O portal bloqueou o acesso (403). Pare por hoje.');
    return { busca: nome, mandados: [], total_no_portal: 0 };
  };
  const { deps } = fakes({ pesquisar });
  const r = await rodarLote({ nomes: ['Pessoa A Sobrenome', 'Pessoa B Sobrenome', 'Pessoa C Sobrenome'], progresso() {}, sinal: null, deps });
  assert.equal(r.interrompido, true);
  assert.match(r.motivo, /403/);
  assert.equal(r.resultados.find(x => x.nome === 'Pessoa C Sobrenome').nao_consultado, true);
});

test('cancelar no meio para o lote', async () => {
  const controle = new AbortController();
  let n = 0;
  const pesquisar = async nome => { if (++n === 2) controle.abort(); return { busca: nome, mandados: [], total_no_portal: 0 }; };
  const { deps } = fakes({ pesquisar });
  const r = await rodarLote({ nomes: ['Pessoa A Sobrenome', 'Pessoa B Sobrenome', 'Pessoa C Sobrenome'], progresso() {}, sinal: controle.signal, deps });
  assert.equal(r.cancelado, true);
  assert.ok(r.resultados.filter(x => x.resultado).length < 3);
});

test('resumo conta quem tem mandado', async () => {
  const pesquisar = async nome => ({ busca: nome, total_no_portal: nome.includes('Com') ? 2 : 0, mandados: nome.includes('Com') ? [{ numero: 'x' }] : [] });
  const { deps } = fakes({ pesquisar });
  const r = await rodarLote({ nomes: ['Com Mandado Um', 'Sem Nada Dois'], progresso() {}, sinal: null, deps });
  assert.equal(r.resumo.com_mandado, 1);
  assert.equal(r.resumo.consultados, 2);
});
