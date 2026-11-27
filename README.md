<p align="center">
  <img src="docs/capa.webp" alt="Conector BNMP â€“ Mandados de PrisÃ£o para o Claude Desktop" width="100%">
</p>

<p align="center">
  <a href="https://github.com/pedrosoandre/bnmp-consulta/releases/latest"><img src="https://img.shields.io/badge/Claude%20Desktop-extens%C3%A3o-c96442?style=flat-square" alt="ExtensÃ£o para o Claude Desktop"></a>
  <img src="https://img.shields.io/badge/Windows%20%7C%20Mac-suportado-1d1b17?style=flat-square" alt="Windows e Mac">
  <a href="#para-desenvolvedores-skill-do-claude-code-e-integraÃ§Ã£o"><img src="https://img.shields.io/badge/Claude%20Code-skill-d97757?style=flat-square" alt="Skill para Claude Code"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licen%C3%A7a-MIT-7aa7ff?style=flat-square" alt="LicenÃ§a MIT"></a>
</p>

<h3 align="center">Consulte mandados de prisÃ£o do CNJ conversando com o Claude.<br>VocÃª marca o captcha; o Claude traz a tabela e os PDFs oficiais.</h3>

---

O **BNMP** (Banco Nacional de Medidas Penais e PrisÃµes, do CNJ) Ã© a fonte oficial dos mandados de prisÃ£o expedidos por todos os tribunais do Brasil. Ã‰ pÃºblico, mas foi feito para consulta manual: uma tela, um captcha, uma pessoa de cada vez.

Este **conector do Claude Desktop** coloca o BNMP dentro da conversa. (No Claude Desktop, conectores locais como este sÃ£o instalados como **extensÃµes**, por isso o arquivo Ã© um `.mcpb`.)

> **VocÃª:** Tem mandado de prisÃ£o para Maria da Silva? Baixa os PDFs.
>
> **Claude:** abre o portal numa janela pequena â†’ vocÃª marca "NÃ£o sou um robÃ´" â†’ o Claude pesquisa, lÃª os resultados, baixa os PDFs e responde com a tabela.

Sem terminal, sem Python, sem programar.

## Instalar em 1 minuto

