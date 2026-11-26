import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatarEstado } from '../server/texto.js';

const M = { numero: '0001', nome: 'MARIA', situacao: 'Pendente de Cumprimento', peca: 'Mandado de Prisão',
  tribunal: 'TJSP', orgao: 'Vara | Criminal', data_expedicao: '05/03/2024', nome_mae: 'ANA', data_nascimento: '02/01/1990', pdf: 'C:/x/0001.pdf' };

test('ocioso explica que não há consulta', () => {
  assert.match(formatarEstado({ status: 'ocioso' }), /não há consulta/i);
});

test('aguardando captcha pede para marcar e chamar de novo', () => {
  const t = formatarEstado({ status: 'em_andamento', nome: 'Maria', etapa: 'aguardando_captcha' });
  assert.match(t, /Não sou um robô/); assert.match(t, /resultado_consulta_bnmp/); assert.match(t, /em_andamento/);
});

test('outra etapa mostra o andamento', () => {
  assert.match(formatarEstado({ status: 'em_andamento', nome: 'Maria', etapa: 'baixando_pdfs 3/5' }), /baixando_pdfs 3\/5/);
});

test('erro mostra a mensagem', () => {
  assert.match(formatarEstado({ status: 'erro', nome: 'Maria', erro: 'O portal bloqueou (403).' }), /falhou.*403/s);
});

test('sem mandados não vira certidão', () => {
  const t = formatarEstado({ status: 'concluida', nome: 'Fulano', resultado: { busca: 'Fulano', consultado_em: '2026-11-26T10:00:00',
    total_no_portal: 0, mandados: [], incompleto: false, aviso: 'homônimos', arquivo_json: 'C:/x/c.json' } });
  assert.match(t, /Nenhum mandado/); assert.match(t, /não é certidão/i);
});

test('com mandados monta tabela, escapa | e mostra avisos e arquivos', () => {
  const t = formatarEstado({ status: 'concluida', nome: 'Maria', resultado: { busca: 'Maria', consultado_em: '2026-11-26T10:00:00',
    total_no_portal: 40, paginas_lidas: 3, paginas_no_portal: 4, mandados: [M], incompleto: true,
    aviso: 'Busca por nome: homônimos são comuns.', aviso_pdfs: 'Baixei 20.', arquivo_json: 'C:/x/c.json' } });
  assert.match(t, /\| Número \|/);
  assert.match(t, /\| 0001 \| Pendente de Cumprimento \| Mandado de Prisão \| TJSP \| Vara \\| Criminal \|/);
  assert.match(t, /40 no portal/); assert.match(t, /3 de 4 páginas/); assert.match(t, /max_paginas/);
  assert.match(t, /Baixei 20\./); assert.match(t, /C:\/x\/c\.json/); assert.match(t, /homônimos/);
});

import { respostaCurta } from '../server/texto.js';

test('respostaCurta: com mandado diz SIM, quantos, tribunais e o aviso de homônimo', () => {
  const t = respostaCurta({ busca: 'Joana Pereira Lima', total_no_portal: 1,
    mandados: [{ tribunal: 'STF' }] });
  assert.match(t, /^Joana Pereira Lima/);
  assert.match(t, /SIM/);
  assert.match(t, /\b1 mandado\b/);     // singular
  assert.match(t, /STF/);
  assert.match(t, /hom[oô]nimo/i);
  assert.match(t, /m[aã]e/i);
});

test('respostaCurta: plural e vários tribunais distintos (sem repetir)', () => {
  const t = respostaCurta({ busca: 'Jose Carlos da Silva', total_no_portal: 163,
    mandados: [{ tribunal: 'TJSP' }, { tribunal: 'TJSP' }, { tribunal: 'TJMG' }] });
  assert.match(t, /\b163 mandados\b/);
  assert.match(t, /TJSP/);
  assert.match(t, /TJMG/);
  assert.equal((t.match(/TJSP/g) || []).length, 1); // tribunal não repete
});

