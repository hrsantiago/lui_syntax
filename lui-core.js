'use strict';

const COMMANDS = [
  '@transition', '@field', '@slot', '@slotRet', '@forward-state',
  '@animation', '@sound', '@repeat', '@inherit-property',
  '@custom-state', '@bind', '@undef'
];

const STATES = [
  'active', 'focus', 'hover', 'pressed', 'leftpressed', 'rightpressed',
  'midpressed', 'changed', 'checked', 'disabled', 'on', 'first', 'middle',
  'last', 'alternate', 'dragging', 'hidden', 'controller', 'selected'
];

const UNITS = ['dp', 'rp', 'rh', 'rw', 'p', 'ph', 'pw', 'sp', 'px', 'mm', 'in', 'pt', '%', 'em'];

const EASING_EQUATIONS = [
  'linear', 'quadratic', 'cubic', 'quartic', 'quintic', 'sinusoidal',
  'exponential', 'circular', 'bounce', 'back', 'elastic'
];

const EASING_FUNCTIONS = ['ease-in', 'ease-out', 'ease-inout'];
const LOOP_DIRECTIONS = ['normal', 'reverse', 'alternate', 'alternate-reverse'];
const LAYOUTS = ['anchor', 'horizontalBox', 'verticalBox', 'grid', 'flow', 'circular'];
const ALIGNMENTS = [
  'topLeft', 'topRight', 'bottomLeft', 'bottomRight', 'left', 'right',
  'top', 'bottom', 'center', 'justify', 'topJustify', 'bottomJustify', 'none'
];

const BUILTIN_COLOR_ALIASES = [
  'invalid', 'alpha', 'whiteAlpha', 'blackAlpha', 'white', 'black',
  'red', 'darkRed', 'lightRed', 'green', 'darkGreen', 'lightGreen',
  'blue', 'darkBlue', 'lightBlue', 'pink', 'darkPink', 'lightPink',
  'yellow', 'darkYellow', 'lightYellow', 'teal', 'darkTeal', 'lightTeal',
  'gray', 'darkGray', 'lightGray', 'veryDarkGray', 'orange', 'purple'
];

// Values copied from Color::initColorMap. `invalid` intentionally has no
// preview because its four channels are -1 in the runtime.
const BUILTIN_COLOR_VALUES = new Map(Object.entries({
  alpha: '#00000000',
  whiteAlpha: '#ffffff00',
  blackAlpha: '#00000000',
  white: '#ffffffff',
  black: '#000000ff',
  red: '#ff0000ff',
  darkRed: '#800000ff',
  lightRed: '#ff6666ff',
  green: '#00ff00ff',
  darkGreen: '#008000ff',
  lightGreen: '#66ff66ff',
  blue: '#0000ffff',
  darkBlue: '#000080ff',
  lightBlue: '#6666ffff',
  pink: '#ff00ffff',
  darkPink: '#800080ff',
  lightPink: '#ff66ffff',
  yellow: '#ffff00ff',
  darkYellow: '#808000ff',
  lightYellow: '#ffff66ff',
  teal: '#00ffffff',
  darkTeal: '#008080ff',
  lightTeal: '#66ffffff',
  gray: '#a0a0a0ff',
  darkGray: '#808080ff',
  lightGray: '#c0c0c0ff',
  veryDarkGray: '#707070ff',
  orange: '#ff8c00ff',
  purple: '#7f007fff'
}));

const PROPERTY_TYPES = new Map();
function registerType(type, properties) {
  for (const property of properties.trim().split(/\s+/)) PROPERTY_TYPES.set(property, type);
}

registerType('color', `
  background-color background-color-even background-color-odd border-color-bottom
  border-color-left border-color-right border-color-top color grid-border-color icon-color
  image-color selection-background-color selection-color
`);
registerType('point', 'cell-spacing column-width pos row-height selection');
registerType('size', 'base-image-size default-size overlay-image-size stick-image-size');
registerType('rect', 'icon-clip image-clip');
registerType('dpunit', `
  background-border-radius-bottom background-border-radius-left background-border-radius-right
  background-border-radius-top background-height background-offset-x background-offset-y
  background-width border-width-bottom border-width-left border-width-right border-width-top
  carousel-min-x carousel-min-y cursor-width font-size height icon-height icon-offset-x
  icon-offset-y icon-width image-border-bottom image-border-left image-border-right
  image-border-top image-height image-offset-x image-offset-y image-width margin-bottom
  margin-left margin-right margin-top maximum-height maximum-width minimum-height minimum-width
  padding-bottom padding-left padding-right padding-top text-offset-x text-offset-y
  text-padding-bottom text-padding-left text-padding-right text-padding-top text-wrap-width
  width x y
`);

const SIZE_SHORTCUTS = new Set([
  'size', 'icon-size', 'background-size', 'image-size', 'minimum-size', 'maximum-size'
]);
const POINT_SHORTCUTS = new Set([
  'offset', 'background-offset', 'icon-offset', 'text-offset', 'image-offset'
]);
const RECT_SHORTCUTS = new Set(['rect', 'background-rect', 'icon-rect', 'image-rect']);
const DPUNIT_EDGE_SHORTCUTS = new Set([
  'margin', 'padding', 'border-width', 'image-border', 'text-padding', 'background-border-radius'
]);