1. Baixe o arquivo **`bnmp-consulta.mcpb`** da [Ãºltima versÃ£o](https://github.com/pedrosoandre/bnmp-consulta/releases/latest).
2. No **Claude Desktop**, vÃ¡ em **ConfiguraÃ§Ãµes â†’ ExtensÃµes â†’ ConfiguraÃ§Ãµes avanÃ§adas â†’ Instalar extensÃ£oâ€¦** e escolha o arquivo.
3. Numa conversa, pergunte: *"Tem mandado de prisÃ£o para Maria da Silva?"*
4. Marque "NÃ£o sou um robÃ´" na janela que abrir. Ela fecha sozinha no fim.

Precisa do Microsoft Edge ou do Google Chrome instalado (o Windows jÃ¡ vem com o Edge). Os registros (JSON) e os PDFs ficam em `Documentos\BNMP consultas`, ou na pasta que vocÃª escolher nas configuraÃ§Ãµes da extensÃ£o.

> Funciona no **Claude Desktop para Windows e Mac**. NÃ£o funciona no claude.ai pelo navegador nem no app do celular, porque o captcha precisa abrir uma janela no seu computador.

## O que dÃ¡ para pedir

| Pedido | O que acontece |
|---|---|
| *"Tem mandado para Fulano?"* | Tabela com nÃºmero, situaÃ§Ã£o, peÃ§a, tribunal, Ã³rgÃ£o, datas e filiaÃ§Ã£o |
| *"SÃ³ me diz sim ou nÃ£o para Fulano"* | Resposta curta: SIM/NÃƒO, quantos mandados e em quais tribunais |
| *"Consulta Fulano e baixa os PDFs"* | TambÃ©m baixa o PDF oficial de cada mandado |
| *"Verifica estes 5 sÃ³cios: â€¦"* | Consulta em lote: um captcha vale para atÃ© 10 nomes, na mesma janela |

## Ferramentas da extensÃ£o

| Ferramenta | Para quÃª |
|---|---|
| `consultar_mandados_bnmp` | ComeÃ§a a consulta de um nome (opÃ§Ãµes: PDFs, nÂº de pÃ¡ginas, resposta curta) |
| `consultar_mandados_bnmp_em_lote` | Consulta vÃ¡rios nomes com um captcha sÃ³ |
| `resultado_consulta_bnmp` | Traz o andamento ou o resultado |
| `cancelar_consulta_bnmp` | Cancela e fecha a janela |

## Para quem Ã©

| Setor | Onde a consulta entra |
|---|---|
| **Advocacia, defensoria e assessoria jurÃ­dica** | SituaÃ§Ã£o atualizada de clientes e partes, com o mandado em PDF para o processo |
| **Compliance, PLD e KYC** | Due diligence de sÃ³cios, administradores, fornecedores e clientes de alto risco |
| **Bancos, fintechs e crÃ©dito** | Etapa extra na anÃ¡lise de cadastros de risco elevado |
| **FusÃµes, aquisiÃ§Ãµes e investimentos** | Checagem dos sÃ³cios e gestores da empresa-alvo |
| **SeguranÃ§a privada, escolas, clÃ­nicas e cuidadores** | Quem vai trabalhar em Ã¡reas sensÃ­veis ou com pessoas vulnerÃ¡veis (veja [Uso responsÃ¡vel](#uso-responsÃ¡vel)) |
| **Jornalismo e checagem de fatos** | Confirmar, na fonte oficial, a situaÃ§Ã£o de figuras pÃºblicas |

## Para desenvolvedores: skill do Claude Code e integraÃ§Ã£o

O mesmo repositÃ³rio traz uma **skill para o Claude Code** e um script em Python que roda sozinho, para levar a consulta para dentro de qualquer sistema.

### Instalar a skill no Claude Code

No Claude Code:

```
/plugin marketplace add pedrosoandre/bnmp-consulta
/plugin install bnmp-consulta@bnmp-consulta
```

E uma vez no computador:

```
pip install playwright
```

A skill usa o Edge ou o Chrome que vocÃª jÃ¡ tem. Se nÃ£o tiver nenhum dos dois, rode tambÃ©m `python -m playwright install chromium`.

### Usar a skill

PeÃ§a do jeito que vocÃª falaria:

> **"Consulta se a Maria da Silva tem mandado de prisÃ£o e baixa os PDFs."**
>
> **"Verifica no BNMP os trÃªs sÃ³cios deste contrato social."**
>
> **"Coloca no meu sistema um botÃ£o de consulta de mandados na ficha do cliente."**
>
> **"Meu app em React precisa de uma tela de consulta de mandados."**

O Claude escolhe sozinho o caminho certo para cada caso: consultar agora, integrar no seu backend ou criar a tela no seu app.

### Integrar em qualquer sistema

O coraÃ§Ã£o da skill Ã© um Ãºnico arquivo, [`consulta_bnmp.py`](skills/consulta-mandados-bnmp/scripts/consulta_bnmp.py), que depende sÃ³ do Playwright. Copie para o seu projeto e chame:

```bash
python consulta_bnmp.py "Maria da Silva" --pdf --saida bnmp-saida
```

**Python**

```python
import json, subprocess, sys

def consultar_bnmp(nome: str) -> dict:
    p = subprocess.run([sys.executable, "consulta_bnmp.py", nome, "--pdf"],
                       capture_output=True, text=True, encoding="utf-8", timeout=600)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip())
    return json.loads(p.stdout)
```

**Node.js**

```js
import { execFile } from "node:child_process";

export const consultarBnmp = (nome) => new Promise((ok, falha) =>
  execFile("python", ["consulta_bnmp.py", nome, "--pdf"], { encoding: "utf8", timeout: 600_000 },
    (erro, stdout, stderr) => (erro ? falha(new Error(stderr.trim())) : ok(JSON.parse(stdout)))));
```

**App web ou mobile para o pÃºblico?** O servidor nÃ£o consegue resolver o captcha por ninguÃ©m. Nesse caso, o app copia o nome e abre o portal para a pessoa. O exemplo pronto, com as armadilhas jÃ¡ resolvidas (`window.open` com `noopener` devolvendo `null`, Ã¡rea de transferÃªncia que falha em WebView, pop-up bloqueado), estÃ¡ em [`integracao-app.md`](skills/consulta-mandados-bnmp/integracao-app.md).

### O que vocÃª recebe

```json
{
  "busca": "Maria da Silva",
  "consultado_em": "2026-11-26T10:20:24",
  "fonte": "https://portalbnmp.cnj.jus.br/#/pesquisa-peca",
  "total_no_portal": 1,
  "mandados": [{
    "numero": "0001234-56.2024.8.26.0050.01.0001-01",
    "nome": "MARIA DA SILVA",
    "situacao": "Pendente de Cumprimento",
    "peca": "Mandado de PrisÃ£o",
    "orgao": "1Âª Vara Criminal de SÃ£o Paulo",
    "tribunal": "TJSP",
    "uf": "SP",
    "data_expedicao": "05/03/2024",
    "processo": "00012345620248260050",
    "nome_mae": "ANA DA SILVA",
    "data_nascimento": "02/01/1990",
    "pdf": "bnmp-saida/pdf/0001234-56.2024.8.26.0050.01.0001-01.pdf"
  }]
}
```

*(Dados fictÃ­cios; principais campos. O JSON tambÃ©m traz alcunha e identificadores internos do portal.)* Cada consulta tambÃ©m fica gravada em `bnmp-saida/consulta_<nome>_<data>.json`, o que serve de trilha de auditoria.

CÃ³digos de saÃ­da para o seu sistema tratar:

| CÃ³digo | Significa |
|---|---|
| `0` | Ok, inclusive quando nÃ£o hÃ¡ mandados |
| `2` | Nome invÃ¡lido |
| `3` | O portal bloqueou (403): pare e tente outro dia |
| `4` | Captcha nÃ£o resolvido ou janela fechada |
| `5` | Outro erro do portal |
| `6` | Falta o Playwright ou um navegador |

## Feita para nÃ£o dar dor de cabeÃ§a

- **Sem truque com o captcha.** Quem resolve Ã© uma pessoa, sempre. Nada de serviÃ§o de quebra de captcha, navegador oculto ou sessÃ£o reaproveitada.
- **Sem coleta em massa.** A skill consulta uma pessoa por vez e recusa curingas (`*`) de propÃ³sito.
- **Respeita o portal.** Pausas entre chamadas, e no primeiro bloqueio (403) ela para em vez de insistir.
- **NÃ£o guarda o que vocÃª nÃ£o pediu.** Grava sÃ³ o JSON e os PDFs da consulta, na pasta que vocÃª escolher.
- **Testada.** Testes automÃ¡ticos sem rede (Python e Node), mais consultas reais no portal.

Na prÃ¡tica, o seu time de compliance, jurÃ­dico ou seguranÃ§a da informaÃ§Ã£o consegue aprovar o uso sem ressalvas sobre a forma de acesso.

## Uso responsÃ¡vel

- **HomÃ´nimos:** a busca Ã© por nome, e nomes se repetem. Antes de concluir que um mandado Ã© da pessoa, confira nome da mÃ£e, data de nascimento e nÃºmero do processo.
- **NÃ£o Ã© certidÃ£o:** "nenhum mandado" significa nada no BNMP para aquele nome naquela data. NÃ£o substitui certidÃ£o de antecedentes.
- **ContrataÃ§Ãµes:** o TST firmou tese (IRR 243000-58.2013.5.13.0023) de que exigir antecedentes criminais de candidato sÃ³ Ã© legÃ­timo quando hÃ¡ previsÃ£o em lei, quando a natureza do ofÃ­cio exige ou quando o cargo pede grau especial de confianÃ§a. Exemplos: cuidadores, motoristas de carga, vigilantes e quem lida com armas, valores ou informaÃ§Ãµes sigilosas. Fora disso, a checagem pode gerar indenizaÃ§Ã£o por dano moral. Use com critÃ©rio.
- **DecisÃ£o final de uma pessoa:** o resultado Ã© um insumo. A decisÃ£o sobre alguÃ©m deve passar por uma pessoa que analise o caso.

## Perguntas frequentes

**DÃ¡ para rodar sozinho, de madrugada, numa lista de mil nomes?**
NÃ£o, e isso Ã© proposital. O portal exige um captcha por sessÃ£o. Automatizar isso significaria burlar uma proteÃ§Ã£o do CNJ, e este projeto nÃ£o faz isso. O mÃ¡ximo Ã© o lote: um captcha para atÃ© 10 nomes.

**Funciona num servidor na nuvem?**
SÃ³ se houver uma pessoa na frente da tela para marcar o captcha. Para apps abertos ao pÃºblico, use a [passagem para o portal](skills/consulta-mandados-bnmp/integracao-app.md).

**Preciso de conta ou cadastro no CNJ?**
NÃ£o. O BNMP Ã© pÃºblico.

**Preciso do Claude Code?**
NÃ£o. Para conversar, basta o Claude Desktop com a extensÃ£o. O Claude Code e o script `consulta_bnmp.py` sÃ£o para quem desenvolve.

**Quanto custa?**
Nada. Ã‰ cÃ³digo aberto, sob a licenÃ§a MIT.

**E se o CNJ mudar o portal?**
O script pode parar de funcionar atÃ© ser atualizado. [Abra uma issue](https://github.com/pedrosoandre/bnmp-consulta/issues); contribuiÃ§Ãµes sÃ£o bem-vindas.

## Estrutura

```
.claude-plugin/                     manifesto do plugin e do marketplace
skills/consulta-mandados-bnmp/
  SKILL.md                          instruÃ§Ãµes que o Claude segue
  integracao-app.md                 guia para apps web e mobile
  scripts/consulta_bnmp.py          a consulta (um arquivo, sÃ³ depende do Playwright)
conector/                           extensÃ£o do Claude Desktop (servidor MCP em Node), empacotada como .mcpb
  server/                           servidor; usa o Edge/Chrome jÃ¡ instalados
  test/                             testes (npm test), sem rede
tests/                              testes automÃ¡ticos, sem rede
```

## Testes

```
pip install pytest playwright
python -m pytest -q
cd conector && npm install && npm test
```

---

<sub>Projeto independente e de cÃ³digo aberto. **NÃ£o tem vÃ­nculo com o Conselho Nacional de JustiÃ§a (CNJ) nem com a Anthropic.** Claude Ã© marca da Anthropic. Os dados vÃªm do portal pÃºblico do BNMP e pertencem a quem os publica. LicenÃ§a [MIT](LICENSE).</sub>
