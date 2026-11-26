// Uma consulta por vez, em segundo plano. O Claude Desktop desiste de ferramentas que demoram
// (o captcha é humano e pode levar minutos), então "iniciar" responde na hora e "aguardar"
// espera no máximo alguns segundos por chamada; o Claude chama "aguardar" de novo até terminar.
import { validarNome } from './bnmp.js';

export class GerenteDeConsulta {
  /** @param {{executar: (nome: string, opcoes: object, progresso: (etapa: string) => void) => Promise<object>}} deps */
  constructor({ executar }) {
    this.executar = executar;
    this.atual = null; // {id, nome, status, etapa, resultado, erro, promessa, controle}
    this.seq = 0;
  }

  estado() {
    if (!this.atual) return { status: 'ocioso' };
    const { nome, status, etapa, resultado, erro } = this.atual;
    return { status, nome, etapa, resultado, erro };
  }

  iniciar(nome, opcoes = {}) {
    const limpo = validarNome(nome);
    if (this.atual && this.atual.status === 'em_andamento') {
      throw new Error(`Já existe uma consulta em andamento (${this.atual.nome}). Aguarde ou cancele antes de começar outra.`);
    }
    const controle = new AbortController();
    const c = { id: ++this.seq, nome: limpo, status: 'em_andamento', etapa: 'abrindo_navegador', controle };
    this.atual = c;
    const progresso = etapa => { if (this.atual === c && c.status === 'em_andamento') c.etapa = etapa; };
    // new Promise chama o executor já agora (não no próximo tick): um cancelar() logo em seguida o alcança.
    c.promessa = new Promise(r => r(this.executar(limpo, { ...opcoes, sinal: controle.signal }, progresso)))
      .then(res => { if (this.atual === c) { c.status = 'concluida'; c.resultado = res; c.etapa = 'fim'; } },
            err => { if (this.atual === c) { c.status = 'erro'; c.erro = String(err && err.message || err); c.etapa = 'fim'; } });
    return this.estado();
  }

  /** Espera até `ms` pelo fim da consulta e devolve o estado (sem gastar o prazo se terminar antes). */
  async aguardar(ms) {
    const c = this.atual;
    if (!c || c.status !== 'em_andamento') return this.estado();
    let timer;
    await Promise.race([c.promessa, new Promise(r => { timer = setTimeout(r, ms); })]);
    clearTimeout(timer);
    return this.estado();
  }

  cancelar() {
    const c = this.atual;
    if (!c) return { status: 'ocioso' };
    this.atual = null;
    c.controle.abort();
    return { status: 'ocioso', cancelada: c.status === 'em_andamento' ? c.nome : null };
  }
}
