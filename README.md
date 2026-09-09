# LUI Language

Extensão do VS Code publicada como **`Pedrilsk.lui-language`** para a linguagem de interface **Luna UI (`.lui`, `.lmod` e `.lpe`)**, baseada nas implementações reais de OTML, `UIStyler`, `UIWidget`, `DPUnit` e nos widgets Lua fornecidos.

## O que esta versão faz

- Realce de sintaxe para declarações, propriedades, widgets, estados, comandos, listas, cores, unidades e blocos Lua multilinha.
  - `$hover`, `$changed !focus` e transições como `$checked-in` usam scopes próprios de state.
  - `@field`, `@bind`, `@slot`, `@transition` e demais comandos são visualmente separados das propriedades comuns.
  - O argumento também recebe identidade própria: sinal de slot, variável, propriedade ou state.
- Diagnósticos enquanto você digita:
  - tabs e indentação diferente de 2 espaços;
  - salto inválido de profundidade;
  - sintaxe raiz inválida;
  - elementos, heranças e classes de estilo não encontrados;
  - comandos desconhecidos;
  - estados não registrados;
  - layouts/alinhamentos inválidos;
  - parâmetros e tempos exatos de `@transition`, `@animation` e `@repeat`;
  - cores hexadecimais malformadas;
  - quantidade e formato de valores `DPUnit`, `Point`, `Size` e `Rect`.
- Autocomplete de elementos, classes, aliases de cor, propriedades, comandos, estados, unidades e valores enumerados.
- Ir para definição de elementos, classes de estilo e aliases de cor do projeto.
- Hover, símbolos do documento e folding por indentação.
- Indexação automática de `.lui`/`.lml`/`.otml`, heranças `extends/newclass` em Lua, aliases `Color::registerAlias` e propriedades encontradas em parsers C++/Lua.
- Suporte próprio a color schemes `.lml`, com destaque de aliases e hex, diagnóstico, autocomplete, hover e Ctrl+Click.
- Amostras de cor nativas do editor para hex, aliases `.lml` e cadeias de aliases usadas em `.lui`.
- Prévia no hover e Ctrl+Click para abrir assets locais de `image-source`, `icon-source` e variantes `*-image-source`.
- Fontes de styles externas e ordenadas, com resolução de `@undef` e sobrescritas como no `UIStyler`.
- Regiões Lua embutidas em valores de `!property` e nos comandos Lua `@slot`, `@slotRet`, `@field` e `@bind`, usando a extensão Lua já instalada no VS Code.
- Comando **Luna UI: Reindex Workspace**.
- Comando **Luna UI: Show Style Load Order**.

## Instalação

1. Abra a paleta de comandos do VS Code.
2. Execute **Extensions: Install from VSIX...**.
3. Selecione `lui-language-0.1.5.vsix`.
4. Abra a pasta do game. Os styles globais podem ficar fora dela e ser apontados por configuração.

Para depurar a extensão pelo código-fonte, abra esta pasta no VS Code e pressione `F5`.

## Configuração recomendada

As propriedades de widgets variam entre os games. Por isso, `lunaUI.diagnostics.unknownProperties` começa como `off`; ative `warning` ou `error` depois que o workspace completo estiver aberto e indexado. Elementos desconhecidos começam como `warning`.

```json
{
  "editor.insertSpaces": true,
  "editor.tabSize": 2,
  "lunaUI.diagnostics.unknownProperties": "warning",
  "lunaUI.diagnostics.unknownElements": "warning",
  "lunaUI.diagnostics.unknownColorAliases": "warning"
}
```

## Styles externos e ordem de load

Quando `lunaUI.styleSources` está vazio, a extensão procura `.lui`, `.lml` e `.otml` no workspace. Quando a opção contém fontes, somente esses caminhos alimentam o índice de styles; os `.lua` e C++ do game continuam sendo encontrados normalmente no workspace aberto.

A ordem do array é a ordem entre fontes. Dentro de uma fonte, `files` define a ordem exata. Sem `files`, a pasta é percorrida recursivamente em ordem alfabética de caminho, mas essa ordem é considerada apenas uma descoberta: a extensão não gera diagnósticos “ainda não carregado neste ponto” porque não pode afirmar que ela corresponde ao runtime.

