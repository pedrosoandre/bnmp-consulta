// Uma consulta por vez, em segundo plano. O Claude Desktop desiste de ferramentas que demoram
// (o captcha é humano e pode levar minutos), então "iniciar" responde na hora e "aguardar"
// espera no máximo alguns segundos por chamada; o Claude chama "aguardar" de novo até terminar.
import { validarNome } from './bnmp.js';

export class GerenteDeConsulta {
  /** @param {{executar: Function, executarLote?: Function}} deps */
  constructor({ executar, executarLote }) {
    this.executar = executar;
    this.executarLote = executarLote;
    this.atual = null; // {id, nome, lote, status, etapa, resultado, erro, promessa, controle}
    this.seq = 0;
  }

  estado() {
    if (!this.atual) return { status: 'ocioso' };
    const { nome, lote, status, etapa, resultado, erro, formato } = this.atual;
    return { status, nome, lote: !!lote, etapa, resultado, erro, formato };
  }

  // Dispara um trabalho em segundo plano (consulta única ou lote) e devolve o estado inicial.
  _iniciarTrabalho(c, tarefa) {
    this.atual = c;
    const progresso = etapa => { if (this.atual === c && c.status === 'em_andamento') c.etapa = etapa; };
    // new Promise chama o executor já agora (não no próximo tick): um cancelar() logo em seguida o alcança.
    c.promessa = new Promise(r => r(tarefa(progresso, c.controle.signal)))
      .then(res => { if (this.atual === c) { c.status = 'concluida'; c.resultado = res; c.etapa = 'fim'; } },
            err => { if (this.atual === c) { c.status = 'erro'; c.erro = String(err && err.message || err); c.etapa = 'fim'; } });
    return this.estado();
  }

  _exigirLivre() {
    if (this.atual && this.atual.status === 'em_andamento') {
      throw new Error(`Já existe uma consulta em andamento (${this.atual.nome}). Aguarde ou cancele antes de começar outra.`);
    }
  }

  iniciar(nome, opcoes = {}) {
    const limpo = validarNome(nome);
    this._exigirLivre();
    const controle = new AbortController();
    const c = { id: ++this.seq, nome: limpo, lote: false, status: 'em_andamento', etapa: 'abrindo_navegador', controle, formato: opcoes.formato };
    return this._iniciarTrabalho(c, (progresso, sinal) => this.executar(limpo, { ...opcoes, sinal }, progresso));
  }

  iniciarLote(nomes, opcoes = {}) {
    if (!Array.isArray(nomes) || nomes.length === 0) throw new Error('Lista vazia: informe ao menos um nome.');
    const validos = nomes.filter(n => { try { validarNome(n); return true; } catch { return false; } });
    if (validos.length === 0) throw new Error('Nenhum nome válido na lista (verifique curingas e nomes muito curtos).');
    this._exigirLivre();
    const controle = new AbortController();
    const rotulo = `lote (${validos.length} nome${validos.length > 1 ? 's' : ''})`;
    const c = { id: ++this.seq, nome: rotulo, lote: true, status: 'em_andamento', etapa: 'abrindo_navegador', controle };
    return this._iniciarTrabalho(c, (progresso, sinal) => this.executarLote(nomes, { ...opcoes, sinal }, progresso));
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
