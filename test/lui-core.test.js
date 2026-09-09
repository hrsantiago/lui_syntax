'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const core = require('../lui-core');
const luaEmbedding = require('../lua-embedding');
const assetUtils = require('../asset-utils');

test('parses declarations, properties, widgets and inline lists', () => {
  const parsed = core.parseDocument([
    'Window < UIWindow.flat',
    '  id: main',
    '  size: [320dp, 200dp]',
    '  Label',
    '    text: "Hello"'
  ].join('\n'));
  assert.equal(parsed.diagnostics.length, 0);
  assert.equal(parsed.root.children[0].tag, 'Window < UIWindow.flat');
  assert.equal(parsed.root.children[0].children[0].unique, true);
  assert.equal(parsed.root.children[0].children[2].unique, false);
  assert.equal(parsed.root.children[0].children[2].children[0].value, '"Hello"');
});

test('matches OTML indentation rules', () => {
  const odd = core.parseDocument('Widget < UIWidget\n   id: bad');
  assert.ok(odd.diagnostics.some(item => item.code === 'otml-indent-width'));
  const tab = core.parseDocument('Widget < UIWidget\n\tid: bad');
  assert.ok(tab.diagnostics.some(item => item.code === 'otml-tabs'));
  const jump = core.parseDocument('Widget < UIWidget\n    id: bad');
  assert.ok(jump.diagnostics.some(item => item.code === 'otml-depth-jump'));
});

test('treats only full trimmed lines as comments', () => {
  const parsed = core.parseDocument('Widget < UIWidget\n  text: hello // remains value\n  // comment');
  assert.equal(parsed.nodes[1].value, 'hello // remains value');
  assert.equal(parsed.nodes.length, 2);
});

test('keeps multiline content outside the node tree', () => {
  const parsed = core.parseDocument('Widget < UIWidget\n  @slot onClick: |-\n    local x = 1\n    return x\n  id: ok');
  const slot = parsed.nodes[1];
  assert.equal(slot.multiline, true);
  assert.equal(slot.multilineLines.length, 2);
  assert.equal(parsed.nodes.at(-1).tag, 'id');
});

test('extracts element, class and custom-state symbols', () => {
  const parsed = core.parseDocument('.flat\n  opacity: 0.5\nButton < UIButton.flat\n  @custom-state valid: true');
  const symbols = core.collectLocalSymbols(parsed);
  assert.deepEqual(symbols.elements.map(item => item.name), ['Button']);
  assert.deepEqual(symbols.classes.map(item => item.name), ['flat']);
  assert.deepEqual(symbols.states.map(item => item.name), ['valid']);
});

test('finds class and element definitions declared in the current LUI document', () => {
  const parsed = core.parseDocument('.poppins-medium\nCreatorOrderFieldLabel < Label.poppins-medium');
  assert.deepEqual(core.findLocalDefinitions(parsed, 'poppins-medium', 'class').map(item => item.line), [0]);
  assert.deepEqual(core.findLocalDefinitions(parsed, 'CreatorOrderFieldLabel', 'element').map(item => item.line), [1]);
});

test('validates transitions and animations using runtime ordering', () => {
  const parsed = core.parseDocument([
    'Widget < UIWidget',
    '  @transition opacity: 0.2s cubic ease-inout',
    '  @animation opacity: 1s -1 alternate 0s 1 linear ease-inout',
    '    - 0',
    '    - 1'
  ].join('\n'));
  const issues = core.validateSemantics(parsed, { elements: new Set(['Widget']) });
  assert.equal(issues.filter(item => item.severity === 'error').length, 0);
});

test('accepts Lua-evaluated command tags', () => {
  const parsed = core.parseDocument('Widget < UIWidget\n  !@transition rotation: TIME .. "ms"');
  const issues = core.validateSemantics(parsed, { elements: new Set(['Widget']) });
  assert.equal(issues.length, 0);
});

test('extracts Lua expressions without mistaking negated qualifiers for expressions', () => {
  const parsed = core.parseDocument([
    'Widget < UIWidget',
    "  !height: math.max(10, size)",
    "  !@transition rotation: TIME .. 'ms'",
    '  *!mobile size: 16sp 16sp',
    '  !text: |-',
    "    '[' .. tr('Open') .. ']'"
  ].join('\n'));
  const expressions = core.collectLuaExpressions(parsed);
  assert.deepEqual(expressions.map(item => item.tag), ['height', '@transition rotation', 'text']);
  assert.equal(expressions[2].code, "'[' .. tr('Open') .. ']'");
});

