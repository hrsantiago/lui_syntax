# Changelog

## 0.1.7

- `lunaUI.luaIntegration.enabled` agora desativa integralmente o bridge Lua/LuaLS, inclusive providers, ativação da extensão Lua, diagnósticos e geração de cache/meta.
- Ao desligar a integração, arquivos-sombra e bindings gerados pela extensão são removidos com segurança de `.luna-ui-cache`; arquivos desconhecidos do usuário são preservados.
- O hover de imagens locais agora oferece ações para abrir a imagem, mostrá-la no gerenciador de arquivos, copiar seu caminho e copiar a própria imagem para o clipboard.
- O hover de Font Awesome agora identifica o nome do glifo quando disponível e abre a busca oficial já preenchida; a opção de copiar imagem não é exibida para esses ícones.

## 0.1.6

- Referências resolvíveis `parent`, `prev`, `next` e IDs em `anchors.*` agora usam permanentemente a cor de link do tema para indicar Ctrl+Click, sem animação ou hover artificial.
- Adicionada a opção `lunaUI.navigation.referenceHighlight.enabled` para controlar esse destaque.
- Removida a transparência aplicada pelo VS Code a trechos Lua marcados com `DiagnosticTag.Unnecessary`; avisos úteis continuam visíveis sem esmaecer o código.
- Diagnósticos não mapeados de funções/variáveis técnicas do arquivo-sombra deixam de ser projetados sobre o Lua real; erros de parser em EOF, como `function()` sem `end`, continuam sendo remapeados.
- Ctrl+Click em `parent`, `prev` e `next` dentro de propriedades `anchors.*` agora navega para o widget estrutural correspondente.
- Ctrl+Click em referências como `anchors.top: analyzerOptions.bottom` navega para o `id: analyzerOptions` correto, priorizando a declaração-raiz atual para evitar IDs homônimos.
- Corrigida a descoberta de widgets declarados em outros `.lui` do workspace quando `lunaUI.styleSources` está configurado; esses arquivos complementam o índice sem alterar a ordem de `@undef`/sobrescritas.
- Diretórios externos configurados em `lunaUI.styleSources` agora também fornecem símbolos de `.lua`, `.cpp` e headers, permitindo reconhecer classes/APIs do Luna e do UIKit sem abrir seus projetos no workspace.
- `scanCode` controla essa leitura por fonte e **Luna UI: Show Style Load Order** exibe a quantidade de arquivos de código externos indexados.
- `Module` agora é reconhecido como raiz nativa de arquivos `.lmod`.
- `@onLoad` e `@onUnload` agora são comandos válidos e seus valores/blocos são encaminhados à integração Lua.
- O intervalo de loop de `@animation` aceita `0` sem exigir `0ms`; outros valores continuam exigindo `s` ou `ms`.
- Adicionada prévia no hover para referências estáticas `@FontAwesome-estilo-tamanho-xcodigo`.
- Fontes Font Awesome são descobertas automaticamente em `/assets/fonts/`, inclusive quando `assets` é o workspace ou está em algum diretório pai.
- Adicionado `lunaUI.fontAwesome.fontPath` como fallback configurável para um arquivo ou diretório de fontes.
- A prévia usa a fonte local do projeto e não redistribui arquivos Font Awesome Pro no VSIX.
- Ctrl+Click em uma referência Font Awesome abre a fonte efetivamente utilizada.
- Referências estáticas de imagens e Font Awesome permanecem destacadas pela cor azul-ciano `#4FC1FF`, sem animação, fundo ou pulso.
- Globals gerados por `@bind` passam a usar `---@type any` por padrão, evitando falsos positivos `undefined-doc-name` e `inject-field` do LuaLS.
- Adicionado `lunaUI.luaIntegration.bindGlobalType` para projetos que desejem optar explicitamente pela tipagem estrita `UIWidget`.
- `.luna-ui-cache` agora fica oculto por padrão no Explorer e nas pesquisas, mas permanece disponível ao LuaLS para globals, diagnósticos e Ctrl+Click.

## 0.1.5

