---
name: consulta-mandados-bnmp
description: Use when someone asks whether a person has a mandado de prisão (arrest warrant) in Brazil, mentions BNMP, Banco Nacional de Medidas Penais e Prisões, portalbnmp.cnj.jus.br or "Central de Mandados", or wants to add a mandados de prisão lookup to a web, mobile, desktop or backend system. Also when an attempt hit the portal's reCAPTCHA or a 403.
---

# Consulta de mandados de prisão no BNMP (CNJ)

## A regra que decide tudo

O portal do BNMP só responde a um **navegador visível**, numa sessão em que **uma pessoa marcou o reCAPTCHA**. Fora disso, a resposta é 403 ou 401. Portanto:

- toda consulta tem uma pessoa na frente da tela;
- nada contorna o captcha.

Nunca use:

- serviço que resolve captcha (2captcha, anti-captcha, CapSolver…);
- navegador headless, "stealth" ou user-agent falso;
- cookie ou token de uma sessão reaproveitado em outra pessoa, máquina ou servidor;
- proxy no backend, ou troca de IP depois de um 403;
- sessões em paralelo;
- busca com curinga (`*`) para baixar a base inteira.

Se o pedido só funcionaria assim, diga isso e ofereça um dos caminhos abaixo.

## Qual caminho usar

| Situação | Caminho |
|---|---|
| Pediram a você (Claude) para consultar um nome | **Rodar o script** (seção 1) |
| Sistema desktop ou interno que roda no PC de quem consulta (Python, Node, .NET, Electron, planilha com macro…) | **Chamar o script como subprocesso** e ler o JSON (seção 2) |
| App web ou mobile usado por outras pessoas (o servidor não tem ninguém na frente) | **Passagem para o portal**: o app copia o nome e abre o BNMP. Ver `integracao-app.md` |
| Consulta automática, agendada, em lote ou sem pessoa | **Não existe caminho permitido.** Explique o motivo (captcha por sessão) e ofereça a passagem para o portal ou o script com uma pessoa |

## 1. Rodar o script

O script fica em `scripts/consulta_bnmp.py`, nesta pasta da skill. Depende só de Python 3.9+ e Playwright.

```bash
pip install playwright        # uma vez; usa o Edge ou o Chrome já instalados
python "<pasta-da-skill>/scripts/consulta_bnmp.py" "Maria da Silva" --pdf --saida bnmp-saida
```

1. **Avise a pessoa antes de rodar:** vai abrir uma janela do navegador e ela precisa marcar "Não sou um robô" (até 5 minutos, ajustável com `--espera`).
2. Rode o comando em primeiro plano, com timeout de pelo menos 6 minutos.
3. O Edge mostra uma faixa amarela sobre `--no-sandbox`. Ela vem do Playwright e não atrapalha; avise a pessoa para não fechar a janela por causa dela. A janela fecha sozinha no fim.
4. A **saída padrão é só o JSON**, gravado assim que o resultado chega e antes de fechar o navegador; os avisos vão para a saída de erro. O mesmo JSON fica em `bnmp-saida/consulta_<nome>_<data>.json`, e os PDFs em `bnmp-saida/pdf/` (com `--pdf`).

Códigos de saída:

| Código | Significa | Faça |
|---|---|---|
| 0 | ok (mesmo com zero mandados) | Mostre o resultado |
| 2 | nome inválido (vazio, curinga, sem letras) | Peça o nome completo |
| 3 | o portal bloqueou (403) | **Pare.** Não repita hoje, não troque IP nem navegador |
| 4 | captcha não resolvido ou sessão recusada | Pergunte se a pessoa quer tentar de novo |
| 5 | outro erro do portal (429, 500…) | Tente mais tarde, uma vez |
| 6 | falta o Playwright ou um navegador | Instale (`pip install playwright`; sem Edge/Chrome: `python -m playwright install chromium`) |

Formato do JSON:

```json
{"busca": "Maria da Silva", "consultado_em": "2026-11-26T10:00:00", "fonte": "https://portalbnmp.cnj.jus.br/#/pesquisa-peca",
 "total_no_portal": 1, "aviso": "...homônimos...",
 "mandados": [{"numero": "...", "nome": "MARIA DA SILVA", "alcunha": "", "situacao": "Pendente de Cumprimento",
   "data_expedicao": "05/03/2024", "orgao": "1ª Vara Criminal de Porto Alegre", "peca": "Mandado de Prisão",
   "processo": "00001234520248210001", "uf": "RS", "tribunal": "TJRS", "nome_mae": "ANA DA SILVA", "data_nascimento": "02/01/1990",
   "id": 123456, "id_tipo_peca": 1, "pdf": "C:/.../bnmp-saida/pdf/....pdf"}]}
```

**Como apresentar o resultado:**

- Mostre uma tabela com número, situação, peça, órgão, tribunal (sigla tirada do número do processo: STF, STJ, TRF4, TJSP…) e data.
- Diga quantos mandados o portal informou (`total_no_portal`).
- Sempre lembre que a busca é **por nome** e que homônimos são comuns: confira nome da mãe, data de nascimento e processo antes de afirmar que o mandado é da pessoa.
- Zero mandados significa "nada no BNMP para esse nome nesta data". Não é certidão negativa.

## 2. Chamar o script de outro sistema

Copie `scripts/consulta_bnmp.py` para o projeto (é um arquivo só) e chame como subprocesso, na máquina onde a pessoa está:

```python
import json, subprocess, sys

def consultar_bnmp(nome: str, pasta: str = "bnmp-saida", pdf: bool = False) -> dict:
    cmd = [sys.executable, "consulta_bnmp.py", nome, "--saida", pasta] + (["--pdf"] if pdf else [])
    p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=600)
    if p.returncode != 0:
        raise RuntimeError(f"BNMP (código {p.returncode}): {p.stderr.strip()}")
    return json.loads(p.stdout)
```

Em Node, .NET e outros, a lógica é a mesma:

- passe o nome como **argumento** (lista, nunca uma string montada para o shell);
- leia a saída padrão como JSON;
- trate o código de saída pela tabela acima;
- deixe o timeout em 10 minutos (o captcha é humano).

Não rode isso num servidor sem tela. Na consulta não abre nenhuma janela onde a pessoa possa marcar o captcha.

## Erros comuns

- **Buscar o portal com WebFetch, curl ou requests:** volta 403. É o próprio desenho do portal, não instabilidade. Use o script.
- **Achar que um 403 é passageiro e insistir:** o bloqueio aumenta. Pare.
- **Tratar o resultado como prova de identidade:** é busca por nome. Confira os dados.
- **Gravar no sistema os nomes pesquisados "para histórico":** a consulta é do CNJ. Só guarde se o sistema realmente precisar e o dono pedir.
- **Usar a skill para montar base de mandados (curinga, varredura por letras):** fora do escopo. O script recusa curinga de propósito.
