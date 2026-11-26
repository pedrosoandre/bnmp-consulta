"""Consulta mandados de prisão por nome no BNMP (Banco Nacional de Medidas Penais e Prisões, CNJ).

Uso:
    python consulta_bnmp.py "Maria da Silva"                 # resultado em JSON na saída padrão
    python consulta_bnmp.py "Maria da Silva" --pdf           # também baixa o PDF de cada mandado
    python consulta_bnmp.py "Maria da Silva" --saida pasta   # onde gravar o JSON e os PDFs

Como funciona:
    1. Abre o portal do BNMP numa janela VISÍVEL do Edge ou do Chrome (o portal recusa navegador oculto).
    2. A PESSOA marca o reCAPTCHA "Não sou um robô". O script não resolve nem contorna o captcha.
    3. O script preenche o Nome, pesquisa e lê o resultado que o próprio portal devolve à página.
    4. Grava <saida>/consulta_<nome>_<data>.json e imprime o mesmo JSON na saída padrão.

Saída padrão: só o JSON. Mensagens para a pessoa vão para a saída de erro.
Códigos de saída: 0 ok | 2 nome inválido | 3 portal bloqueou (403) | 4 captcha/sessão não validou
                  | 5 outro erro do portal | 6 Playwright ou navegador não instalado.

Requisitos: Python 3.9+, `pip install playwright` e Edge ou Chrome instalados
(sem eles: `python -m playwright install chromium`).
"""
import argparse
import base64
import json
import re
import sys
from datetime import datetime
from pathlib import Path

URL = "https://portalbnmp.cnj.jus.br/#/pesquisa-peca"
API = "https://portalbnmp.cnj.jus.br/bnmpportal/api"
CAMPO_NOME = 'input[name="nomePessoa"]'
BOTAO_PESQUISAR = "span.ui-button-text"

# Código do tribunal (TR) no número CNJ, para a Justiça Estadual (J = 8).
UF_POR_TR = {
    "01": "AC", "02": "AL", "03": "AP", "04": "AM", "05": "BA", "06": "CE", "07": "DF",
    "08": "ES", "09": "GO", "10": "MA", "11": "MT", "12": "MS", "13": "MG", "14": "PA",
    "15": "PB", "16": "PR", "17": "PE", "18": "PI", "19": "RJ", "20": "RN", "21": "RS",
    "22": "RO", "23": "RR", "24": "SC", "25": "SE", "26": "SP", "27": "TO",
}

# Chamadas feitas DENTRO da página, com a sessão que a própria pessoa validou no captcha.
JS_JSON = """async ([url, corpo]) => {
  try {
    const r = await fetch(url, {method: 'POST', credentials: 'include',
      headers: {'accept': 'application/json', 'content-type': 'application/json;charset=UTF-8', 'fingerprint': ''},
      body: corpo});
    return {status: r.status, dados: await r.text()};
  } catch (e) { return {status: 0, dados: String(e)}; }
}"""

JS_PDF = """async ([url]) => {
  try {
    const r = await fetch(url, {method: 'POST', credentials: 'include',
      headers: {'accept': 'application/json, text/plain, */*', 'fingerprint': ''}});
    const blob = await r.blob();
    const b64 = await new Promise((ok, erro) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result).split(',')[1] || '');
      fr.onerror = erro;
      fr.readAsDataURL(blob);
    });
    return {status: r.status, dados: b64};
  } catch (e) { return {status: 0, dados: ''}; }
}"""


class Falha(Exception):
    def __init__(self, codigo: int, mensagem: str):
        super().__init__(mensagem)
        self.codigo = codigo


# ------------------------------------------------------------ partes puras ---

def validar_nome(nome: str) -> str:
    """Nome limpo, ou ValueError. Curingas ficam de fora: esta ferramenta consulta UMA pessoa."""
    limpo = re.sub(r"\s+", " ", nome or "").strip()
    if any(c in limpo for c in "*%?"):
        raise ValueError("Curinga (*, %, ?) não é aceito: informe o nome da pessoa.")
    if len(re.findall(r"[^\W\d_]", limpo)) < 3:
        raise ValueError("Informe o nome da pessoa (pelo menos 3 letras).")
    return limpo


def uf_de(numero_processo) -> str:
    """UF pelo número CNJ (20 dígitos: NNNNNNN DD AAAA J TR OOOO); vazio se não for Justiça Estadual."""
    d = "".join(ch for ch in str(numero_processo or "") if ch.isdigit())
    if len(d) != 20 or d[13] != "8":
        return ""
    return UF_POR_TR.get(d[14:16], "")