// Properties parsed by the supplied C++ core plus the common Lua UIWidget layer.
const CORE_PROPERTIES = new Set(`
align allow-user-focus always-sort-z-index angle-transition auto-bind-rect auto-focus
auto-resize auto-resize-ratio auto-scroll auto-select background-border-radius
background-border-radius-bottom background-border-radius-left background-border-radius-right
background-border-radius-top background-color background-color-even background-color-odd
background-expanded background-height background-offset background-offset-x background-offset-y
background-rect background-size background-width base-image-size base-image-source border-color
border-color-bottom border-color-left border-color-right border-color-top border-width
border-width-bottom border-width-left border-width-right border-width-top carousel-min-x
carousel-min-y carousel-widget-x carousel-widget-y cell-spacing checked children-placeholder
clipping collide-children-by-distance collision-shape color column-width cursor cursor-visible
cursor-width default-size draggable draggable-hold draw-focus-last editable enable-hotkeys enabled
expand fit-children fit-horizontal-children fit-vertical-children fixed-children fixed-position
fixed-size flip-x flip-y focusable font font-auto-resize font-auto-resize-height
font-auto-resize-width font-family font-resize-to-fit font-resize-to-fit-height
font-resize-to-fit-height-only font-resize-to-fit-width font-resize-to-fit-width-only font-size
font-style free-position grid-border-color grid-border-width height icon-align icon-clip
icon-color icon-filter icon-fixed-ratio icon-flip-x icon-flip-y icon-height icon-offset
icon-offset-x icon-offset-y icon-rect icon-rotation icon-size icon-size-unit icon-smooth
icon-source icon-width id image-align image-aspect-ratio image-auto-resize
image-auto-resize-unit image-blend-mode image-border image-border-bottom image-border-left
image-border-relative image-border-right image-border-top image-clip image-color image-dpi
image-filter image-flip-x image-flip-y image-height image-horizontal-auto-fill
image-initial-resize image-offset image-offset-x image-offset-y image-rect image-repeated
image-shader image-shader-level image-size image-smooth image-source
image-vertical-auto-fill image-width initial-angle invert-x invert-y layout margin
margin-bottom margin-left margin-right margin-top max-length max-lines maximum-height
maximum-size maximum-width minimum-height minimum-size minimum-width movement-diagonal-threshold
movement-threshold multiline num-columns num-rows offset on opacity overlay-image-size
overlay-image-source padding padding-bottom padding-left padding-right padding-top
parent-auto-select parent-lock-selection phantom phantom-children plot-adjust
plot-auto-update-delay plot-capacity plot-fill plot-max plot-min plot-update-average-samples
pos post-effect propagate-mouse-event rect resize-mode resize-to-fit-child-height
resize-to-fit-child-width rotation row-height select-on-active selectable
selectable-navigation selectable-navigation-angle selectable-navigation-ensure-visible
selectable-navigation-horizontal-angle selectable-navigation-horizontal-reference
selectable-navigation-reference selectable-navigation-vertical-angle
selectable-navigation-vertical-reference selection selection-background-color selection-color
setup-children-async shift-navigation size sort spacing stick-image-size stick-image-source
text text-align text-auto-resize text-auto-resize-method text-decoration text-hidden
text-hidden-preview text-horizontal-auto-resize text-initial-resize text-justify text-offset
text-offset-x text-offset-y text-padding text-padding-bottom text-padding-left
text-padding-right text-padding-top text-vertical-auto-resize text-wrap text-wrap-width
tooltip tooltip-delay undoable valid-characters variable-x variable-y visible width x y z-index
`.trim().split(/\s+/));

function diagnostic(line, start, end, severity, code, message) {
  return { line, start, end, severity, code, message };
}

function countIndent(raw) {
  let spaces = 0;
  while (raw[spaces] === ' ') spaces += 1;
  return spaces;
}

function isDPUnit(value) {
  // Mirrors DPUnit::operator>>: lowercase e only, no leading '+', and the exact unit set.
  return /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e-?\d+)?(?:dp|rp|rh|rw|p|ph|pw|sp|px|mm|in|pt|%|em)?$/.test(value);
}

function splitStaticValue(value) {
  return value.trim().split(/\s+/).filter(Boolean);
}

function isDPUnitVector(value, counts) {
  const values = splitStaticValue(value);
  return counts.includes(values.length) && values.every(isDPUnit);
}

function parseSeconds(value) {
  const normalized = value.toLowerCase().replaceAll(' ', '');
  const match = normalized.match(/^(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(ms|s)$/);
  if (!match) return undefined;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return undefined;
  return match[2] === 'ms' ? number / 1000 : number;
}

function inspectColor(value, aliases = new Set(BUILTIN_COLOR_ALIASES)) {
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    return { valid: [3, 4, 6, 8].includes(hex.length) && /^[0-9a-fA-F]+$/.test(hex), unknownAlias: false };
  }
  return { valid: aliases.has(value), unknownAlias: !aliases.has(value) };
}

