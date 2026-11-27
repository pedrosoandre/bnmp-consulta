// Orquestra uma consulta em lote: UM captcha serve para até `maxPorCaptcha` nomes.
// A pessoa continua resolvendo o captcha; o lote apenas reaproveita a sessão validada por ela,
// sem contornar nada. Quando o limite é atingido ou a sessão cai (401), pede um novo captcha.
import { validarNome } from './bnmp.js';

const espera = ms => new Promise(r => setTimeout(r, ms));
const sessaoExpirou = e => /\b401\b|sess[aã]o/i.test(String(e && e.message || e));
const bloqueou = e => /\b(403|429)\b/.test(String(e && e.message || e)); // 403 ou 429: parar

/**
 * @param {object} p
 * @param {string[]} p.nomes
 * @param {(etapa: string) => void} p.progresso
 * @param {AbortSignal|null} p.sinal
 * @param {{abrirSessao: Function, pesquisar: Function, maxPorCaptcha?: number, pausaMs?: number}} p.deps
 */
export async function rodarLote({ nomes, progresso, sinal, deps }) {
  const maxPorCaptcha = deps.maxPorCaptcha ?? 10;
  const pausaMs = deps.pausaMs ?? 0;

  // Normaliza: valida, descarta repetidos (sem caso), separa os inválidos.
  const resultados = [];
  const fila = [];
  const vistos = new Set();
  for (const bruto of nomes) {
    let nome;
    try {
      nome = validarNome(bruto);
    } catch (e) {
      resultados.push({ nome: String(bruto ?? '').trim(), erro: String(e.message) });
      continue;
    }
    const chave = nome.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    fila.push(nome);
  }

  let captchas = 0;
  let noCaptchaAtual = 0;
  let sessaoViva = false;
  let interrompido = false;
  let motivo = null;
  let cancelado = false;
  const jaRepetidos = new Set(); // nomes que já ganharam uma segunda tentativa após 401

  for (let i = 0; i < fila.length; i++) {
    const nome = fila[i];
    if (sinal?.aborted) { cancelado = true; break; }

    if (!sessaoViva || noCaptchaAtual >= maxPorCaptcha) {
      progresso(`aguardando_captcha ${captchas + 1}`);
      await deps.abrirSessao(progresso);
      captchas++;
      noCaptchaAtual = 0;
      sessaoViva = true;
      if (sinal?.aborted) { cancelado = true; break; }
    }

    progresso(`consultando ${i + 1}/${fila.length}: ${nome}`);
    try {
      const resultado = await deps.pesquisar(nome, progresso);
      resultados.push({ nome, resultado });
      noCaptchaAtual++;
    } catch (e) {
      if (sinal?.aborted) { cancelado = true; break; }
      if (sessaoExpirou(e) && !jaRepetidos.has(nome)) {
        // A sessão caiu: refaz o captcha e repete este mesmo nome uma vez.
        jaRepetidos.add(nome);
        sessaoViva = false;
        i--; // volta para o mesmo índice; o bloco de captcha roda antes de repetir
        continue;
      }
      if (bloqueou(e)) {
        interrompido = true;
        motivo = String(e.message);
        break;
      }
      // Não é 401 nem 403: foi uma falha de portal nesta busca (ex.: a página não
      // recarregou o campo a tempo). O nome é válido; registramos como `falha`, não `erro`.
      resultados.push({ nome, falha: String(e.message) });
      noCaptchaAtual++;
    }

    if (pausaMs && i < fila.length - 1) await espera(pausaMs);
  }

  // Nomes que ficaram para trás por 403/cancelamento.
  const feitos = new Set(resultados.map(r => r.nome));
  if (interrompido || cancelado) {
    for (const nome of fila) if (!feitos.has(nome)) resultados.push({ nome, nao_consultado: true });
  }

  const consultados = resultados.filter(r => r.resultado).length;
  const com_mandado = resultados.filter(r => r.resultado && r.resultado.total_no_portal > 0).length;
  return {
    resultados,
    interrompido,
    motivo,
    cancelado,
    resumo: {
      pedidos: nomes.length, consultados, com_mandado,
      invalidos: resultados.filter(r => r.erro).length,
      falhas: resultados.filter(r => r.falha).length,
      captchas,
    },
  };
}