def tribunal_de(numero_processo) -> str:
    """Sigla do tribunal pelo segmento (J) e tribunal (TR) do número CNJ (Resolução CNJ 65/2008)."""
    d = "".join(ch for ch in str(numero_processo or "") if ch.isdigit())
    if len(d) != 20:
        return ""
    j, tr = d[13], d[14:16]
    uf = UF_POR_TR.get(tr, "")
    if j == "1":
        return "STF"
    if j == "2":
        return "CNJ"
    if j == "3":
        return "STJ"
    if j == "4":
        return f"TRF{int(tr)}" if tr != "00" else "CJF"
    if j == "5":
        return f"TRT{int(tr)}" if tr != "00" else "TST"
    if j == "6":
        return f"TRE-{uf}" if uf else "TSE"
    if j == "7":
        return "STM" if tr == "00" else "Justiça Militar da União"
    if j == "8":
        return f"TJ{uf}" if uf else ""
    if j == "9":
        return f"TJM-{uf}" if uf else ""
    return ""


def _data_br(iso) -> str:
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", str(iso or ""))
    return f"{m.group(3)}/{m.group(2)}/{m.group(1)}" if m else ""


def resumir(item: dict) -> dict:
    """Um mandado da API do portal, com nomes de campo em português claro."""
    g = lambda k: (item.get(k) or "")  # noqa: E731
    return {
        "numero": g("numeroPecaFormatado") or g("numeroPeca"),
        "nome": g("nomePessoa"),
        "alcunha": g("alcunha"),
        "situacao": g("descricaoStatus"),
        "data_expedicao": _data_br(item.get("dataExpedicao")),
        "orgao": g("nomeOrgao"),
        "peca": g("descricaoPeca"),
        "processo": g("numeroProcesso"),
        "uf": uf_de(item.get("numeroProcesso")),
        "tribunal": tribunal_de(item.get("numeroProcesso")),
        "nome_mae": g("nomeMae"),
        "data_nascimento": _data_br(item.get("dataNascimento")),
        "id": item.get("id"),
        "id_tipo_peca": item.get("idTipoPeca"),
        "pdf": None,
    }


def montar_resultado(busca: str, paginas: list, consultado_em: str) -> dict:
    mandados = [resumir(i) for p in paginas for i in (p.get("content") or [])]
    total = paginas[0].get("totalElements", len(mandados)) if paginas else 0
    return {
        "busca": busca,
        "consultado_em": consultado_em,
        "fonte": URL,
        "total_no_portal": total,
        "mandados": mandados,
        "aviso": ("Resultado da pesquisa por nome no BNMP. Homônimos são comuns: confira nome da mãe, "
                  "data de nascimento e número do processo antes de concluir que o mandado é da pessoa."),
    }


def nome_arquivo(texto) -> str:
    return re.sub(r"[^\w.\-]+", "_", str(texto or "")).strip("._-") or "mandado"


# ------------------------------------------------------------ navegador ------

