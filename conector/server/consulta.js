// Executor real: abre o portal num navegador VISÍVEL, espera a pessoa marcar o captcha e lê o resultado
// que o próprio portal devolve à página. Não resolve nem contorna o captcha.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright-core';
import { URL_PORTAL, API, horaLocalIso, montarResultado, nomeArquivo, urlDaPagina, juntarSemRepetir, esperarCampoPronto } from './bnmp.js';
import { rodarLote } from './lote.js';

const CAMPO_NOME = 'input[name="nomePessoa"]';
const BOTAO_PESQUISAR = 'span.ui-button-text';

const espera = ms => new Promise(r => setTimeout(r, ms));

function falhaDoStatus(status) {
  if (status === 403) return new Error('O portal bloqueou o acesso (403). Pare por hoje; não insista nem troque de rede.');
  if (status === 401) return new Error('O portal não aceitou a sessão (401): o captcha não foi validado ou expirou. Tente de novo.');
  if (status === 429) return new Error('O portal pediu para desacelerar (429). Tente mais tarde.');
  return new Error(`O portal respondeu com erro (status ${status}).`);
}

// Faixa fixa no topo do portal, só informativa (não clica nem preenche nada).
// Reaplicada a cada carregamento de página; o texto muda conforme a etapa.
function scriptFaixa() {
  const montar = () => {
    if (!document.body || document.getElementById('bnmp-claude-faixa')) return;
    const f = document.createElement('div');
    f.id = 'bnmp-claude-faixa';
    f.setAttribute('role', 'status');
    f.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;pointer-events:none;'
      + 'background:#1f2a44;color:#fff;font:600 14px/1.4 "Segoe UI",system-ui,sans-serif;'
      + 'padding:10px 16px;box-shadow:0 2px 8px rgba(0,0,0,.25);text-align:center';
    f.textContent = window.__bnmpFaixa || 'Marque "Não sou um robô" abaixo. O Claude faz o resto e esta janela fecha sozinha.';
    document.body.style.paddingTop = '44px';
    document.body.appendChild(f);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
}

async function mudarFaixa(page, texto) {
  await page.evaluate(t => {
    window.__bnmpFaixa = t;
    const f = document.getElementById('bnmp-claude-faixa');
    if (f) f.textContent = t;
  }, texto).catch(() => {});
}

// Abre uma janela compacta em modo app (sem abas nem barra de endereço), no canto direito da tela.
// Perfil temporário e descartável; navegador visível, porque o headless leva 403 do portal.
// O navegador às vezes ainda segura arquivos do perfil logo depois de fechar; tenta algumas vezes.
async function apagarPerfil(pasta) {
  for (let i = 0; i < 6; i++) {
    try { await fs.rm(pasta, { recursive: true, force: true }); return; } catch { await espera(500); }
  }
}

// Apaga perfis de consultas antigas que tenham sobrado (ex.: computador desligado no meio).
async function limparPerfisAntigos() {
  const base = os.tmpdir();
  const nomes = await fs.readdir(base).catch(() => []);
  const limite = Date.now() - 60 * 60 * 1000;
  for (const n of nomes.filter(n => n.startsWith('bnmp-claude-'))) {
    const p = path.join(base, n);
    const st = await fs.stat(p).catch(() => null);
    if (st && st.mtimeMs < limite) await fs.rm(p, { recursive: true, force: true }).catch(() => {});
  }
}

async function abrirJanela() {
  await limparPerfisAntigos();
  const perfil = await fs.mkdtemp(path.join(os.tmpdir(), 'bnmp-claude-'));
  const args = ['--app=about:blank', '--window-size=560,820', '--window-position=60,40',
    '--no-first-run', '--no-default-browser-check', '--disable-features=Translate'];
  const erros = [];
  for (const channel of ['msedge', 'chrome']) {
    try {
      const contexto = await chromium.launchPersistentContext(perfil, { channel, headless: false, viewport: null, args });
      await contexto.addInitScript(scriptFaixa);
      const page = contexto.pages()[0] || await contexto.newPage();
      let fechando = null;
      const fechar = () => (fechando ??= (async () => {
        // O Edge às vezes demora a fechar; o resultado já está pronto, então não esperamos mais que 5 s.
        await Promise.race([contexto.close().catch(() => {}), espera(5000)]);
        await apagarPerfil(perfil);
      })());
      return { page, fechar };
    } catch (e) {
      erros.push(`${channel}: ${String(e.message).split('\n')[0]}`);
    }
  }
  await apagarPerfil(perfil);
  throw new Error('Não encontrei o Microsoft Edge nem o Google Chrome neste computador. Instale um deles e tente de novo.\n' + erros.join('\n'));
}

// O portal às vezes devolve HTML (manutenção, erro) no lugar de JSON.
async function lerJson(obterTexto) {
  const t = await obterTexto();
  try { return JSON.parse(t); } catch {
    throw new Error('O portal devolveu uma resposta inesperada (não é JSON). Pode estar em manutenção; tente mais tarde.');
  }
}

const LIMITE_PDF = 20 * 1024 * 1024;
const ehId = v => /^\d+$/.test(String(v ?? ''));

function traduzirErro(e) {
  const msg = String(e && e.message || e);
  if (/closed|Target page|has been closed/i.test(msg)) {
    return new Error('A janela do navegador foi fechada antes de terminar. Peça a consulta de novo e deixe a janela aberta.');
  }
  return e instanceof Error ? e : new Error(msg);
}

// Abre o portal e espera a pessoa marcar o captcha (o campo Nome só fica acessível depois disso).
async function validarCaptcha(page, esperaCaptchaS) {
  await page.goto(URL_PORTAL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.bringToFront();
  const campo = page.locator(CAMPO_NOME);
  try {
    await campo.waitFor({ state: 'visible', timeout: esperaCaptchaS * 1000 });
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Error(`O captcha não foi marcado em ${Math.round(esperaCaptchaS / 60)} minutos. Peça a consulta de novo.`);
    throw e;
  }
}

// Pesquisa UM nome na sessão já validada e devolve o resultado (com PDFs, se pedido).
async function pesquisarNome(page, nome, { baixarPdfs, maxPaginas, maxPdfs, pastaSaida }, progresso) {
  const campo = page.locator(CAMPO_NOME);
  await esperarCampoPronto({
    esperarVisivel: ms => campo.waitFor({ state: 'visible', timeout: ms }),
    recarregar: async () => {
      progresso('recarregando_pagina');
      await page.goto(URL_PORTAL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    },
  });
  await campo.fill('');
  await campo.fill(nome);
  const [resp] = await Promise.all([
    page.waitForResponse(r => r.url().includes('pesquisa-pecas/filter'), { timeout: 120_000 }),
    page.locator(BOTAO_PESQUISAR, { hasText: 'Pesquisar' }).first().click(),
  ]);
  if (resp.status() !== 200) throw falhaDoStatus(resp.status());
  const primeira = await lerJson(() => resp.text());
  const paginas = [primeira];

  const totalPaginas = Number(primeira.totalPages || 1);
  const url0 = resp.request().url();
  const corpo = resp.request().postData();
  for (let n = 1; n < Math.min(totalPaginas, maxPaginas); n++) {
    progresso(`lendo_pagina ${n + 1}/${Math.min(totalPaginas, maxPaginas)}`);
    await page.waitForTimeout(1500);
    const r = await page.evaluate(async ([url, body]) => {
      try {
        const x = await fetch(url, { method: 'POST', credentials: 'include', body,
          headers: { accept: 'application/json', 'content-type': 'application/json;charset=UTF-8', fingerprint: '' } });
        return { status: x.status, dados: await x.text() };
      } catch (e) { return { status: 0, dados: String(e) }; }
    }, [urlDaPagina(url0, n), corpo]);
    if (r.status !== 200) throw falhaDoStatus(r.status);
    paginas.push(await lerJson(async () => r.dados));
  }

  const res = montarResultado(nome, juntarSemRepetir(paginas), horaLocalIso());
  const carimbo = res.consultado_em.replace(/[-:]/g, '').replace('T', '_');
  await fs.mkdir(pastaSaida, { recursive: true });

  if (baixarPdfs && res.mandados.length) {
    const pastaPdf = path.join(pastaSaida, 'pdf');
    await fs.mkdir(pastaPdf, { recursive: true });
    const alvo = res.mandados.slice(0, maxPdfs);
    let baixados = 0;
    for (let i = 0; i < alvo.length; i++) {
      const m = alvo[i];
      if (!ehId(m.id) || !ehId(m.id_tipo_peca)) continue; // ids vêm do portal: só números entram na URL
      progresso(`baixando_pdfs ${i + 1}/${alvo.length}`);
      await page.waitForTimeout(1000);
      const r = await page.evaluate(async ([url, limite]) => {
        try {
          const x = await fetch(url, { method: 'POST', credentials: 'include',
            headers: { accept: 'application/json, text/plain, */*', fingerprint: '' } });
          const blob = await x.blob();
          if (blob.size > limite) return { status: x.status, dados: '' };
          const b64 = await new Promise((ok, erro) => { const fr = new FileReader();
            fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = erro; fr.readAsDataURL(blob); });
          return { status: x.status, dados: b64 };
        } catch (e) { return { status: 0, dados: '' }; }
      }, [`${API}/certidaos/relatorio/${m.id}/${m.id_tipo_peca}`, LIMITE_PDF]);
      if (r.status === 401 || r.status === 403 || r.status === 429) {
        res.aviso_pdfs = `A sessão do portal parou de aceitar downloads (status ${r.status}) depois de ${baixados} PDF(s). A tabela está completa; peça os PDFs que faltaram numa nova consulta.`;
        break;
      }
      const dados = r.status === 200 ? Buffer.from(r.dados || '', 'base64') : Buffer.alloc(0);
      if (dados.subarray(0, 5).toString('latin1') !== '%PDF-') continue;
      const destino = path.join(pastaPdf, `${nomeArquivo(m.numero || m.id)}.pdf`);
      await fs.writeFile(destino, dados);
      m.pdf = destino;
      baixados++;
    }
    res.pdfs_baixados = baixados;
    if (res.mandados.length > maxPdfs && !res.aviso_pdfs) {
      res.aviso_pdfs = `Baixei os PDFs dos primeiros ${maxPdfs} mandados (limite desta consulta).`;
    }
  }

  const arquivo = path.join(pastaSaida, `consulta_${nomeArquivo(nome)}_${carimbo}.json`);
  await fs.writeFile(arquivo, JSON.stringify(res, null, 2), 'utf8');
  res.arquivo_json = arquivo;
  return res;
}

// Consulta de um nome só.
export function criarExecutor({ pastaSaida, abrirJanela: abrir = abrirJanela }) {
  return async function executar(nome, opcoes, progresso) {
    const { baixarPdfs = false, maxPaginas = 3, maxPdfs = 20, esperaCaptchaS = 300, sinal } = opcoes;
    if (sinal?.aborted) throw new Error('cancelada');
    progresso('abrindo_navegador');
    const janela = await abrir();
    // Cancelada enquanto o navegador abria: o aviso de abort já passou, então fecha aqui.
    if (sinal?.aborted) { await janela.fechar(); throw new Error('cancelada'); }
    const aoCancelar = () => { janela.fechar(); };
    sinal?.addEventListener('abort', aoCancelar);
    try {
      const { page } = janela;
      progresso('aguardando_captcha');
      await validarCaptcha(page, esperaCaptchaS);
      progresso('pesquisando');
      await mudarFaixa(page, 'Captcha ok. Pesquisando... não feche esta janela.');
      return await pesquisarNome(page, nome, { baixarPdfs, maxPaginas, maxPdfs, pastaSaida }, progresso);
    } catch (e) {
      if (sinal?.aborted) throw new Error('cancelada');
      throw traduzirErro(e);
    } finally {
      sinal?.removeEventListener('abort', aoCancelar);
      await janela.fechar();
    }
  };
}

// Consulta em lote: um captcha serve para até `maxPorCaptcha` nomes, na mesma janela.
export function criarExecutorLote({ pastaSaida, abrirJanela: abrir = abrirJanela }) {
  return async function executarLote(nomes, opcoes, progresso) {
    const { baixarPdfs = false, maxPaginas = 3, maxPdfs = 20, esperaCaptchaS = 300, maxPorCaptcha = 10, pausaMs = 1500, sinal } = opcoes;
    if (sinal?.aborted) throw new Error('cancelada');
    progresso('abrindo_navegador');
    const janela = await abrir();
    // Cancelada enquanto o navegador abria: o aviso de abort já passou, então fecha aqui.
    if (sinal?.aborted) { await janela.fechar(); throw new Error('cancelada'); }
    const aoCancelar = () => { janela.fechar(); };
    sinal?.addEventListener('abort', aoCancelar);
    try {
      const { page } = janela;
      const deps = {
        maxPorCaptcha,
        pausaMs,
        abrirSessao: async () => {
          await mudarFaixa(page, 'Marque "Não sou um robô" abaixo. O Claude faz o resto e esta janela fecha sozinha.');
          await validarCaptcha(page, esperaCaptchaS);
          await mudarFaixa(page, 'Captcha ok. Pesquisando os nomes... não feche esta janela.');
        },
        pesquisar: (nome, prog) => pesquisarNome(page, nome, { baixarPdfs, maxPaginas, maxPdfs, pastaSaida }, prog),
      };
      const lote = await rodarLote({ nomes, progresso, sinal, deps });

      // Guarda o lote inteiro num arquivo, além dos JSONs por nome.
      await fs.mkdir(pastaSaida, { recursive: true });
      const arquivo = path.join(pastaSaida, `lote_${horaLocalIso().replace(/[-:]/g, '').replace('T', '_')}.json`);
      await fs.writeFile(arquivo, JSON.stringify(lote, null, 2), 'utf8');
      lote.arquivo_lote = arquivo;
      return lote;
    } catch (e) {
      if (sinal?.aborted) throw new Error('cancelada');
      throw traduzirErro(e);
    } finally {
      sinal?.removeEventListener('abort', aoCancelar);
      await janela.fechar();
    }
  };
}
