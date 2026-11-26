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