function parseHexColor(value) {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]+$/.test(value)) return undefined;
  let hex = value.slice(1);
  if (![3, 4, 6, 8].includes(hex.length)) return undefined;
  if (hex.length <= 4) hex = [...hex].map(digit => digit + digit).join('');
  if (hex.length === 6) hex += 'ff';
  const channels = hex.match(/../g).map(channel => Number.parseInt(channel, 16) / 255);
  return { red: channels[0], green: channels[1], blue: channels[2], alpha: channels[3] };
}

function formatHexColor(color) {
  if (!color) return undefined;
  const byte = channel => Math.round(Math.max(0, Math.min(1, channel)) * 255)
    .toString(16).padStart(2, '0');
  const rgb = `${byte(color.red)}${byte(color.green)}${byte(color.blue)}`;
  const alpha = byte(color.alpha);
  return `#${rgb}${alpha === 'ff' ? '' : alpha}`;
}

function collectColorAliases(parsed, initialAliases = BUILTIN_COLOR_ALIASES) {
  const aliases = new Set(initialAliases);
  const definitions = [];
  const invalid = [];
  // UIManager::loadColors registers children in document order, so aliases may
  // reference built-ins or an earlier alias from the same LML document.
  for (const node of parsed.root.children) {
    if (!node.unique || !node.tag || !node.value) continue;
    const inspected = inspectColor(node.value, aliases);
    if (inspected.valid) {
      aliases.add(node.tag);
      definitions.push({ name: node.tag, value: node.value, line: node.line, node });
    } else {
      invalid.push({ name: node.tag, value: node.value, line: node.line, node });
    }
  }
  return { aliases, definitions, invalid };
}

function validateColorScheme(parsed, knownAliases = BUILTIN_COLOR_ALIASES) {
  const issues = [...parsed.diagnostics];
  const available = new Set([...BUILTIN_COLOR_ALIASES, ...knownAliases]);
  const local = new Set();
  for (const node of parsed.nodes) {
    if (node.depth !== 0) {
      issues.push(diagnostic(node.line, 0, Math.max(1, node.indent), 'error',
        'lml-nested-color', 'Aliases de cor em .lml devem ficar no nível raiz.'));
      continue;
    }
    if (!node.unique || !node.tag) {
      issues.push(diagnostic(node.line, node.indent, node.raw.length, 'error',
        'lml-color-syntax', 'Use “nome-do-alias: #rrggbb” ou “nome: outro-alias”.'));
      continue;
    }
    if (!/^[A-Za-z_][\w-]*$/.test(node.tag)) {
      issues.push(diagnostic(node.line, node.indent, Math.max(node.indent + 1, node.raw.indexOf(':')),
        'error', 'lml-color-name', `Nome de alias inválido: “${node.tag}”.`));
    }
    if (!node.value) {
      issues.push(diagnostic(node.line, node.raw.indexOf(':') + 1, node.raw.length, 'error',
        'lml-color-value', `O alias “${node.tag}” não possui uma cor.`));
      continue;
    }
    if (node.value.startsWith('#')) {
      if (!inspectColor(node.value, available).valid) {
        issues.push(diagnostic(node.line, node.raw.indexOf(node.value), node.raw.length, 'error',
          'lml-invalid-color', `Cor hexadecimal inválida: “${node.value}”.`));
        continue;
      }
    } else if (node.value === node.tag || (!local.has(node.value) && !available.has(node.value))) {
      issues.push(diagnostic(node.line, node.raw.indexOf(node.value), node.raw.length, 'warning',
        'lml-unknown-color-alias', `Alias de cor referenciado não encontrado: “${node.value}”.`));
      continue;
    }
    local.add(node.tag);
    available.add(node.tag);
  }
  return issues;
}

function typeForProperty(property) {
  if (SIZE_SHORTCUTS.has(property)) return 'size';
  if (POINT_SHORTCUTS.has(property)) return 'point';
  if (RECT_SHORTCUTS.has(property)) return 'rect';
  if (DPUNIT_EDGE_SHORTCUTS.has(property)) return 'dpunit-edge';
  if (property === 'border-color') return 'color-edge';
  if (property === 'spacing') return 'spacing';
  return PROPERTY_TYPES.get(property);
}

function stripQualifier(tag) {
  let current = tag.trim();
  while (current.startsWith('*')) {
    let split = -1;
    if (current.startsWith('*(')) {
      const close = current.indexOf(')');
      if (close < 0) return { tag: current, qualifierError: 'Qualificador agrupado sem “)”.' };
      split = close + 1;
    } else {
      split = current.search(/\s/);
      if (split < 0) return { tag: '', qualifier: current.slice(1) };
    }
    current = current.slice(split).trimStart();
  }
  return { tag: current };
}

function splitNode(trimmed) {
  if (trimmed.startsWith('-')) {
    return { tag: '', value: trimmed.slice(1).trim(), unique: false, listItem: true };
  }
  const colon = trimmed.indexOf(':');
  if (colon >= 0) {
    return {
      tag: trimmed.slice(0, colon).trim(),
      value: trimmed.slice(colon + 1).trim(),
      unique: true,
      listItem: false
    };
  }
  return { tag: trimmed.trim(), value: '', unique: false, listItem: false };
}