test('respostaCurta: sem mandado diz NÃO e que não é certidão negativa', () => {
  const t = respostaCurta({ busca: 'Luiz Inacio Lula da Silva', total_no_portal: 0, mandados: [] });
  assert.match(t, /^Luiz Inacio Lula da Silva/);
  assert.match(t, /N[ÃA]O/);
  assert.match(t, /certid[ãa]o negativa/i);
});

import { formatarLote } from '../server/texto.js';

const loteOk = {
  status: 'concluida', lote: true, resultado: {
    resumo: { pedidos: 3, consultados: 3, com_mandado: 1, invalidos: 1, captchas: 1 },
    interrompido: false, cancelado: false,
    resultados: [
      { nome: 'Joana Pereira Lima', resultado: { total_no_portal: 1, mandados: [{ numero: '0000123-45', situacao: 'Pendente de Cumprimento', peca: 'Mandado de Prisão', tribunal: 'STF', pdf: 'C:/x.pdf' }] } },
      { nome: 'Joao de Souza', resultado: { total_no_portal: 0, mandados: [] } },
      { nome: 'ab', erro: 'Informe o nome da pessoa (pelo menos 3 letras).' },
    ],
    arquivo_lote: 'C:/x/lote.json',
  },
};

test('formatarLote: resumo, só os que têm mandado detalhados, e os avisos', () => {
  const t = formatarLote(loteOk);
  assert.match(t, /3 nome\(s\)/);
  assert.match(t, /1 com mandado/);
  assert.match(t, /1 captcha/);
  assert.match(t, /Joana Pereira Lima/);
  assert.match(t, /Pendente de Cumprimento/);
  assert.match(t, /Joao de Souza/);     // aparece como "nada encontrado"
  assert.match(t, /ab/);                // inválido listado
  assert.match(t, /hom[oô]nimo/i);
  assert.match(t, /C:\/x\/lote\.json/);
});

test('formatarLote em andamento mostra a etapa e manda chamar de novo', () => {
  const t = formatarLote({ status: 'em_andamento', lote: true, etapa: 'consultando 2/5: Joao' });
  assert.match(t, /consultando 2\/5/);
  assert.match(t, /resultado_consulta_bnmp/);
});

test('formatarLote separa falha de portal de nome inválido', () => {
  const t = formatarLote({ status: 'concluida', lote: true, resultado: {
    resumo: { pedidos: 3, consultados: 1, com_mandado: 0, invalidos: 1, falhas: 1, captchas: 1 }, interrompido: false, cancelado: false,
    resultados: [
      { nome: 'Ana Lima', resultado: { total_no_portal: 0, mandados: [] } },
      { nome: 'ab', erro: 'Informe o nome da pessoa (pelo menos 3 letras).' },
      { nome: 'Marcos Vinicius Costa', falha: 'locator.waitFor: Timeout 30000ms exceeded.' },
    ],
  } });
  const linhaInvalido = t.split('\n').find(l => /nome inválido/i.test(l));
  const linhaFalha = t.split('\n').find(l => /falhar(am|)|erro no portal|tente de novo/i.test(l));
  assert.ok(linhaInvalido && /\bab\b/.test(linhaInvalido));                  // "ab" é o inválido
  assert.ok(linhaInvalido && !/Marcos/.test(linhaInvalido));                 // Marcos NÃO é inválido
  assert.ok(linhaFalha && /Marcos Vinicius Costa/.test(linhaFalha));         // Marcos é falha de portal
  assert.match(t, /1 falha/);                                                 // resumo conta a falha
});

test('formatarLote interrompido por 403 avisa e lista os não consultados', () => {
  const t = formatarLote({ status: 'concluida', lote: true, resultado: {
    resumo: { pedidos: 2, consultados: 1, com_mandado: 0, invalidos: 0, captchas: 1 }, interrompido: true, motivo: 'O portal bloqueou (403).',
    resultados: [{ nome: 'Ana Lima', resultado: { total_no_portal: 0, mandados: [] } }, { nome: 'Bruno Melo', nao_consultado: true }],
  } });
  assert.match(t, /403/);
  assert.match(t, /Bruno Melo/);
  assert.match(t, /não consultad/i);
});