- O pacote volta a usar a identidade pública `Pedrilsk.lui-language`, podendo atualizar diretamente a extensão `LUI Language` já publicada.
- Preservados o language ID `lui`, as extensões `.lui`, `.lmod` e `.lpe` e a configuração legada `lui.fileExtensions` da versão 0.1.x.
- A resolução automática de assets agora percorre a pasta do `.lui`, as pastas abertas e seus diretórios pais antes dos mounts configurados.
- `/assets/...` funciona quando `assets` está dentro do workspace, em `../assets` ou quando a própria pasta `assets` é o workspace.
- `lunaUI.assets.sources` passa a atuar como fallback explícito, sem desativar a descoberta automática.
- O hover de um asset ausente mostra os primeiros caminhos testados para facilitar o diagnóstico.
- Removido o parâmetro de cache da URI exibida no hover para melhorar a compatibilidade da prévia local.

## 0.6.0

- Adicionados color decorators nativos para hexadecimais, aliases `.lml`, aliases usados em `.lui` e cadeias de aliases.
- O hover de um alias agora informa a cor hexadecimal final e a cadeia usada para resolvê-lo.
- Adicionada prévia local no hover de `image-source`, `icon-source` e propriedades `*-image-source`.
- Ctrl+Click em um source estático abre o PNG/JPG/ICO/SVG/etc. resolvido no editor.
- Adicionados mounts virtuais ordenados em `lunaUI.assets.sources` e extensões configuráveis em `lunaUI.assets.extensions`.
- Assets Font Awesome e propriedades dinâmicas com `!` são ignorados pela resolução estática.

## 0.5.9

- Enter depois de uma linha com conteúdo continua preservando a indentação atual.
- Enter em uma linha vazia indentada recua exatamente um nível de 2 espaços.
- Repetir Enter em linhas vazias permite sair gradualmente de um filho, do widget pai e finalmente chegar à raiz.

## 0.5.8

- Corrigida a indentação automática ao pressionar Enter depois de propriedades de um widget.
- Linhas vazias deixam de ser interpretadas como ordem de recuo e passam a preservar o nível atual.
- O avanço de dois espaços agora ocorre somente depois de widgets/classes, states, `layout`, `@animation` e blocos multilinha `|`.

## 0.5.7

- Adicionado `wordPattern` próprio para símbolos Luna UI com hífen.
- Ctrl+Hover e Ctrl+Click agora destacam referências completas como `.hover-hand` e `pallet-idle`, em vez de somente o segmento sob o cursor.
- States `$state`, comandos `@command` e propriedades dinâmicas `!property` também passam a ser reconhecidos como tokens inteiros pelo editor.

## 0.5.6

- Arquivos `.lml` agora são registrados como a linguagem **Luna UI Color Scheme**, em vez de aparecerem como texto comum.
- Adicionado realce específico para nomes de aliases, referências entre aliases e cores hexadecimais.
- Adicionados diagnósticos de sintaxe, hex inválido, alias ausente, autorreferência e definição aninhada.
- Adicionados autocomplete, hover, símbolos do documento e Ctrl+Click dentro de `.lml` e de referências `.lui` para `.lml`.
- Confirmada a validação integral dos arquivos `colorscheme.lml` e `colorscheme_light.lml` fornecidos.

## 0.5.5

- Globals técnicos gerados para `@bind` agora usam a annotation `---@source` do LuaLS.
- Ctrl+Click em `e_panel` e outros globals abre diretamente a declaração `@bind` no `.lui`, em vez de `luna-ui-bindings.lua` ou outro arquivo-sombra.

## 0.5.4

- `@slot` e `@slotRet` agora são enviados ao LuaLS como callbacks Lua, tanto inline quanto em blocos `|`.
- `@field` agora é analisado como expressão Lua mesmo sem `!`.
- `@bind self` e `@bind child` são convertidos em declarações do ambiente global Lua.
- Adicionado `.luna-ui-cache/luna-ui-bindings.lua`, agregando globals de todos os styles carregados para autocomplete e navegação em arquivos Lua externos.
- Ctrl+Click em um global declarado por `@bind` funciona também a partir de arquivos `.lua` e retorna à declaração no `.lui`.
- Comandos de domínio como `@transition`, `@animation`, `@sound` e states continuam validados pela gramática Luna UI, evitando falsos erros Lua em valores como `200ms`.

## 0.5.3