/** A tolerant, editor-friendly implementation of the supplied OTML parser. */
function parseDocument(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const root = { tag: '', depth: -1, line: -1, children: [], document: true };
  const nodes = [];
  const diagnostics = [];
  const lastAtDepth = [];
  let previousDepth = 0;
  let previousNode = null;

  for (let line = 0; line < lines.length; line += 1) {
    const raw = lines[line];
    const spaces = countIndent(raw);
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    if (raw[spaces] === '\t') {
      diagnostics.push(diagnostic(line, spaces, spaces + 1, 'error', 'otml-tabs',
        'OTML não permite tabulação na indentação; use 2 espaços.'));
    }
    if (spaces % 2 !== 0) {
      diagnostics.push(diagnostic(line, 0, Math.max(1, spaces), 'error', 'otml-indent-width',
        'A indentação OTML deve usar exatamente múltiplos de 2 espaços.'));
    }

    const depth = Math.floor(spaces / 2);
    if (previousNode && previousNode.multiline && depth > previousNode.depth) {
      previousNode.multilineLines.push({ line, text: raw.slice((previousNode.depth + 1) * 2) });
      continue;
    }

    if (previousNode && depth > previousDepth + 1) {
      diagnostics.push(diagnostic(line, 0, Math.max(1, spaces), 'error', 'otml-depth-jump',
        'Profundidade inválida: um nó só pode aumentar um nível por vez.'));
    }

    let parent = root;
    if (depth > 0) {
      parent = lastAtDepth[depth - 1];
      if (!parent) {
        diagnostics.push(diagnostic(line, 0, Math.max(1, spaces), 'error', 'otml-no-parent',
          'Nó indentado sem um nó pai válido.'));
        parent = root;
      }
    }

    const data = splitNode(trimmed);
    const node = {
      ...data,
      raw,
      line,
      depth,
      indent: spaces,
      parent,
      children: [],
      multiline: data.value === '|' || data.value === '|-' || data.value === '|+',
      multilineLines: []
    };
    parent.children.push(node);
    nodes.push(node);
    lastAtDepth[depth] = node;
    lastAtDepth.length = depth + 1;
    previousNode = node;
    previousDepth = depth;
  }

  return { root, nodes, diagnostics, lines };
}

function parseDeclaration(tag) {
  const clean = stripQualifier(tag);
  if (clean.qualifierError) return { kind: 'invalid', error: clean.qualifierError };
  const value = clean.tag;
  if (!value) return { kind: 'qualifier-only' };
  if (value.startsWith('.')) return { kind: 'class', name: value.slice(1).trim() };
  if (value.startsWith('@undef ')) return { kind: 'undef', name: value.slice(7).trim() };
  const lt = value.indexOf('<');
  if (lt >= 0) {
    const name = value.slice(0, lt).trim();
    const inherited = value.slice(lt + 1).trim();
    const parts = inherited.split('.').filter(Boolean);
    return { kind: 'element', name, inherited, base: parts[0] || '', classes: parts.slice(1) };
  }
  return { kind: 'invalid', name: value, error: 'Sintaxe de estilo desconhecida no nível raiz.' };
}

function commandName(tag) {
  return tag.trim().split(/\s+/, 1)[0];
}

function validateState(node, knownStates) {
  const issues = [];
  const tokens = node.tag.slice(1).trim().split(/\s+/).filter(Boolean);
  for (const original of tokens) {
    let state = original.startsWith('!') ? original.slice(1) : original;
    const transition = state.match(/^(.*)-(in|out)$/);
    if (transition) state = transition[1];
    if (!state) {
      issues.push(diagnostic(node.line, node.indent, node.raw.length, 'error', 'lui-empty-state',
        'Estado vazio.'));
    } else if (!knownStates.has(state)) {
      issues.push(diagnostic(node.line, node.indent, node.raw.length, 'warning', 'lui-unknown-state',
        `Estado “${state}” não foi registrado neste arquivo/workspace.`));
    }
  }
  return issues;
}

