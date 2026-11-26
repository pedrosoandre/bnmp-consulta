// Texto que o Claude recebe das ferramentas: curto, com o próximo passo explícito.

const cel = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim() || '—';

export function formatarEstado(e) {
  if (e.status === 'ocioso') {
    return 'Não há consulta em andamento. Use consultar_mandados_bnmp para começar uma.';
  }
  if (e.status === 'em_andamento') {
    if (e.etapa === 'aguardando_captcha' || e.etapa === 'abrindo_navegador') {
      return `status: em_andamento (aguardando o captcha) — consulta de "${e.nome}".\n` +
        'A janela do portal do BNMP está aberta. A pessoa precisa marcar "Não sou um robô" nela (e não fechar a janela).\n' +
        'Chame resultado_consulta_bnmp de novo.';
    }
    return `status: em_andamento (${e.etapa}) — consulta de "${e.nome}". Chame resultado_consulta_bnmp de novo.`;
  }
  if (e.status === 'erro') {
    return `A consulta de "${e.nome}" falhou: ${e.erro}`;
  }

  const r = e.resultado;
  const quando = String(r.consultado_em || '').replace('T', ' ');
  const linhas = [];
  if (!r.mandados.length) {
    linhas.push(`Nenhum mandado encontrado no BNMP para "${r.busca}" (consulta de ${quando}).`,
      'Isso significa que nada aparece no BNMP para esse nome nesta data; não é certidão negativa.');
  } else {
    linhas.push(`${r.mandados.length} mandado(s) lido(s) para "${r.busca}" (${r.total_no_portal} no portal; consulta de ${quando}).`, '',
      '| Número | Situação | Peça | Tribunal | Órgão | Expedição | Nome | Mãe | Nascimento | PDF |',
      '|---|---|---|---|---|---|---|---|---|---|');
    for (const m of r.mandados) {
      linhas.push(`| ${cel(m.numero)} | ${cel(m.situacao)} | ${cel(m.peca)} | ${cel(m.tribunal)} | ${cel(m.orgao)} | ` +
        `${cel(m.data_expedicao)} | ${cel(m.nome)} | ${cel(m.nome_mae)} | ${cel(m.data_nascimento)} | ${m.pdf ? cel(m.pdf) : '—'} |`);
    }
    if (r.incompleto) {
      linhas.push('', `Resultado parcial: li ${r.paginas_lidas} de ${r.paginas_no_portal} páginas. ` +
        'Para ler mais, peça uma nova consulta com max_paginas maior (até 10) ou um nome mais completo.');
    }
  }
  if (r.aviso_pdfs) linhas.push('', r.aviso_pdfs);
  if (r.arquivo_json) linhas.push('', `Arquivo da consulta: ${r.arquivo_json}`);
  linhas.push('', r.aviso);
  return linhas.join('\n');
}

/**
 * Resposta curta de um nome só: SIM/NÃO com o mínimo para não induzir erro.
 * "SIM" conta os mandados do NOME (podem ser homônimos); "NÃO" não é certidão negativa.
 */
export function respostaCurta(r) {
  const nome = r.busca;
  if (!r.total_no_portal) {
    return `${nome}\nNÃO — nada no BNMP para esse nome nesta data. (Não é certidão negativa.)`;
  }
  const tribs = [...new Set((r.mandados || []).map(m => m.tribunal).filter(Boolean))];
  const tribTxt = tribs.length ? ` (${tribs.slice(0, 4).join(', ')}${tribs.length > 4 ? '…' : ''})` : '';
  const n = r.total_no_portal;
  return `${nome}\nSIM — ${n} mandado${n === 1 ? '' : 's'} no nome${tribTxt}.\n` +
    'Homônimos são comuns: confira nome da mãe e data de nascimento antes de concluir.';
}

const AVISO_LOTE = 'Busca por nome no BNMP: homônimos são comuns. Antes de agir sobre qualquer nome desta lista, ' +
  'confira nome da mãe, data de nascimento e número do processo. "Nada encontrado" não é certidão negativa.';

export function formatarLote(e) {
  if (e.status === 'em_andamento') {
    const etapa = e.etapa || '';
    const captcha = /aguardando_captcha/.test(etapa)
      ? 'Marque "Não sou um robô" na janela do portal (um captcha vale para vários nomes). ' : '';
    return `status: em_andamento (${etapa}). ${captcha}Chame resultado_consulta_bnmp de novo.`;
  }
  if (e.status === 'erro') return `O lote falhou: ${e.erro}`;

  const r = e.resultado;
  const s = r.resumo;
  const falhasResumo = s.falhas ? `${s.falhas} falha(s) de portal, ` : '';
  const linhas = [
    `Lote concluído: ${s.pedidos} nome(s) pedido(s), ${s.consultados} consultado(s), ${s.com_mandado} com mandado, ` +
    `${s.invalidos} inválido(s), ${falhasResumo}em ${s.captchas} captcha${s.captchas === 1 ? '' : 's'}.`,
  ];
  if (r.interrompido) linhas.push(`Interrompido: ${r.motivo}`);
  if (r.cancelado) linhas.push('Lote cancelado antes do fim.');

  const comMandado = r.resultados.filter(x => x.resultado && x.resultado.total_no_portal > 0);
  if (comMandado.length) {
    linhas.push('', 'Com mandado:', '', '| Nome pesquisado | Número | Situação | Peça | Tribunal | PDF |', '|---|---|---|---|---|---|');
    for (const x of comMandado) {
      for (const m of x.resultado.mandados) {
        linhas.push(`| ${cel(x.nome)} | ${cel(m.numero)} | ${cel(m.situacao)} | ${cel(m.peca)} | ${cel(m.tribunal)} | ${m.pdf ? cel(m.pdf) : '—'} |`);
      }
    }
  }

  const semNada = r.resultados.filter(x => x.resultado && x.resultado.total_no_portal === 0).map(x => x.nome);
  if (semNada.length) linhas.push('', `Nada encontrado (${semNada.length}): ${semNada.join('; ')}.`);

  const invalidos = r.resultados.filter(x => x.erro);
  if (invalidos.length) linhas.push('', `Não pesquisados por nome inválido: ${invalidos.map(x => `${x.nome || '(vazio)'} — ${x.erro}`).join('; ')}.`);

  const falhas = r.resultados.filter(x => x.falha);
  if (falhas.length) linhas.push('', `Falharam na busca por erro no portal (${falhas.length}) — nome válido, tente de novo: ` +
    `${falhas.map(x => `${x.nome} — ${cel(x.falha)}`).join('; ')}.`);

  const naoConsultados = r.resultados.filter(x => x.nao_consultado).map(x => x.nome);
  if (naoConsultados.length) linhas.push('', `Não consultados (${naoConsultados.length}): ${naoConsultados.join('; ')}. Rode o lote de novo com esses nomes.`);

  if (r.arquivo_lote) linhas.push('', `Arquivo do lote: ${r.arquivo_lote}`);
  linhas.push('', AVISO_LOTE);
  return linhas.join('\n');
}