test('builds a mapped Lua virtual document for installed VS Code Lua providers', () => {
  const source = "Widget < UIWidget\n  !height: math.max(10, size)";
  const embedded = luaEmbedding.buildLuaVirtualDocument(source);
  assert.match(embedded.content, /local __lui_expression_1 = math\.max/);
  const mapping = luaEmbedding.mappingAtSource(embedded, 1, source.split('\n')[1].indexOf('math'));
  assert.ok(mapping);
  const virtual = luaEmbedding.sourceToVirtual(mapping, 1, mapping.sourceStart);
  assert.equal(virtual.character, mapping.virtualStart);
  const restored = luaEmbedding.virtualToSource(mapping, virtual.line, virtual.character);
  assert.deepEqual(restored, { line: 1, character: mapping.sourceStart });
});

test('lowers @slot, @field and @bind into valid Lua-oriented shadow code', () => {
  const source = [
    'Widget < UIWidget',
    '  @bind self: e_panel',
    '  @field formatter: function(value) return tostring(value) end',
    '  @slot onClick: togglePanel(e_panel)',
    '  @slot onSetup: |',
    '    local value = getValue()',
    '    applyValue(value)',
    '  @transition opacity: 200ms'
  ].join('\n');
  const parsed = core.parseDocument(source);
  const expressions = core.collectLuaExpressions(parsed);
  assert.deepEqual(expressions.map(item => item.mode), ['global', 'expression', 'chunk', 'chunk']);
  assert.deepEqual(core.collectLuaBindings(parsed).map(item => item.name), ['e_panel']);

  const embedded = luaEmbedding.buildLuaVirtualDocument(source, 'file:///game/ui/panel.lui');
  assert.match(embedded.content, /e_panel = nil/);
  assert.match(embedded.content, /---@source file:\/\/\/game\/ui\/panel\.lui:2/);
  assert.match(embedded.content, /local __lui_expression_2 = function\(value\)/);
  assert.match(embedded.content, /local function __lui_slot_3\(self, \.\.\.\)/);
  assert.match(embedded.content, /togglePanel\(e_panel\)/);
  assert.doesNotMatch(embedded.content, /200ms/);
});

test('@bind child declares its environment variable and smart bind keeps its Lua reference', () => {
  const parsed = core.parseDocument([
    'Widget < UIWidget',
    '  @bind child: label e_label',
    '  @bind text: state.currentText'
  ].join('\n'));
  assert.deepEqual(core.collectLuaBindings(parsed).map(item => item.name), ['e_label']);
  const expressions = core.collectLuaExpressions(parsed);
  assert.equal(expressions[0].mode, 'global');
  assert.equal(expressions[1].mode, 'expression');
  assert.equal(expressions[1].code, 'state.currentText');
});

test('does not hide incomplete Lua functions with a synthetic end', () => {
  const embedded = luaEmbedding.buildLuaVirtualDocument('Widget < UIWidget\n  !text: function()');
  assert.match(embedded.content, /local __lui_expression_1 = function\(\)/);
  assert.doesNotMatch(embedded.content, /\bend\b/);
  const eofMapping = luaEmbedding.closestMappingAtOrBefore(embedded, 99, 0);
  assert.equal(eofMapping.sourceLine, 1);
  assert.equal(eofMapping.expression.tag, 'text');
});

test('replays ordered styles, @undef and game overrides', () => {
  const model = core.buildStyleModel([
    {
      uri: 'global.lui',
      text: '.flat\nBase < UIWidget\nButton < Base.flat'
    },
    {
      uri: 'game.lui',
      text: '@undef Button\nButton < Base.flat\n.flat\n  opacity: 0.8'
    }
  ]);
  assert.equal(model.elements.get('Button').uri, 'game.lui');
  assert.equal(model.classes.get('flat').uri, 'game.lui');
  assert.ok(model.events.some(item => item.kind === 'undef-element' && item.name === 'Button'));
  assert.ok(model.events.some(item => item.kind === 'override-class' && item.name === 'flat'));
  assert.equal(model.diagnostics.some(item => item.code === 'lui-override-without-undef'), false);
});