function validateTransition(node) {
  const issues = [];
  const args = node.value.trim().split(/\s+/).filter(Boolean);
  if (!args.length) return issues; // Runtime uses its configured default.
  const times = args[0].split(',');
  if (![1, 2].includes(times.length) || times.some(time => parseSeconds(time) === undefined)) {
    issues.push(diagnostic(node.line, node.raw.indexOf(':') + 1, node.raw.length, 'error',
      'lui-transition-time', 'Tempo inválido. Use duração com “s/ms” ou “atraso,duração”.'));
  } else if (parseSeconds(times.at(-1)) <= 0) {
    issues.push(diagnostic(node.line, node.raw.indexOf(':') + 1, node.raw.length, 'error',
      'lui-transition-duration', 'A duração da transição precisa ser maior que zero.'));
  }
  if (args[1] && !EASING_EQUATIONS.includes(args[1])) {
    issues.push(diagnostic(node.line, 0, node.raw.length, 'error', 'lui-transition-equation',
      `Equação de easing inválida: “${args[1]}”.`));
  }
  if (args[2] && !EASING_FUNCTIONS.includes(args[2])) {
    issues.push(diagnostic(node.line, 0, node.raw.length, 'error', 'lui-transition-function',
      `Função de easing inválida: “${args[2]}”.`));
  }
  if (args.length > 4) {
    issues.push(diagnostic(node.line, 0, node.raw.length, 'error', 'lui-transition-arity',
      'Transição aceita no máximo: tempo, equação, função e modificadores.'));
  }
  if (args[3] && !/^\d+$/.test(args[3])) {
    issues.push(diagnostic(node.line, 0, node.raw.length, 'error', 'lui-transition-modifiers',
      'Os modificadores da transição precisam ser um inteiro sem sinal.'));
  }
  return issues;
}

function validateAnimation(node) {
  const issues = [];
  const args = node.value.trim().split(/\s+/).filter(Boolean);
  if (args.length) {
    const times = args[0].split(',');
    if (![1, 2].includes(times.length) || times.some(time => parseSeconds(time) === undefined)) {
      issues.push(diagnostic(node.line, 0, node.raw.length, 'error', 'lui-animation-time',
        'Tempo inválido. Use duração com “s/ms” ou “atraso,duração”.'));
    } else if (parseSeconds(times.at(-1)) <= 0) {
      issues.push(diagnostic(node.line, 0, node.raw.length, 'error', 'lui-animation-duration',
        'A duração da animação precisa ser maior que zero.'));
    }
  }
  if (args[1] && !/^-?\d+$/.test(args[1])) {
    issues.push(diagnostic(node.line, 0, node.raw.length, 'error', 'lui-animation-loop-count',
      'A quantidade de loops precisa ser um inteiro.'));
  }
  if (args[2] && !LOOP_DIRECTIONS.includes(args[2])) {
    issues.push(diagnostic(node.line, 0, node.raw.length, 'error', 'lui-animation-direction',
      `Direção de loop inválida: “${args[2]}”.`));
  }
  if (args[3] && parseSeconds(args[3]) === undefined) {
    issues.push(diagnostic(node.line, 0, node.raw.length, 'error', 'lui-animation-loop-interval',
      'O intervalo do loop precisa usar “s” ou “ms”.'));
  }
  if (args[4] && !/^-?\d+$/.test(args[4])) {
    issues.push(diagnostic(node.line, 0, node.raw.length, 'error', 'lui-animation-loop-factor',
      'O fator de intervalo precisa ser um inteiro.'));
  }
  if (args[5] && !EASING_EQUATIONS.includes(args[5])) {
    issues.push(diagnostic(node.line, 0, node.raw.length, 'error', 'lui-animation-equation',
      `Equação de easing inválida: “${args[5]}”.`));
  }
  if (args[6] && !EASING_FUNCTIONS.includes(args[6])) {
    issues.push(diagnostic(node.line, 0, node.raw.length, 'error', 'lui-animation-function',
      `Função de easing inválida: “${args[6]}”.`));
  }
  if (args.length > 8) {
    issues.push(diagnostic(node.line, 0, node.raw.length, 'error', 'lui-animation-arity',
      'Animação aceita no máximo 8 parâmetros.'));
  }
  if (args[7] && !/^\d+$/.test(args[7])) {
    issues.push(diagnostic(node.line, 0, node.raw.length, 'error', 'lui-animation-modifiers',
      'Os modificadores da animação precisam ser um inteiro sem sinal.'));
  }
  if (node.children.length < 2 || node.children.some(child => !child.listItem)) {
    issues.push(diagnostic(node.line, node.indent, node.raw.length, 'warning', 'lui-animation-frames',
      'Uma animação precisa de pelo menos dois valores filhos no formato “- valor”.'));
  }
  return issues;
}

