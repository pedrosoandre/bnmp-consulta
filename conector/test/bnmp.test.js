// Testes sem rede e sem navegador: regras puras e o gerente da consulta (com um executor falso).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validarNome, ufDe, tribunalDe, resumir, montarResultado, nomeArquivo, urlDaPagina, juntarSemRepetir,
} from '../server/bnmp.js';
import { GerenteDeConsulta } from '../server/gerente.js';

const ITEM = {
  id: 123456, idTipoPeca: 1, numeroPeca: '0001',
  numeroPecaFormatado: '0000123-45.2024.8.21.0001.01.0001-01',
  numeroProcesso: '00001234520248210001', nomePessoa: 'MARIA DA SILVA',
  alcunha: 'Mari', descricaoStatus: 'Pendente de Cumprimento', dataExpedicao: '2024-03-05',
  nomeOrgao: '1ª Vara Criminal de Porto Alegre', descricaoPeca: 'Mandado de Prisão',
  nomeMae: 'ANA DA SILVA', dataNascimento: '1990-01-02',
};

test('validarNome recusa vazio, curinga e nome sem letras', () => {
  for (const n of ['', '   ', '*', 'Maria*', '%', 'ab', '12345', null, undefined]) {
    assert.throws(() => validarNome(n), /nome|curinga/i, String(n));
  }
});

test('validarNome limpa espaços e aceita acentos', () => {
  assert.equal(validarNome('  Maria   da  Conceição '), 'Maria da Conceição');
});

test('resumir traduz os campos da API', () => {
  assert.deepEqual(resumir(ITEM), {
    numero: '0000123-45.2024.8.21.0001.01.0001-01', nome: 'MARIA DA SILVA', alcunha: 'Mari',
    situacao: 'Pendente de Cumprimento', data_expedicao: '05/03/2024',
    orgao: '1ª Vara Criminal de Porto Alegre', peca: 'Mandado de Prisão',
    processo: '00001234520248210001', uf: 'RS', tribunal: 'TJRS',
    nome_mae: 'ANA DA SILVA', data_nascimento: '02/01/1990', id: 123456, id_tipo_peca: 1, pdf: null,
  });
});

test('resumir aguenta campos ausentes', () => {
  const r = resumir({ id: 9, idTipoPeca: 2 });
  assert.equal(r.numero, ''); assert.equal(r.data_expedicao, ''); assert.equal(r.uf, ''); assert.equal(r.id, 9);
});

test('UF só para Justiça Estadual', () => {
  assert.equal(ufDe('00001234520248210001'), 'RS');
  assert.equal(ufDe('00001234520244040001'), '');
  assert.equal(ufDe('123'), '');
});

test('tribunal pelo número CNJ', () => {
  const casos = {
    '00002370820241000000': 'STF', '00001234520243000000': 'STJ', '00001234520244040001': 'TRF4',
    '00001234520245040001': 'TRT4', '00001234520245000001': 'TST', '00001234520246210001': 'TRE-RS',
    '00001234520246000001': 'TSE', '00001234520247000001': 'STM', '00001234520248260001': 'TJSP',
    '00001234520249210001': 'TJM-RS', '123': '',
  };
  for (const [p, t] of Object.entries(casos)) assert.equal(tribunalDe(p), t, p);
});

test('montarResultado junta páginas, conta e avisa sobre homônimos', () => {
  const r = montarResultado('Maria', [
    { content: [ITEM], totalElements: 2, totalPages: 2 },
    { content: [{ ...ITEM, id: 2, numeroPecaFormatado: 'B' }], totalElements: 2, totalPages: 2 },
  ], '2026-11-26T10:00:00');
  assert.equal(r.total_no_portal, 2);
  assert.deepEqual(r.mandados.map(m => m.numero), ['0000123-45.2024.8.21.0001.01.0001-01', 'B']);
  assert.equal(r.paginas_lidas, 2); assert.equal(r.paginas_no_portal, 2); assert.equal(r.incompleto, false);
  assert.match(r.aviso, /hom[oô]nimo/i);
});

test('montarResultado marca incompleto quando não leu tudo', () => {
  const r = montarResultado('Jose', [{ content: [ITEM], totalElements: 163, totalPages: 17 }], 'x');
  assert.equal(r.incompleto, true); assert.equal(r.paginas_no_portal, 17);
});

test('montarResultado sem mandados', () => {
  const r = montarResultado('Fulano', [{ content: [], totalElements: 0, totalPages: 0 }], 'x');
  assert.equal(r.total_no_portal, 0); assert.deepEqual(r.mandados, []); assert.equal(r.incompleto, false);
});