test('reports invalid import order and duplicate elements without @undef', () => {
  const model = core.buildStyleModel([
    { uri: 'first.lui', text: 'Child < Later.missing\n@undef Unknown' },
    { uri: 'second.lui', text: 'Later < UIWidget\nChild < Later' }
  ]);
  const codes = model.diagnostics.map(item => item.code);
  assert.ok(codes.includes('lui-unknown-base-at-import'));
  assert.ok(codes.includes('lui-unknown-class-at-import'));
  assert.ok(codes.includes('lui-undef-missing'));
  assert.ok(codes.includes('lui-override-without-undef'));
  assert.equal(model.elements.get('Child').uri, 'second.lui');
});

test('matches string_to_seconds exactly', () => {
  assert.equal(core.parseSeconds('200ms'), 0.2);
  assert.equal(core.parseSeconds('0.5S'), 0.5);
  assert.equal(core.parseSeconds(' 1 s '), 1);
  assert.equal(core.parseSeconds('0.5'), undefined);
  assert.equal(core.parseSeconds('1minute'), undefined);
  const parsed = core.parseDocument('Widget < UIWidget\n  @transition opacity: 0.5 linear ease-in');
  const issues = core.validateSemantics(parsed, { elements: new Set(['Widget']) });
  assert.ok(issues.some(item => item.code === 'lui-transition-time'));
});

test('matches DPUnit lexical rules', () => {
  for (const value of ['10', '-.5dp', '1e2px', '50%', '2em', '1ph', '1p']) {
    assert.equal(core.isDPUnit(value), true, value);
  }
  for (const value of ['+1px', '1E2px', '1ms', 'px', '1.2.3dp']) {
    assert.equal(core.isDPUnit(value), false, value);
  }
});

test('validates native colors and geometry values', () => {
  const parsed = core.parseDocument([
    'Widget < UIWidget',
    '  size: 100dp',
    '  pos: 10px nope',
    '  image-clip: 0 0 32px',
    '  color: #12345',
    '  background-color: project-color'
  ].join('\n'));
  const issues = core.validateSemantics(parsed, {
    elements: new Set(['Widget']),
    colorAliases: new Set(['project-color']),
    unknownColorAliases: 'error'
  });
  assert.deepEqual(issues.filter(item => item.code.startsWith('lui-invalid-')).map(item => item.code), [
    'lui-invalid-size', 'lui-invalid-point', 'lui-invalid-rect', 'lui-invalid-color'
  ]);
});

test('recognizes exact hexadecimal color lengths and aliases', () => {
  for (const color of ['#fff', '#ffff', '#ffffff', '#ffffffff']) {
    assert.equal(core.inspectColor(color).valid, true, color);
  }
  for (const color of ['#ff', '#fffff', '#ggg', '#fffffffff']) {
    assert.equal(core.inspectColor(color).valid, false, color);
  }
  assert.equal(core.inspectColor('white').valid, true);
  assert.equal(core.inspectColor('WHITE').valid, false);
});

test('parses, formats and exposes native runtime colors', () => {
  assert.deepEqual(core.parseHexColor('#0e121c4d'), {
    red: 14 / 255, green: 18 / 255, blue: 28 / 255, alpha: 77 / 255
  });
  assert.deepEqual(core.parseHexColor('#f08c'), {
    red: 1, green: 0, blue: 136 / 255, alpha: 204 / 255
  });
  assert.equal(core.formatHexColor(core.parseHexColor('#0e121cff')), '#0e121c');
  assert.equal(core.BUILTIN_COLOR_VALUES.get('orange'), '#ff8c00ff');
  assert.equal(core.BUILTIN_COLOR_VALUES.has('invalid'), false);
});