function validateTypedValue(node, property, colorAliases, unknownColorAliases) {
  const issues = [];
  const type = typeForProperty(property);
  if (!type || !node.value || node.multiline) return issues;
  const valueStart = Math.max(0, node.raw.indexOf(':') + 1);
  const invalid = message => diagnostic(node.line, valueStart, node.raw.length, 'error',
    `lui-invalid-${type}`, message);

  if (type === 'dpunit' && !isDPUnitVector(node.value, [1])) {
    issues.push(invalid(`“${property}” espera um valor DPUnit.`));
  } else if (type === 'point' && !isDPUnitVector(node.value, [2])) {
    issues.push(invalid(`“${property}” espera dois valores DPUnit: x y.`));
  } else if (type === 'size' && !isDPUnitVector(node.value, [2])) {
    issues.push(invalid(`“${property}” espera dois valores DPUnit: largura altura.`));
  } else if (type === 'rect' && !isDPUnitVector(node.value, [4])) {
    issues.push(invalid(`“${property}” espera quatro valores DPUnit: x y largura altura.`));
  } else if (type === 'spacing' && !isDPUnitVector(node.value, [1, 2])) {
    issues.push(invalid('“spacing” espera um valor ou um par de valores DPUnit, conforme o layout.'));
  } else if (type === 'dpunit-edge' && !isDPUnitVector(node.value, [1, 2, 4])) {
    issues.push(invalid(`“${property}” espera 1, 2 ou 4 valores DPUnit.`));
  } else if (type === 'color' || type === 'color-edge') {
    const colors = splitStaticValue(node.value);
    const validCount = type === 'color' ? colors.length === 1 : [1, 2, 4].includes(colors.length);
    if (!validCount) {
      issues.push(invalid(type === 'color'
        ? `“${property}” espera exatamente uma cor.`
        : '“border-color” espera 1, 2 ou 4 cores.'));
    } else {
      for (const color of colors) {
        const result = inspectColor(color, colorAliases);
        if (!result.valid && color.startsWith('#')) {
          issues.push(invalid(`Cor hexadecimal inválida: “${color}”. Use 3, 4, 6 ou 8 dígitos.`));
        } else if (result.unknownAlias && unknownColorAliases !== 'off') {
          issues.push(diagnostic(node.line, valueStart, node.raw.length, unknownColorAliases,
            'lui-unknown-color-alias', `Alias de cor “${color}” não foi encontrado no índice.`));
        }
      }
    }
  }
  return issues;
}

function validateSemantics(parsed, context = {}) {
  const issues = [];
  const elements = context.elements || new Set();
  const classes = context.classes || new Set();
  const properties = new Set([...CORE_PROPERTIES, ...(context.properties || [])]);
  const knownStates = new Set([...STATES, ...(context.states || [])]);
  const colorAliases = new Set([...BUILTIN_COLOR_ALIASES, ...(context.colorAliases || [])]);
  const unknownElements = context.unknownElements || 'warning';
  const unknownProperties = context.unknownProperties || 'off';
  const unknownColorAliases = context.unknownColorAliases || 'off';
  const validateRootReferences = context.validateRootReferences !== false;

  for (const node of parsed.root.children) {
    const decl = parseDeclaration(node.tag);
    node.declaration = decl;
    if (decl.kind === 'invalid') {
      issues.push(diagnostic(node.line, node.indent, node.raw.length, 'error', 'lui-root-syntax', decl.error));
    } else if (decl.kind === 'element') {
      if (!decl.name || !decl.base) {
        issues.push(diagnostic(node.line, node.indent, node.raw.length, 'error', 'lui-declaration',
          'Declaração inválida; use “Elemento < Base.classe”.'));
      }
      if (validateRootReferences && decl.base && !decl.base.startsWith('UI') && !elements.has(decl.base) && unknownElements !== 'off') {
        issues.push(diagnostic(node.line, node.raw.indexOf('<') + 1, node.raw.length,
          unknownElements, 'lui-unknown-base', `Elemento herdado “${decl.base}” não foi encontrado.`));
      }
      for (const styleClass of validateRootReferences ? decl.classes : []) {
        if (!classes.has(styleClass)) {
          issues.push(diagnostic(node.line, 0, node.raw.length, 'warning', 'lui-unknown-class',
            `Classe de estilo “.${styleClass}” não foi encontrada.`));
        }
      }
    } else if (validateRootReferences && decl.kind === 'undef' && !elements.has(decl.name)) {
      issues.push(diagnostic(node.line, node.indent, node.raw.length, 'warning', 'lui-undef-missing',
        `@undef referencia “${decl.name}”, que ainda não aparece no índice.`));
    }
  }

  for (const node of parsed.nodes) {
    if (node.depth === 0 || node.listItem) continue;
    const stripped = stripQualifier(node.tag).tag;
    if (!stripped) continue;

    const expressionTag = stripped.startsWith('!');
    const effective = expressionTag ? stripped.slice(1) : stripped;
    if (effective.startsWith('@')) {
      const command = commandName(effective);
      if (!COMMANDS.includes(command)) {
        issues.push(diagnostic(node.line, node.indent, node.raw.length, 'warning', 'lui-unknown-command',
          `Comando Luna UI desconhecido: “${command}”.`));
      } else if (command === '@transition' && !expressionTag) {
        issues.push(...validateTransition(node));
      } else if (command === '@animation' && !expressionTag) {
        issues.push(...validateAnimation(node));
      } else if (command === '@repeat') {
        const args = effective.split(/\s+/);
        if (args.length !== 3 || !/^\d+$/.test(args[1])) {
          issues.push(diagnostic(node.line, node.indent, node.raw.length, 'error', 'lui-repeat',
            'Use “@repeat quantidade Elemento”.'));
        }
      }
      continue;
    }

    if (node.unique && stripped.startsWith('$')) {
      issues.push(...validateState({ ...node, tag: stripped }, knownStates));
      continue;
    }
    if (!node.unique && stripped.startsWith('.')) {
      const className = stripped.slice(1);
      if (!classes.has(className)) {
        issues.push(diagnostic(node.line, node.indent, node.raw.length, 'warning', 'lui-unknown-class',
          `Classe de estilo “.${className}” não foi encontrada.`));
      }
      continue;
    }
    if (!node.unique) {
      const elementName = stripped.split('.')[0];
      if (!elementName.startsWith('UI') && !elements.has(elementName) && unknownElements !== 'off') {
        issues.push(diagnostic(node.line, node.indent, node.raw.length, unknownElements,
          'lui-unknown-element', `Widget “${elementName}” não foi encontrado.`));
      }
      continue;
    }

    const expressionProperty = stripped.startsWith('!');
    const property = expressionProperty ? stripped.slice(1) : stripped;
    if (!property.startsWith('__') && !properties.has(property) && unknownProperties !== 'off') {
      issues.push(diagnostic(node.line, node.indent, node.raw.indexOf(':') >= 0 ? node.raw.indexOf(':') : node.raw.length,
        unknownProperties, 'lui-unknown-property', `Propriedade “${property}” não foi encontrada no índice.`));
    }
    if (property === 'layout' && node.value && !LAYOUTS.includes(node.value)) {
      issues.push(diagnostic(node.line, node.raw.indexOf(':') + 1, node.raw.length, 'error',
        'lui-layout', `Layout inválido: “${node.value}”.`));
    }
    if ((property === 'align' || property.endsWith('-align')) && node.value && !ALIGNMENTS.includes(node.value)) {
      issues.push(diagnostic(node.line, node.raw.indexOf(':') + 1, node.raw.length, 'warning',
        'lui-alignment', `Alinhamento possivelmente inválido: “${node.value}”.`));
    }
    if (!expressionProperty) {
      issues.push(...validateTypedValue(node, property, colorAliases, unknownColorAliases));
    }
  }
  return issues;
}

