// Executor real: abre o portal num navegador VISÍVEL, espera a pessoa marcar o captcha e lê o resultado
// que o próprio portal devolve à página. Não resolve nem contorna o captcha.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { URL_PORTAL, API, horaLocalIso, montarResultado, nomeArquivo, urlDaPagina, juntarSemRepetir } from './bnmp.js';

const CAMPO_NOME = 'input[name="nomePessoa"]';
const BOTAO_PESQUISAR = 'span.ui-button-text';

const espera = ms => new Promise(r => setTimeout(r, ms));

function falhaDoStatus(status) {
  if (status === 403) return new Error('O portal bloqueou o acesso (403). Pare por hoje; não insista nem troque de rede.');
  if (status === 401) return new Error('O portal não aceitou a sessão (401): o captcha não foi validado ou expirou. Tente de novo.');
  if (status === 429) return new Error('O portal pediu para desacelerar (429). Tente mais tarde.');
  return new Error(`O portal respondeu com erro (status ${status}).`);
}

async function abrirNavegador() {
  const erros = [];
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel, headless: false }); // headless leva 403 do portal
    } catch (e) {
      erros.push(`${channel}: ${String(e.message).split('\n')[0]}`);
    }
  }
  throw new Error('Não encontrei o Microsoft Edge nem o Google Chrome neste computador. Instale um deles e tente de novo.\n' + erros.join('\n'));
}

async function fecharSemTravar(browser) {
  // O Edge às vezes demora a fechar; o resultado já está pronto, então não esperamos mais que 5 s.
  await Promise.race([browser.close().catch(() => {}), espera(5000)]);
}

function traduzirErro(e) {
  const msg = String(e && e.message || e);
  if (/closed|Target page|has been closed/i.test(msg)) {
    return new Error('A janela do navegador foi fechada antes de terminar. Peça a consulta de novo e deixe a janela aberta.');
  }
  return e instanceof Error ? e : new Error(msg);
}

export function criarExecutor({ pastaSaida }) {
  return async function executar(nome, opcoes, progresso) {
    const { baixarPdfs = false, maxPaginas = 3, maxPdfs = 20, esperaCaptchaS = 300, sinal } = opcoes;
    if (sinal?.aborted) throw new Error('cancelada');
    progresso('abrindo_navegador');
    const browser = await abrirNavegador();
    const aoCancelar = () => { browser.close().catch(() => {}); };
    sinal?.addEventListener('abort', aoCancelar);
    try {
      const page = await (await browser.newContext()).newPage();
      await page.goto(URL_PORTAL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.bringToFront();
      progresso('aguardando_captcha');

      const campo = page.locator(CAMPO_NOME);
      try {
        await campo.waitFor({ state: 'visible', timeout: esperaCaptchaS * 1000 });
      } catch (e) {
        if (e.name === 'TimeoutError') throw new Error(`O captcha não foi marcado em ${Math.round(esperaCaptchaS / 60)} minutos. Peça a consulta de novo.`);
        throw e;
      }
      await campo.fill(nome);
      progresso('pesquisando');
      const [resp] = await Promise.all([
        page.waitForResponse(r => r.url().includes('pesquisa-pecas/filter'), { timeout: 120_000 }),
        page.locator(BOTAO_PESQUISAR, { hasText: 'Pesquisar' }).first().click(),
      ]);
      if (resp.status() !== 200) throw falhaDoStatus(resp.status());
      const primeira = await resp.json();
      const paginas = [primeira];

      // Demais páginas: a mesma chamada que a página fez, dentro dela (mesma sessão do captcha).
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
        paginas.push(JSON.parse(r.dados));
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
          progresso(`baixando_pdfs ${i + 1}/${alvo.length}`);
          await page.waitForTimeout(1000);
          const r = await page.evaluate(async url => {
            try {
              const x = await fetch(url, { method: 'POST', credentials: 'include',
                headers: { accept: 'application/json, text/plain, */*', fingerprint: '' } });
              const blob = await x.blob();
              const b64 = await new Promise((ok, erro) => { const fr = new FileReader();
                fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = erro; fr.readAsDataURL(blob); });
              return { status: x.status, dados: b64 };
            } catch (e) { return { status: 0, dados: '' }; }
          }, `${API}/certidaos/relatorio/${m.id}/${m.id_tipo_peca}`);
          if (r.status === 401 || r.status === 403) {
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
    } catch (e) {
      if (sinal?.aborted) throw new Error('cancelada');
      throw traduzirErro(e);
    } finally {
      sinal?.removeEventListener('abort', aoCancelar);
      await fecharSemTravar(browser);
    }
  };
}
