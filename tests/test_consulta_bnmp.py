"""Testes do consulta_bnmp.py sem rede e sem navegador (so as partes puras)."""
import json
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "skills" / "consulta-mandados-bnmp" / "scripts" / "consulta_bnmp.py"
sys.path.insert(0, str(SCRIPT.parent))

import consulta_bnmp as cb  # noqa: E402

ITEM = {
    "id": 123456, "idTipoPeca": 1, "numeroPeca": "0001",
    "numeroPecaFormatado": "0000123-45.2024.8.21.0001.01.0001-01",
    "numeroProcesso": "00001234520248210001", "nomePessoa": "MARIA DA SILVA",
    "alcunha": "Mari", "descricaoStatus": "Pendente de Cumprimento", "dataExpedicao": "2024-03-05",
    "nomeOrgao": "1ª Vara Criminal de Porto Alegre", "descricaoPeca": "Mandado de Prisão",
    "nomeMae": "ANA DA SILVA", "dataNascimento": "1990-01-02",
}


@pytest.mark.parametrize("nome", ["", "   ", "*", "Maria*", "%", "ab", "12345"])
def test_validar_nome_recusa_vazio_curinga_e_sem_letras(nome):
    with pytest.raises(ValueError):
        cb.validar_nome(nome)


def test_validar_nome_limpa_espacos():
    assert cb.validar_nome("  Maria   da  Silva ") == "Maria da Silva"


def test_resumir_traduz_campos_da_api():
    r = cb.resumir(ITEM)
    assert r == {
        "numero": "0000123-45.2024.8.21.0001.01.0001-01",
        "nome": "MARIA DA SILVA",
        "alcunha": "Mari",
        "situacao": "Pendente de Cumprimento",
        "data_expedicao": "05/03/2024",
        "orgao": "1ª Vara Criminal de Porto Alegre",
        "peca": "Mandado de Prisão",
        "processo": "00001234520248210001",
        "uf": "RS",
        "tribunal": "TJRS",
        "nome_mae": "ANA DA SILVA",
        "data_nascimento": "02/01/1990",
        "id": 123456,
        "id_tipo_peca": 1,
        "pdf": None,
    }


def test_resumir_aguenta_campos_ausentes():
    r = cb.resumir({"id": 9, "idTipoPeca": 2})
    assert r["numero"] == "" and r["data_expedicao"] == "" and r["uf"] == "" and r["id"] == 9


def test_uf_so_para_justica_estadual():
    assert cb.uf_de("00001234520248210001") == "RS"
    assert cb.uf_de("00001234520244040001") == ""  # J=4 (federal)
    assert cb.uf_de("123") == ""


def test_montar_resultado_junta_paginas_e_conta():
    paginas = [{"content": [ITEM], "totalElements": 2},
               {"content": [dict(ITEM, id=2, numeroPecaFormatado="B")], "totalElements": 2}]
    res = cb.montar_resultado("Maria da Silva", paginas, "2026-11-26T10:00:00")
    assert res["busca"] == "Maria da Silva"
    assert res["total_no_portal"] == 2
    assert [m["numero"] for m in res["mandados"]] == ["0000123-45.2024.8.21.0001.01.0001-01", "B"]
    assert res["consultado_em"] == "2026-11-26T10:00:00"
    assert res["fonte"] == cb.URL
    json.dumps(res)  # tem de ser serializavel


def test_montar_resultado_sem_mandados():
    res = cb.montar_resultado("Fulano", [{"content": [], "totalElements": 0}], "x")
    assert res["total_no_portal"] == 0 and res["mandados"] == []


def test_nome_arquivo_seguro():
    assert cb.nome_arquivo("0000123-45.2024/8 21") == "0000123-45.2024_8_21"
    assert cb.nome_arquivo("../..") == "mandado"


def test_cli_recusa_curinga_sem_abrir_navegador():
    p = subprocess.run([sys.executable, str(SCRIPT), "*"], capture_output=True, text=True, timeout=60)
    assert p.returncode == 2
    assert "curinga" in p.stderr.lower()


def test_cli_escreve_avisos_em_utf8():
    # Quem chama (Claude Code, Node, .NET) le a saida como UTF-8; no Windows o padrao era cp1252.
    p = subprocess.run([sys.executable, str(SCRIPT), "*"], capture_output=True, timeout=60)
    assert "não é aceito" in p.stderr.decode("utf-8")


def test_janela_fechada_vira_codigo_4_sem_traceback(monkeypatch, capsys):
    class TargetClosedError(Exception):
        pass

    def fecha(*a, **k):
        raise TargetClosedError("Target page, context or browser has been closed")

    monkeypatch.setattr(cb, "consultar", fecha)
    assert cb.main(["Maria da Silva"]) == 4
    err = capsys.readouterr().err
    assert "janela" in err.lower() and "Traceback" not in err


def test_resultado_e_gravado_antes_de_fechar_o_navegador(monkeypatch, capsys, tmp_path):
    # Fechar o Edge pode travar ou falhar; a consulta ja feita nao pode se perder por isso.
    class TargetClosedError(Exception):
        pass

    def consulta_que_falha_ao_fechar(nome, saida, pdf, max_paginas, espera_s, ao_terminar):
        ao_terminar(cb.montar_resultado(nome, [{"content": [ITEM], "totalElements": 1}], "x"))
        raise TargetClosedError("fechou")

    monkeypatch.setattr(cb, "consultar", consulta_que_falha_ao_fechar)
    assert cb.main(["Maria da Silva", "--saida", str(tmp_path)]) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["mandados"][0]["nome"] == "MARIA DA SILVA"
    assert len(list(tmp_path.glob("consulta_*.json"))) == 1


@pytest.mark.parametrize("processo,esperado", [
    ("00002370820241000000", "STF"),          # J=1 (o mandado de teste real era do STF e saía sem nada)
    ("00001234520243000000", "STJ"),
    ("00001234520244040001", "TRF4"),
    ("00001234520245040001", "TRT4"),
    ("00001234520245000001", "TST"),
    ("00001234520246210001", "TRE-RS"),
    ("00001234520246000001", "TSE"),
    ("00001234520247000001", "STM"),
    ("00001234520248260001", "TJSP"),
    ("00001234520249210001", "TJM-RS"),
    ("123", ""),
])
def test_tribunal_pelo_numero_cnj(processo, esperado):
    assert cb.tribunal_de(processo) == esperado


def test_url_da_pagina_cria_ou_troca_o_parametro():
    assert cb.url_da_pagina("https://x/filter?page=0&size=10", 2) == "https://x/filter?size=10&page=2"
    assert cb.url_da_pagina("https://x/filter?size=10", 1) == "https://x/filter?size=10&page=1"
    assert cb.url_da_pagina("https://x/filter", 3) == "https://x/filter?page=3"
