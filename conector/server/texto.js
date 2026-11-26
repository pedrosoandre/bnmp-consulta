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