test('builds ordered asset candidates for virtual mounts and omitted extensions', () => {
  const candidates = assetUtils.candidateAssetPaths(
    '/assets/images_ui/game/icon',
    [{ prefix: '/assets', path: path.resolve('/game/assets') }],
    path.resolve('/game/styles'),
    ['png', 'ico']
  );
  assert.deepEqual(candidates, [
    path.resolve('/game/assets/images_ui/game/icon'),
    path.resolve('/game/assets/images_ui/game/icon.png'),
    path.resolve('/game/assets/images_ui/game/icon.ico')
  ]);
  assert.equal(assetUtils.isAssetSourceProperty('loading-image-source'), true);
  assert.equal(assetUtils.isAssetSourceProperty('font-source'), false);
  assert.equal(assetUtils.isFontAwesomeSource("'@FontAwesome-rounded-12sp-xf044'"), true);
});

test('discovers assets inside, beside or as the opened workspace folder', () => {
  const inside = assetUtils.automaticAssetMounts('/repo/game/styles', ['/repo/game']);
  const insideCandidates = assetUtils.candidateAssetPaths('/assets/icon', inside, undefined, ['png']);
  assert.ok(insideCandidates.indexOf(path.resolve('/repo/game/assets/icon.png'))
    < insideCandidates.indexOf(path.resolve('/repo/assets/icon.png')));

  const besideCandidates = assetUtils.candidateAssetPaths('/assets/icon', inside, undefined, ['png']);
  assert.ok(besideCandidates.includes(path.resolve('/repo/assets/icon.png')));

  const openedAssets = assetUtils.automaticAssetMounts('/repo/assets/styles', ['/repo/assets']);
  const openedCandidates = assetUtils.candidateAssetPaths('/assets/icon', openedAssets, undefined, ['png']);
  assert.ok(openedCandidates.indexOf(path.resolve('/repo/assets/icon.png'))
    < openedCandidates.indexOf(path.resolve('/repo/assets/assets/icon.png')));
});

test('loads LML color aliases in document order', () => {
  const parsed = core.parseDocument([
    'primary: #123456',
    'button: primary',
    'forward: future',
    'future: #abcdef'
  ].join('\n'));
  const colors = core.collectColorAliases(parsed);
  assert.deepEqual(colors.definitions.map(item => item.name), ['primary', 'button', 'future']);
  assert.deepEqual(colors.invalid.map(item => item.name), ['forward']);
  assert.equal(colors.aliases.has('button'), true);
});

test('validates LML aliases, hexadecimal colors and root structure', () => {
  const parsed = core.parseDocument([
    'primary: #123456',
    'button: primary',
    'broken: #12345',
    'missing: unknown-color',
    'self-reference: self-reference',
    '  nested: #fff'
  ].join('\n'));
  const issues = core.validateColorScheme(parsed);
  const codes = issues.map(item => item.code);
  assert.ok(codes.includes('lml-invalid-color'));
  assert.equal(codes.filter(code => code === 'lml-unknown-color-alias').length, 2);
  assert.ok(codes.includes('lml-nested-color'));
  assert.equal(issues.some(item => item.line === 1), false);
});

test('accepts the supplied dark and light LML color schemes', t => {
  const files = [
    path.resolve(__dirname, '../../upload/colorscheme.lml'),
    path.resolve(__dirname, '../../upload/colorscheme_light.lml')
  ];
  if (files.some(file => !fs.existsSync(file))) {
    t.skip('attached color fixtures are not present');
    return;
  }
  const expected = [131, 28];
  files.forEach((file, index) => {
    const parsed = core.parseDocument(fs.readFileSync(file, 'utf8'));
    const colors = core.collectColorAliases(parsed);
    assert.equal(colors.invalid.length, 0, file);
    assert.equal(colors.definitions.length, expected[index], file);
  });
});

test('all supplied LUI examples satisfy structural OTML parsing', t => {
  const roots = [
    path.resolve(__dirname, '../../analysis_sources/styles'),
    path.resolve(__dirname, '../../analysis_sources/game_hunt_analyzer'),
    path.resolve(__dirname, '../../analysis_sources/theme-game.lui')
  ];
  const files = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const stat = fs.statSync(root);
    if (stat.isFile()) files.push(root);
    else {
      for (const name of fs.readdirSync(root)) {
        const file = path.join(root, name);
        if (file.endsWith('.lui')) files.push(file);
      }
    }
  }
  if (!files.length) {
    t.skip('attached LUI fixtures are not present');
    return;
  }
  assert.ok(files.length >= 30);
  for (const file of files) {
    const parsed = core.parseDocument(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(parsed.diagnostics, [], file);
  }
});