```json
{
  "lunaUI.styleSources": [
    {
      "name": "Luna global",
      "path": "D:/dev/luna/styles",
      "files": [
        "00-core.lui",
        "10-widgets.lui"
      ]
    },
    {
      "name": "Game",
      "path": "${workspaceFolder}/styles",
      "files": [
        "theme-game.lui",
        "windows"
      ]
    }
  ]
}
```

Também são aceitos `${workspaceFolder:nome}`, `${env:VAR}` e `~`. Uma entrada de `files` pode ser arquivo ou pasta; pastas são expandidas recursivamente. Use **Luna UI: Show Style Load Order** para conferir a sequência resolvida e quais definições foram removidas ou substituídas.

O modelo respeita `@undef`: ele remove a definição ativa naquele ponto. Repetir um elemento sem `@undef` gera aviso, embora a declaração mais nova passe a ser a ativa, igual ao comportamento observado no runtime. Classes `.nome` posteriores também substituem as anteriores.

## Color schemes `.lml`

Arquivos `.lml` são registrados como **Luna UI Color Scheme** e aceitam definições diretas ou referências a aliases:

```lml
pallet-a-0: #202531
pallet-a-3-light: #0e121c4d
button-idle: pallet-a-3-light
```

A extensão valida nomes, cores hexadecimais, aliases ausentes, autorreferências e entradas fora do nível raiz. Ctrl+Click em `pallet-a-3-light` navega para sua definição, inclusive quando a referência está em um `.lui`.

Um quadrado com a cor final aparece ao lado de referências como `button-idle`, inclusive quando a resolução passa por mais de um alias. O hover também informa o hexadecimal final e a cadeia percorrida. Isso usa o recurso nativo de cores do VS Code; mantenha `editor.colorDecorators` e `lunaUI.colors.decorations.enabled` ativados.

Quando `lunaUI.styleSources` está configurado, o `.lml` precisa estar em uma das pastas informadas ou aparecer na lista `files`, como qualquer outro arquivo de style. Depois de adicionar o caminho, execute **Luna UI: Reindex Workspace**.

## Prévia de imagens e ícones

Ao passar o mouse sobre um valor estático de `image-source`, `icon-source` ou qualquer propriedade terminada em `-image-source`, a extensão mostra a imagem local e o caminho resolvido. Ctrl+Click abre o próprio arquivo no editor. Referências `@FontAwesome-...` e propriedades dinâmicas como `!icon-source:` são ignoradas, pois não correspondem a uma imagem estática conhecida durante a edição.

Sem configuração adicional, a extensão tenta automaticamente, nesta ordem:

1. A pasta do arquivo `.lui` e seus diretórios pais.
2. A pasta aberta no workspace e seus diretórios pais.
3. Outras pastas de um workspace com múltiplas raízes e seus pais.
4. Somente depois disso, os mounts de `lunaUI.assets.sources`.

Isso cobre os três layouts mais comuns: o workspace contém `assets`, `assets` é irmã do workspace (`../assets`) ou a própria pasta `assets` foi aberta como workspace. Neste último caso, `/assets/images_ui/button` vira diretamente `<workspace>/images_ui/button`, sem duplicar `assets/assets`. Caminhos sem extensão continuam tentando as extensões conhecidas em ordem.

Para assets que a descoberta automática não encontra ou quando a raiz virtual não coincide com a pasta física, configure mounts de fallback ordenados:

```json
{
  "lunaUI.assets.sources": [
    {
      "prefix": "/assets",
      "path": "D:/dev/my-game/assets"
    },
    {
      "prefix": "/shared",
      "path": "${workspaceFolder}/../luna-assets"
    }
  ],
  "lunaUI.assets.extensions": [
    "png", "jpg", "jpeg", "webp", "gif", "bmp", "ico", "svg"
  ]
}
```

No primeiro mount, `/assets/images_ui/icon` resolve para `D:/dev/my-game/assets/images_ui/icon.png` (ou a primeira extensão existente). Strings simples em `lunaUI.assets.sources` equivalem a um mount com prefixo `/`. Os mesmos placeholders de `styleSources` são aceitos.

## Ambiente Lua em `!` e comandos `@`

Não é necessário configurar um executável Lua. Instale e configure normalmente a extensão Lua de sua preferência no VS Code — por exemplo, **Lua Language Server**. A Luna UI transforma somente o valor de uma tag dinâmica em um documento Lua virtual:

```lui
!height: math.max(18, dpunittopixels('11sp'))
!@transition rotation: MDIWINDOW_MINIMIZE_TIME .. 'ms'
@field formatter: function(value) return tostring(value) end
@slot onClick: togglePanel(self)
@bind self: e_panel
```

`!height:` e `!@transition rotation:` avaliam o conteúdo depois de `:` como expressão Lua. `@field` também avalia uma expressão, enquanto `@slot` e `@slotRet` carregam callbacks/corpos Lua. A extensão Lua instalada fornece realce, autocomplete, hover, assinatura de funções, ir para definição e diagnósticos. As posições são traduzidas de volta para o `.lui`.

`@bind self: e_panel` e `@bind child: childId e_child` declaram `e_panel`/`e_child` no ambiente Lua global, reproduzindo `getglobalenv()` do runtime. A extensão gera `.luna-ui-cache/luna-ui-bindings.lua` com essas declarações, permitindo autocomplete e Ctrl+Click tanto do `.lui` para arquivos Lua externos quanto de um `.lua` para o `@bind` que declarou o objeto.

As declarações técnicas do cache usam `---@source` para apontar à linha original do `@bind`. Assim, Go to Definition solicitado pelo LuaLS abre o `.lui` de origem em vez de deixar o editor no arquivo gerado.

Todos os comandos `@` continuam sendo reconhecidos como diretivas Luna/Lua. O bridge faz uma conversão específica para cada um: conteúdos realmente executados como Lua são enviados ao LuaLS; valores de domínio como `@transition opacity: 200ms`, `@sound` e states permanecem na gramática Luna UI para não produzirem erros Lua falsos.

Para que o servidor Lua aplique o mesmo ambiente, libraries, globals e configuração do game, a extensão mantém arquivos-sombra em `.luna-ui-cache` dentro do workspace correspondente. Eles são atualizados automaticamente e ignorados pelo índice Luna UI. O diretório não fica dentro de `.vscode`, pois esse caminho é ignorado por padrão pelo LuaLS. Você pode adicionar `.luna-ui-cache/` ao `.gitignore` do projeto.

O comando **Luna UI: Open Embedded Lua Shadow** abre o arquivo-sombra correspondente ao `.lui` ativo. Isso permite conferir diretamente o código recebido pela extensão Lua e os diagnósticos publicados por ela.

Qualificadores negados como `*!mobile size:` não são confundidos com expressões Lua. A integração também reconhece uma tag dinâmica depois de qualifiers, como `*mobile !text: tr('Open')`.

A integração começa ativada. Se necessário, pode ser desligada com:

```json
{
  "lunaUI.luaIntegration.enabled": false
}
```

## Regras OTML implementadas

- Dois espaços por nível; tabs são inválidos.
- Um nível só pode aumentar em uma unidade.
- Apenas linhas cujo conteúdo começa com `//` são comentários.
- O primeiro `:` separa tag e valor e torna o nó único.
- `- valor` é um item não nomeado.
- `|`, `|-` e `|+` iniciam valores multilinha.
- Listas inline `[a, b]` recebem realce; o runtime continua sendo a autoridade sobre escape/aspas.
- Unidades `dp`, `rp`, `rh`, `rw`, `p/ph`, `pw`, `sp`, `px`, `mm`, `in`, `pt`, `%` e `em` são reconhecidas.
- Tempos aceitam exclusivamente segundos ou milissegundos, como `0.2s` e `200ms`.
- Cores aceitam `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` ou um alias registrado.
- `Point` e `Size` usam dois valores `DPUnit`; `Rect` usa quatro.
- Arquivos de esquema `.lml` são lidos em ordem, permitindo que um alias referencie outro alias definido anteriormente.

## Limites atuais

Os recursos disponíveis dentro da expressão dependem da extensão Lua instalada e da configuração dela para o workspace. A Luna UI não executa código; ela gera documentos de análise que representam expressões, callbacks e globals do runtime.

Qualificadores de plataforma são analisados estaticamente; a extensão não sabe qual conjunto de qualifiers o executável ativará. Aliases de cor próprios do game são validados quando o `.lml`/`.otml` correspondente está em uma fonte configurada ou quando `Color::registerAlias` aparece no workspace.
