# Consulta de mandados em app web ou mobile (passagem para o portal)

Use este caminho quando o sistema roda no navegador ou no celular de outras pessoas. O servidor do sistema não pode consultar o BNMP por elas: o portal exige um reCAPTCHA resolvido por quem está na frente da tela e recusa chamadas que não venham de um navegador (403). O que o app faz é **levar a pessoa ao portal com o nome já copiado**. O resultado aparece no próprio site do CNJ.

## O fluxo

1. A pessoa digita o nome e toca em "Consultar no BNMP".
2. O app copia o nome para a área de transferência e abre `https://portalbnmp.cnj.jus.br/#/pesquisa-peca` em outra aba.
3. No portal, a pessoa marca "Não sou um robô", cola o nome no campo Nome e pesquisa.

O portal não aceita o nome pela URL, então copiar é o máximo que dá para adiantar.

## Exemplo (JavaScript puro, adapte ao framework do projeto)

```html
<label for="mdNome">Nome completo da pessoa</label>
<input id="mdNome" autocomplete="off" placeholder="Ex.: Maria da Silva">
<p id="mdErro" class="erro" role="alert"></p>
<button id="mdConsultar" type="button">Consultar no BNMP</button>
<!-- Plano B visível: funciona mesmo com pop-up bloqueado -->
<a id="mdLink" href="https://portalbnmp.cnj.jus.br/#/pesquisa-peca" target="_blank" rel="noopener">Abrir o BNMP</a>

<script>
const BNMP_URL = 'https://portalbnmp.cnj.jus.br/#/pesquisa-peca';

function consultarBnmp() {
  const nome = document.getElementById('mdNome').value.trim();
  const erro = document.getElementById('mdErro');
  if (!nome) { erro.textContent = 'Digite o nome da pessoa.'; return; }
  erro.textContent = '';

  // 1) Copiar ANTES de abrir: alguns navegadores negam a área de transferência depois que a página perde o foco.
  let copia = null;
  try { if (navigator.clipboard && navigator.clipboard.writeText) copia = navigator.clipboard.writeText(nome); }
  catch (e) { copia = null; }

  // 2) SEM 'noopener' no terceiro argumento: com ele, window.open devolve SEMPRE null,
  //    e o app diria "não abriu" com a aba aberta. Corta o vínculo à mão logo depois.
  const w = window.open(BNMP_URL, '_blank');
  if (w) { try { w.opener = null; } catch (e) {} }
  if (!w) { avisar('Não deu para abrir o BNMP. Toque em "Abrir o BNMP".'); document.getElementById('mdLink').focus(); return; }

  // 3) Só diga "copiado" quando a cópia realmente terminar (writeText devolve uma Promise que pode falhar).
  const semCopia = () => avisar('Digite o nome no campo Nome do BNMP.');
  if (!copia) return semCopia();
  copia.then(() => avisar('Nome copiado. Cole no campo Nome do BNMP.'), semCopia);
}

function avisar(msg) { /* use o toast/aviso do próprio app */ console.log(msg); }

document.getElementById('mdConsultar').addEventListener('click', consultarBnmp);
document.getElementById('mdNome').addEventListener('keydown', e => { if (e.key === 'Enter') consultarBnmp(); });
</script>
```

## Pontos que dão errado

| Erro | O que acontece | Certo |
|---|---|---|
| `window.open(url, '_blank', 'noopener')` e testar o retorno | Sempre `null`: o app mostra falha com a aba aberta | Abrir sem o terceiro argumento e fazer `w.opener = null` |
| Mostrar "copiado" sem esperar a Promise | Em WebView/APK e Safari a cópia falha e a pessoa cola outra coisa | Avisar só no `.then` |
| Abrir o portal num `<iframe>` ou WebView embutida no app | O captcha é preso ao domínio do CNJ e não funciona embutido | Aba ou navegador externo |
| Chamar a API `bnmpportal/api` pelo backend | 403 (ou exigiria contornar o captcha, o que não se faz) | Passagem para o portal |
| Gravar o nome pesquisado (localStorage, banco, log) | Guarda dado pessoal sem necessidade | Não gravar; a consulta é do CNJ |
| Pop-up bloqueado sem plano B | Botão "não faz nada" | Link visível "Abrir o BNMP" |

App Android em TWA ou WebView: a aba abre no navegador externo e o app não consegue preencher nada lá. O fluxo acima é o máximo possível.

## Testes que valem a pena (Playwright ou similar)

- Nome vazio: não abre nada e mostra o erro com `role="alert"`.
- Com nome: `window.open` é chamado com `[BNMP_URL, '_blank']` e a área de transferência recebe o nome sem espaços nas pontas.
- `navigator.clipboard` ausente ou rejeitando: abre o portal e o aviso não diz "copiado".
- `window.open` devolvendo `null`: mostra o aviso do pop-up e foca o link.
- Com `window.open` de verdade: a nova página tem `window.opener === null`. Intercepte `https://portalbnmp.cnj.jus.br/**` no **contexto** do navegador (não só na página), para o teste não ir ao portal real.
- Enter no campo dispara a consulta, não outro botão da tela.