- O arquivo-sombra Lua passa a ser criado dentro do workspace atual para receber exatamente a configuração, libraries e ambiente do Lua Language Server daquele projeto.
- O cache deixa de ficar sob `.vscode`, diretório ignorado por padrão pelo LuaLS, e passa para `.luna-ui-cache` na raiz do projeto.
- Extensões que contribuem a linguagem Lua são ativadas antes da criação do arquivo-sombra.
- Adicionado comando para abrir e inspecionar o Lua gerado diretamente.
- Somente propriedades iniciadas por `!` recebem Lua embutido; `text: |` comum permanece texto Luna UI.
- Erros Lua publicados no fim do arquivo-sombra, como `function()` sem `end`, voltam para a expressão `!` correspondente.
- Ctrl+Click agora consulta também classes e elementos declarados no próprio documento `.lui`, inclusive antes de salvar/reindexar.
- Diagnósticos dependentes de ordem são desativados quando a ordem veio apenas de descoberta alfabética, evitando falsos positivos como `.poppins-medium`.
- Diagnósticos ordenados de um arquivo aberto são recalculados com o conteúdo atual, sem manter avisos obsoletos enquanto o usuário digita.

## 0.5.2

- O bridge Lua agora usa arquivos-sombra `.lua` reais no armazenamento da extensão, em vez de URIs customizados.
- Corrigida a resolução de símbolos do workspace ao usar Ctrl+Click/Go to Definition dentro de expressões `!`.
- Corrigido o recebimento e o remapeamento de diagnósticos Lua, incluindo expressões incompletas como `function()` sem `end`.
- Os arquivos-sombra não são criados dentro do projeto e não participam do índice Luna UI.

## 0.5.1

- Valores de tags `!property` e `!@command` agora são regiões Lua embutidas.
- Realce, autocomplete, hover, assinatura, navegação e diagnósticos são delegados à extensão Lua instalada no VS Code por meio de documentos virtuais.
- Removida a configuração de executável Lua/LuaJIT da versão 0.5.0; nenhum interpretador externo precisa ser configurado.

## 0.5.0

- Fontes externas de styles configuráveis por arquivo ou pasta, sem exigir que todos os repositórios estejam abertos no workspace.
- Ordem explícita entre fontes e, opcionalmente, entre arquivos de cada fonte.
- Resolução sequencial compatível com `UIStyler`, incluindo `@undef`, definição ativa e sobrescritas de elementos/classes.
- Comando para inspecionar a ordem efetiva, os `@undef` e as substituições encontradas.
- Primeira implementação experimental de validação Lua, substituída pela integração nativa do VS Code em 0.5.1.

## 0.4.0

- States simples, combinados, negados e `-in/-out` agora têm scopes visuais próprios.
- Comandos `@field`, `@bind`, `@slot`, `@transition` e relacionados não são mais capturados como propriedades genéricas.
- Argumentos de comandos recebem scopes específicos para sinais, variáveis, propriedades e states.
- Comandos com blocos Lua `|`, `|-` e `|+` preservam a identidade visual da diretiva.

## 0.3.0

- `Size<T>::operator>>` confirmado e validado como dois valores `DPUnit`.
- Indexação de esquemas de cores `.lml`.
- Resolução sequencial de aliases que referenciam aliases anteriores.
- Índice em fases para registrar aliases nativos antes dos esquemas LML.
- Esquemas fornecidos validados: 131 aliases escuros e 28 aliases claros.

## 0.2.0

- Validação compatível com `string_to_seconds`, incluindo sufixos obrigatórios `s/ms`.
- Validação de hexadecimal e aliases conforme `Color::operator>>`.
- Validação tipada de `DPUnit`, `Point`, `Size`, `Rect` e atalhos de bordas.
- Indexação de aliases de cor C++/OTML.
- Herança Lua `extends/newclass` identificada com a classe-base.
- Autocomplete e hover enriquecidos com tipos, unidades e cores.

## 0.1.0

- Primeiro MVP de suporte a Luna UI/OTML.
- Parser tolerante compatível com a indentação do parser nativo.
- Diagnósticos, autocomplete, hover, definição, símbolos e folding.
- Índice de símbolos do workspace para projetos com estilos e widgets diferentes.