test('nomeArquivo é seguro', () => {
  assert.equal(nomeArquivo('0000123-45.2024/8 21'), '0000123-45.2024_8_21');
  assert.equal(nomeArquivo('../..'), 'mandado');
});

test('urlDaPagina troca a página e cria o parâmetro se faltar', () => {
  const base = 'https://portalbnmp.cnj.jus.br/bnmpportal/api/pesquisa-pecas/filter';
  assert.equal(urlDaPagina(`${base}?page=0&size=10&sort=`, 3), `${base}?page=3&size=10&sort=`);
  assert.equal(urlDaPagina(`${base}?size=10`, 2), `${base}?size=10&page=2`);
});

test('juntarSemRepetir descarta mandado repetido entre páginas', () => {
  const pags = juntarSemRepetir([{ content: [ITEM] }, { content: [ITEM, { ...ITEM, id: 7 }] }]);
  assert.deepEqual(pags.flatMap(p => p.content).map(i => i.id), [123456, 7]);
});

// ---------------------------------------------------------------- gerente ---

const esperar = ms => new Promise(r => setTimeout(r, ms));

test('gerente: iniciar responde na hora e aguardar devolve "aguardando" se não terminou', async () => {
  let liberar;
  const g = new GerenteDeConsulta({ executar: (nome, op, progresso) => { progresso('aguardando_captcha'); return new Promise(r => { liberar = r; }); } });
  const ini = g.iniciar('Maria da Silva', {});
  assert.equal(ini.status, 'em_andamento');
  const e = await g.aguardar(50);
  assert.equal(e.status, 'em_andamento'); assert.equal(e.etapa, 'aguardando_captcha');
  liberar({ mandados: [] });
  const fim = await g.aguardar(1000);
  assert.equal(fim.status, 'concluida'); assert.deepEqual(fim.resultado, { mandados: [] });
});

test('gerente: aguardar volta assim que terminar, sem gastar o prazo todo', async () => {
  const g = new GerenteDeConsulta({ executar: async () => { await esperar(30); return { ok: 1 }; } });
  g.iniciar('Maria da Silva', {});
  const t = Date.now();
  const e = await g.aguardar(5000);
  assert.equal(e.status, 'concluida'); assert.ok(Date.now() - t < 1000);
});

test('gerente: uma consulta por vez (sem sessões em paralelo)', () => {
  const g = new GerenteDeConsulta({ executar: () => new Promise(() => {}) });
  g.iniciar('Maria da Silva', {});
  assert.throws(() => g.iniciar('Joao da Silva', {}), /andamento/);
});

test('gerente: erro vira status "erro" com a mensagem', async () => {
  const g = new GerenteDeConsulta({ executar: async () => { throw new Error('O portal bloqueou (403).'); } });
  g.iniciar('Maria da Silva', {});
  const e = await g.aguardar(1000);
  assert.equal(e.status, 'erro'); assert.match(e.erro, /403/);
});

test('gerente: nome inválido não inicia nada', () => {
  let chamou = false;
  const g = new GerenteDeConsulta({ executar: async () => { chamou = true; } });
  assert.throws(() => g.iniciar('*', {}), /curinga/i);
  assert.equal(chamou, false); assert.equal(g.estado().status, 'ocioso');
});

test('gerente: sem consulta, aguardar diz que não há nada', async () => {
  const g = new GerenteDeConsulta({ executar: async () => ({}) });
  assert.equal((await g.aguardar(10)).status, 'ocioso');
});

test('gerente: cancelar libera para nova consulta', async () => {
  let cancelado = false;
  const g = new GerenteDeConsulta({ executar: (n, op) => new Promise((_, falha) => { op.sinal.addEventListener('abort', () => { cancelado = true; falha(new Error('cancelada')); }); }) });
  g.iniciar('Maria da Silva', {});
  g.cancelar();
  await esperar(10);
  assert.equal(cancelado, true);
  assert.equal(g.estado().status, 'ocioso');
  g.iniciar('Joao da Silva', {}); // não lança
});

test('horaLocalIso usa o horário do computador, não UTC (a consulta saiu 15:18 sendo 12:18 em Brasília)', async () => {
  const { horaLocalIso } = await import('../server/bnmp.js');
  assert.equal(horaLocalIso(new Date(2026, 10, 26, 12, 18, 30)), '2026-11-26T12:18:30');
});
