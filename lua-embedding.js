'use strict';

const core = require('./lui-core');

function normalizeBindGlobalType(value) {
  return value === 'UIWidget' ? 'UIWidget' : 'any';
}

/** Builds the LuaLS-visible global declarations shared by every LUI shadow. */
function buildLuaBindingsDocument(globals, bindGlobalType = 'any') {
  const luaType = normalizeBindGlobalType(bindGlobalType);
  const declarations = [...globals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([name, definitions]) => {
      const definition = definitions.at(-1);
      const sourceUri = typeof definition.uri === 'string'
        ? definition.uri
        : definition.uri.toString();
      return [
        `---@source ${sourceUri}:${definition.line + 1}`,
        `---@type ${luaType}`,
        `${name} = nil`
      ];
    });
  return [
    '---@diagnostic disable: lowercase-global, duplicate-set-field',
    '-- Generated from Luna UI @bind declarations. Do not edit.',
    ...declarations,
    ''
  ].join('\n');
}

/** Creates a valid Lua shadow document while retaining source line mapping. */
function buildLuaVirtualDocument(text, sourceUri, bindGlobalType = 'any') {
  const luaType = normalizeBindGlobalType(bindGlobalType);
  const parsed = core.parseDocument(text);
  const expressions = core.collectLuaExpressions(parsed);
  const lines = ['---@diagnostic disable: lowercase-global, duplicate-set-field'];
  const mappings = [];

  expressions.forEach((expression, index) => {
    const segments = expression.segments || [];
    if (!segments.length) return;
    lines.push(`-- ${expression.tag} @ LUI:${expression.line + 1}`);

    if (expression.mode === 'global') {
      if (sourceUri) lines.push(`---@source ${sourceUri}:${expression.binding.line + 1}`);
      lines.push(`---@type ${luaType}`);
      const virtualLine = lines.length;
      lines.push(`${expression.code} = nil`);
      mappings.push({
        sourceLine: segments[0].line,
        sourceStart: segments[0].start,
        sourceEnd: segments[0].end,
        virtualLine,
        virtualStart: 0,
        virtualEnd: expression.code.length,
        expression
      });
      lines.push('');
      return;
    }

    if (expression.mode === 'chunk') {
      lines.push(`local function __lui_slot_${index + 1}(self, ...)`);
      segments.forEach(segment => {
        const virtualLine = lines.length;
        lines.push(segment.code);
        mappings.push({
          sourceLine: segment.line,
          sourceStart: segment.start,
          sourceEnd: segment.end,
          virtualLine,
          virtualStart: 0,
          virtualEnd: segment.code.length,
          expression
        });
      });
      lines.push('end', '');
      return;
    }

    const prefix = `local __lui_expression_${index + 1} = `;
    const multiline = segments.length > 1;
    segments.forEach((segment, segmentIndex) => {
      const virtualLine = lines.length;
      const virtualStart = segmentIndex === 0 ? prefix.length + (multiline ? 1 : 0) : 0;
      lines.push(segmentIndex === 0
        ? `${prefix}${multiline ? '(' : ''}${segment.code}`
        : segment.code);
      mappings.push({
        sourceLine: segment.line,
        sourceStart: segment.start,
        sourceEnd: segment.end,
        virtualLine,
        virtualStart,
        virtualEnd: virtualStart + segment.code.length,
        expression
      });
    });
    if (multiline) lines.push(')');
    lines.push('');
  });

  return { content: lines.join('\n'), expressions, mappings };
}

function mappingAtSource(state, line, character) {
  return state.mappings.find(mapping => mapping.sourceLine === line
    && character >= mapping.sourceStart && character <= mapping.sourceEnd);
}

function mappingAtVirtual(state, line, character) {
  return state.mappings.find(mapping => mapping.virtualLine === line
    && character >= mapping.virtualStart && character <= mapping.virtualEnd);
}

function closestMappingAtOrBefore(state, line, character = Number.MAX_SAFE_INTEGER) {
  return state.mappings
    .filter(mapping => mapping.virtualLine < line
      || (mapping.virtualLine === line && mapping.virtualStart <= character))
    .sort((a, b) => b.virtualLine - a.virtualLine || b.virtualStart - a.virtualStart)[0]
    || state.mappings[0];
}

function sourceToVirtual(mapping, line, character) {
  return {
    line: mapping.virtualLine,
    character: mapping.virtualStart + Math.max(0, character - mapping.sourceStart)
  };
}

function virtualToSource(mapping, line, character) {
  return {
    line: mapping.sourceLine,
    character: mapping.sourceStart + Math.max(0,
      Math.min(mapping.virtualEnd, character) - mapping.virtualStart)
  };
}

module.exports = {
  buildLuaBindingsDocument,
  buildLuaVirtualDocument,
  closestMappingAtOrBefore,
  mappingAtSource,
  mappingAtVirtual,
  sourceToVirtual,
  virtualToSource
};
