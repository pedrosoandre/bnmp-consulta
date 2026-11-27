// Regras puras da consulta ao BNMP (sem rede, sem navegador). Espelham o consulta_bnmp.py da skill.

export const URL_PORTAL = 'https://portalbnmp.cnj.jus.br/#/pesquisa-peca';
export const API = 'https://portalbnmp.cnj.jus.br/bnmpportal/api';

// Código do tribunal (TR) no número CNJ, para a Justiça Estadual (J = 8).
const UF_POR_TR = {
  '01': 'AC', '02': 'AL', '03': 'AP', '04': 'AM', '05': 'BA', '06': 'CE', '07': 'DF',
  '08': 'ES', '09': 'GO', '10': 'MA', '11': 'MT', '12': 'MS', '13': 'MG', '14': 'PA',
  '15': 'PB', '16': 'PR', '17': 'PE', '18': 'PI', '19': 'RJ', '20': 'RN', '21': 'RS',
  '22': 'RO', '23': 'RR', '24': 'SC', '25': 'SE', '26': 'SP', '27': 'TO',
};

const AVISO = 'Busca por nome no BNMP: homônimos são comuns. Confira nome da mãe, data de nascimento e ' +
  'número do processo antes de concluir que um mandado é da pessoa. "Nenhum mandado" não é certidão negativa.';

/** Nome limpo, ou erro. Curingas ficam de fora: esta ferramenta consulta UMA pessoa. */
export function validarNome(nome) {
  const limpo = String(nome ?? '').replace(/\s+/g, ' ').trim();
  if (/[*%?]/.test(limpo)) throw new Error('Curinga (*, %, ?) não é aceito: informe o nome da pessoa.');
  if ((limpo.match(/\p{L}/gu) || []).length < 3) throw new Error('Informe o nome da pessoa (pelo menos 3 letras).');
  if (limpo.length > 120) throw new Error('Nome longo demais (máximo de 120 caracteres).');
  return limpo;
}

const digitos = n => String(n ?? '').replace(/\D/g, '');

export function ufDe(processo) {
  const d = digitos(processo);
  if (d.length !== 20 || d[13] !== '8') return '';
  return UF_POR_TR[d.slice(14, 16)] || '';
}

/** Sigla do tribunal pelo segmento (J) e tribunal (TR) do número CNJ (Resolução CNJ 65/2008). */
export function tribunalDe(processo) {
  const d = digitos(processo);
  if (d.length !== 20) return '';
  const j = d[13], tr = d.slice(14, 16), uf = UF_POR_TR[tr] || '';
  switch (j) {
    case '1': return 'STF';
    case '2': return 'CNJ';
    case '3': return 'STJ';
    case '4': return tr === '00' ? 'CJF' : `TRF${Number(tr)}`;
    case '5': return tr === '00' ? 'TST' : `TRT${Number(tr)}`;
    case '6': return uf ? `TRE-${uf}` : 'TSE';
    case '7': return tr === '00' ? 'STM' : 'Justiça Militar da União';
    case '8': return uf ? `TJ${uf}` : '';
    case '9': return uf ? `TJM-${uf}` : '';
    default: return '';
  }
}

/** Data e hora do computador (não UTC) no formato AAAA-MM-DDTHH:MM:SS. */
export function horaLocalIso(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}

function dataBr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Um mandado da API do portal, com nomes de campo em português claro. */
export function resumir(item) {
  const g = k => item[k] || '';
  return {
    numero: g('numeroPecaFormatado') || g('numeroPeca'),
    nome: g('nomePessoa'),
    alcunha: g('alcunha'),
    situacao: g('descricaoStatus'),
    data_expedicao: dataBr(item.dataExpedicao),
    orgao: g('nomeOrgao'),
    peca: g('descricaoPeca'),
    processo: g('numeroProcesso'),
    uf: ufDe(item.numeroProcesso),
    tribunal: tribunalDe(item.numeroProcesso),
    nome_mae: g('nomeMae'),
    data_nascimento: dataBr(item.dataNascimento),
    id: item.id ?? null,
    id_tipo_peca: item.idTipoPeca ?? null,
    pdf: null,
  };
}

export function montarResultado(busca, paginas, consultadoEm) {
  const mandados = paginas.flatMap(p => (p.content || []).map(resumir));
  const primeira = paginas[0] || {};
  const total = primeira.totalElements ?? mandados.length;
  const noPortal = primeira.totalPages ?? paginas.length;
  return {
    busca,
    consultado_em: consultadoEm,
    fonte: URL_PORTAL,
    total_no_portal: total,
    paginas_lidas: paginas.length,
    paginas_no_portal: noPortal,
    incompleto: mandados.length < total,
    mandados,
    aviso: AVISO,
  };
}

export function nomeArquivo(texto) {
  const s = String(texto ?? '').replace(/[^\p{L}\p{N}_.-]+/gu, '_').replace(/^[._-]+|[._-]+$/g, '');
  return s.slice(0, 80) || 'mandado';
}

/** A mesma chamada de pesquisa que a página fez, na página n (cria o parâmetro se faltar). */
export function urlDaPagina(url, n) {
  const u = new URL(url);
  u.searchParams.set('page', String(n));
  return u.toString();
}

/** Remove mandados repetidos entre páginas (a lista do portal pode andar entre uma chamada e outra). */
export function juntarSemRepetir(paginas) {
  const vistos = new Set();
  return paginas.map(p => ({
    ...p,
    content: (p.content || []).filter(i => {
      const k = i.id ?? i.numeroPecaFormatado;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    }),
  }));
}

/**
 * Garante o campo de busca pronto. Se não aparecer (glitch de render entre dois nomes),
 * recarrega o portal UMA vez e tenta de novo — a sessão segue válida, então não pede captcha.
 * `esperarVisivel(ms)` espera o campo; `recarregar()` dá um page.goto no portal.
 * @param {{esperarVisivel: (ms:number)=>Promise<void>, recarregar: ()=>Promise<void>, msCurto?: number, msAposReload?: number}} p
 */
export async function esperarCampoPronto({ esperarVisivel, recarregar, msCurto = 15_000, msAposReload = 20_000 }) {
  try {
    await esperarVisivel(msCurto);
  } catch (e) {
    if (e.name !== 'TimeoutError') throw e; // só o timeout do campo é recuperável com reload
    await recarregar();
    await esperarVisivel(msAposReload); // segunda e última tentativa; se falhar, propaga
  }
}