def _avisar(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def _abrir_navegador(p):
    """Edge, depois Chrome, depois o Chromium do Playwright. Sempre com janela (headless leva 403)."""
    erros = []
    for canal in ("msedge", "chrome", None):
        try:
            kw = {"channel": canal} if canal else {}
            return p.chromium.launch(headless=False, **kw)
        except Exception as e:  # canal não instalado
            erros.append(f"{canal or 'chromium'}: {str(e).splitlines()[0]}")
    raise Falha(6, "Nenhum navegador abriu. Instale o Edge ou o Chrome, ou rode "
                   "`python -m playwright install chromium`.\n" + "\n".join(erros))


def _status_para_falha(status: int) -> Falha:
    if status == 403:
        return Falha(3, "O portal bloqueou o acesso (403). Pare por hoje; não insista nem troque de IP.")
    if status == 401:
        return Falha(4, "O portal não aceitou a sessão (401): o captcha não foi validado ou expirou. Rode de novo.")
    if status == 429:
        return Falha(5, "O portal pediu para desacelerar (429). Tente mais tarde.")
    return Falha(5, f"O portal respondeu com erro (status {status}).")


def consultar(nome: str, saida: Path, pdf: bool, max_paginas: int, espera_s: int, ao_terminar) -> None:
    """Faz a consulta e entrega o resultado a ao_terminar(res) ANTES de fechar o navegador
    (fechar o Edge pode demorar ou falhar, e a consulta não pode se perder por isso)."""
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    except ImportError:
        raise Falha(6, "Falta o Playwright: rode `pip install playwright`.")

    with sync_playwright() as p:
        browser = _abrir_navegador(p)
        try:
            page = browser.new_context(accept_downloads=True).new_page()
            page.goto(URL, wait_until="domcontentloaded", timeout=60_000)
            page.bring_to_front()
            _avisar('>>> Na janela do navegador, marque "Não sou um robô". O resto é automático.')
            campo = page.locator(CAMPO_NOME)
            try:
                campo.wait_for(state="visible", timeout=espera_s * 1000)
            except PWTimeout:
                raise Falha(4, f"O campo Nome não apareceu em {espera_s} s (captcha não resolvido?).")
            campo.fill(nome)
            try:
                with page.expect_response(lambda r: "pesquisa-pecas/filter" in r.url,
                                          timeout=espera_s * 1000) as info:
                    page.locator(BOTAO_PESQUISAR, has_text="Pesquisar").first.click()
            except PWTimeout:
                raise Falha(4, "A pesquisa não foi enviada (o captcha precisa estar marcado antes).")
            resp = info.value
            if resp.status != 200:
                raise _status_para_falha(resp.status)
            primeira = resp.json()
            paginas = [primeira]

            # Demais páginas: mesma chamada que a página fez, só trocando o número da página.
            total_paginas = int(primeira.get("totalPages") or 1)
            url0, corpo = resp.request.url, resp.request.post_data
            for n in range(1, min(total_paginas, max_paginas)):
                page.wait_for_timeout(1500)
                url = re.sub(r"([?&]page=)\d+", rf"\g<1>{n}", url0)
                r = page.evaluate(JS_JSON, [url, corpo])
                if r["status"] != 200:
                    raise _status_para_falha(r["status"])
                paginas.append(json.loads(r["dados"]))
            if total_paginas > max_paginas:
                _avisar(f"Aviso: o portal tem {total_paginas} páginas; li só {max_paginas} (--max-paginas).")

            res = montar_resultado(nome, paginas, datetime.now().isoformat(timespec="seconds"))

            if pdf and res["mandados"]:
                pasta = saida / "pdf"
                pasta.mkdir(parents=True, exist_ok=True)
                for i, m in enumerate(res["mandados"], 1):
                    page.wait_for_timeout(1000)
                    r = page.evaluate(JS_PDF, [f"{API}/certidaos/relatorio/{m['id']}/{m['id_tipo_peca']}"])
                    if r["status"] == 403:
                        raise _status_para_falha(403)
                    dados = base64.b64decode(r["dados"] or "") if r["status"] == 200 else b""
                    if dados[:5] != b"%PDF-":
                        _avisar(f"[{i}/{len(res['mandados'])}] PDF não veio ({m['numero']}, status {r['status']}).")
                        continue
                    destino = pasta / f"{nome_arquivo(m['numero'] or m['id'])}.pdf"
                    destino.write_bytes(dados)
                    m["pdf"] = str(destino.resolve())
                    _avisar(f"[{i}/{len(res['mandados'])}] PDF salvo: {destino.name}")
            ao_terminar(res)
        finally:
            try:
                browser.close()
            except Exception:
                pass


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Consulta mandados de prisão por nome no BNMP (CNJ).")
    ap.add_argument("nome", help="nome completo da pessoa")
    ap.add_argument("--pdf", action="store_true", help="baixa o PDF de cada mandado encontrado")
    ap.add_argument("--saida", default="bnmp-saida", help="pasta do JSON e dos PDFs (padrão: ./bnmp-saida)")
    ap.add_argument("--max-paginas", type=int, default=10, help="limite de páginas de resultado (10 por página)")
    ap.add_argument("--espera", type=int, default=300, help="segundos para a pessoa resolver o captcha")
    a = ap.parse_args(argv)
    for fluxo in (sys.stdout, sys.stderr):  # quem chama lê UTF-8; no Windows o padrão seria cp1252
        if hasattr(fluxo, "reconfigure"):
            fluxo.reconfigure(encoding="utf-8")

    try:
        nome = validar_nome(a.nome)
    except ValueError as e:
        _avisar(str(e))
        return 2

    saida = Path(a.saida)
    gravado = []

    def gravar(res: dict) -> None:
        saida.mkdir(parents=True, exist_ok=True)
        arq = saida / f"consulta_{nome_arquivo(nome)}_{datetime.now():%Y%m%d_%H%M%S}.json"
        texto = json.dumps(res, ensure_ascii=False, indent=2)
        arq.write_text(texto, encoding="utf-8")
        _avisar(f'{len(res["mandados"])} mandado(s) para "{nome}" (total no portal: {res["total_no_portal"]}). '
                f"JSON: {arq.resolve()}")
        print(texto, flush=True)
        gravado.append(arq)

    try:
        consultar(nome, saida, a.pdf, max(1, a.max_paginas), max(30, a.espera), gravar)
    except Falha as e:
        _avisar(str(e))
        return e.codigo
    except Exception as e:  # erros do Playwright/navegador: mensagem curta, sem traceback
        if gravado:  # a consulta já foi entregue; o erro foi só ao fechar o navegador
            return 0
        if type(e).__name__ == "TargetClosedError":
            _avisar("A janela do navegador foi fechada antes de terminar. Rode de novo e deixe a janela aberta.")
            return 4
        _avisar(f"Erro inesperado ({type(e).__name__}): {str(e).splitlines()[0] if str(e) else ''}")
        return 5
    return 0


if __name__ == "__main__":
    sys.exit(main())