function collectLocalSymbols(parsed) {
  const elements = [];
  const classes = [];
  const states = [];
  for (const node of parsed.root.children) {
    const decl = parseDeclaration(node.tag);
    if (decl.kind === 'element' && decl.name) elements.push({ name: decl.name, line: node.line, node, decl });
    if (decl.kind === 'class' && decl.name) classes.push({ name: decl.name, line: node.line, node, decl });
  }
  for (const node of parsed.nodes) {
    const tag = stripQualifier(node.tag).tag;
    if (tag.startsWith('@custom-state ')) {
      const name = tag.slice('@custom-state '.length).trim().split(/\s+/)[0];
      if (name) states.push({ name, line: node.line, node });
    }
  }
  return { elements, classes, states };
}

function findLocalDefinitions(parsed, name, kind) {
  const symbols = collectLocalSymbols(parsed);
  const entries = kind === 'class' ? symbols.classes : symbols.elements;
  return entries.filter(entry => entry.name === name);
}

function expressionValue(node) {
  if (!node.multiline) return node.value || '';
  return (node.multilineLines || []).map(item => item.text).join('\n');
}

function luaSegments(node, code = expressionValue(node)) {
  const colon = node.raw.indexOf(':');
  if (node.multiline) {
    return (node.multilineLines || []).map(item => ({
      line: item.line,
      start: (node.depth + 1) * 2,
      end: (node.depth + 1) * 2 + item.text.length,
      code: item.text
    }));
  }
  const start = Math.max(colon + 1,
    code ? node.raw.indexOf(code, colon + 1) : node.raw.length);
  return [{ line: node.line, start, end: start + code.length, code }];
}

function bindDeclaration(node, effectiveTag) {
  if (!effectiveTag.startsWith('@bind ')) return undefined;
  const bindKind = effectiveTag.slice('@bind '.length).trim().split(/\s+/)[0];
  const parts = node.value.trim().split(/\s+/).filter(Boolean);
  const name = bindKind === 'self' ? parts[0]
    : bindKind === 'child' ? parts[1]
      : undefined;
  if (!name || !/^[A-Za-z_]\w*$/.test(name)) return undefined;
  const colon = node.raw.indexOf(':');
  const start = node.raw.indexOf(name, colon + 1);
  return { name, bindKind, line: node.line, start, end: start + name.length, node };
}

/** Extracts the Lua-bearing portions of Luna UI commands and dynamic tags. */
function collectLuaExpressions(parsed) {
  const expressions = [];
  for (const node of parsed.nodes) {
    if (!node.unique) continue;
    const tag = stripQualifier(node.tag).tag;
    const dynamic = tag.startsWith('!') && !tag.startsWith('!$');
    const effectiveTag = dynamic ? tag.slice(1) : tag;
    const command = commandName(effectiveTag);
    const binding = bindDeclaration(node, effectiveTag);

    if (binding) {
      expressions.push({
        code: binding.name,
        line: binding.line,
        start: binding.start,
        end: binding.end,
        segments: [{ line: binding.line, start: binding.start, end: binding.end, code: binding.name }],
        tag: effectiveTag,
        mode: 'global',
        binding,
        node
      });
      continue;
    }

    const isField = command === '@field';
    const isSlot = command === '@slot' || command === '@slotRet';
    const isBindReference = command === '@bind';
    if (!dynamic && !isField && !isSlot && !isBindReference) continue;
    const code = expressionValue(node);
    const segments = luaSegments(node, code);
    expressions.push({
      code,
      line: segments[0]?.line ?? node.line,
      start: segments[0]?.start ?? Math.max(0, node.raw.indexOf(':') + 1),
      end: segments.at(-1)?.end ?? node.raw.length,
      segments,
      tag: dynamic ? effectiveTag : tag,
      mode: isSlot && !code.trimStart().startsWith('function') ? 'chunk' : 'expression',
      node
    });
  }
  return expressions;
}

function collectLuaBindings(parsed) {
  const bindings = [];
  for (const node of parsed.nodes) {
    if (!node.unique) continue;
    const tag = stripQualifier(node.tag).tag.replace(/^!/, '');
    const binding = bindDeclaration(node, tag);
    if (binding) bindings.push(binding);
  }
  return bindings;
}

/**
 * Replays UIStyler imports in runtime order. File identifiers are intentionally
 * opaque so this pure module can be used by both VS Code and unit tests.
 */
function buildStyleModel(files) {
  const elements = new Map();
  const classes = new Map();
  const states = new Map();
  const properties = new Set();
  const diagnostics = [];
  const events = [];

  function entry(file, node, decl, detail) {
    return { uri: file.uri, label: file.label || String(file.uri || ''), line: node.line, node, decl, detail };
  }
  function issue(file, node, severity, code, message) {
    diagnostics.push({
      uri: file.uri,
      label: file.label || String(file.uri || ''),
      ...diagnostic(node.line, node.indent, node.raw.length, severity, code, message)
    });
  }
  function event(kind, name, current, previous) {
    events.push({ kind, name, current, previous });
  }

  for (const file of files) {
    const parsed = file.parsed || parseDocument(file.text || '');
    for (const node of parsed.root.children) {
      const decl = parseDeclaration(node.tag);
      if (decl.kind === 'class' && decl.name) {
        const current = entry(file, node, decl, `.${decl.name}`);
        const previous = classes.get(decl.name);
        classes.set(decl.name, current);
        event(previous ? 'override-class' : 'define-class', decl.name, current, previous);
      } else if (decl.kind === 'undef' && decl.name) {
        const previous = elements.get(decl.name);
        const current = entry(file, node, decl, `@undef ${decl.name}`);
        if (previous) {
          elements.delete(decl.name);
          event('undef-element', decl.name, current, previous);
        } else {
          event('missing-undef', decl.name, current);
          issue(file, node, 'warning', 'lui-undef-missing',
            `@undef referencia “${decl.name}”, que ainda não foi carregado.`);
        }
      } else if (decl.kind === 'element') {
        if (!decl.name || !decl.base) continue;
        const current = entry(file, node, decl,
          decl.inherited ? `${decl.name} < ${decl.inherited}` : decl.name);
        if (decl.base && !decl.base.startsWith('UI') && !elements.has(decl.base)) {
          event('missing-base', decl.base, current);
          issue(file, node, 'warning', 'lui-unknown-base-at-import',
            `Elemento herdado “${decl.base}” ainda não havia sido carregado neste ponto.`);
        }
        for (const styleClass of decl.classes) {
          if (!classes.has(styleClass)) {
            event('missing-class', styleClass, current);
            issue(file, node, 'warning', 'lui-unknown-class-at-import',
              `Classe de estilo “.${styleClass}” ainda não havia sido carregada neste ponto.`);
          }
        }
        const previous = elements.get(decl.name);
        elements.set(decl.name, current);
        event(previous ? 'override-element' : 'define-element', decl.name, current, previous);
        if (previous) {
          issue(file, node, 'warning', 'lui-override-without-undef',
            `“${decl.name}” substitui uma definição anterior sem “@undef ${decl.name}”.`);
        }
      }
    }

    const symbols = collectLocalSymbols(parsed);
    for (const item of symbols.states) {
      states.set(item.name, entry(file, item.node, undefined, `Estado customizado ${item.name}`));
    }
    for (const node of parsed.nodes) {
      if (!node.unique || !node.tag || /^[!]?[$@]/.test(stripQualifier(node.tag).tag)) continue;
      const name = stripQualifier(node.tag).tag.replace(/^!/, '');
      if (/^[A-Za-z_][\w.-]*$/.test(name)) properties.add(name);
    }
  }
  return { elements, classes, states, properties, diagnostics, events };
}

module.exports = {
  ALIGNMENTS,
  BUILTIN_COLOR_ALIASES,
  BUILTIN_COLOR_VALUES,
  COMMANDS,
  CORE_PROPERTIES,
  EASING_EQUATIONS,
  EASING_FUNCTIONS,
  LAYOUTS,
  LOOP_DIRECTIONS,
  PROPERTY_TYPES,
  STATES,
  UNITS,
  buildStyleModel,
  collectLuaBindings,
  collectLuaExpressions,
  collectLocalSymbols,
  collectColorAliases,
  inspectColor,
  formatHexColor,
  findLocalDefinitions,
  isDPUnit,
  parseDeclaration,
  parseDocument,
  parseHexColor,
  parseSeconds,
  stripQualifier,
  typeForProperty,
  validateColorScheme,
  validateSemantics
};
