'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const grammar = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../syntaxes/luna-ui.tmLanguage.json'), 'utf8'));

function firstPattern(section, line) {
  for (const pattern of grammar.repository[section].patterns) {
    const source = pattern.begin || pattern.match;
    const match = new RegExp(source).exec(line);
    if (match?.index === 0) return { pattern, match };
  }
  return undefined;
}

test('command keys start at indentation and outrank generic properties', () => {
  const cases = [
    ['  @slot onClick: callback()', '@slot'],
    ['  @field showDrag: false', '@field'],
    ['    @bind self: e_panel', '@bind'],
    ['  @transition opacity: 0.2s', '@transition'],
    ['  !@animation rotation: params', '@animation']
  ];
  for (const [line, expected] of cases) {
    const command = firstPattern('commands', line);
    const property = firstPattern('properties', line);
    assert.ok(command, line);
    assert.equal(command.match.includes(expected), true, line);
    assert.equal(command.match.index, 0, line);
    assert.equal(property.match.index, 0, line);
    const commandCapture = Object.values(command.pattern.captures)
      .find(capture => capture.name === 'keyword.control.directive.luna-ui');
    assert.ok(commandCapture, line);
  }
});

test('simple, combined, negated and transition states use state scopes', () => {
  for (const line of ['  $hover:', '  $changed !focus:', '    $checked-in:', '  $!hidden on-out:']) {
    const state = firstPattern('states', line);
    assert.ok(state, line);
    assert.equal(state.match.index, 0, line);
    assert.equal(state.pattern.beginCaptures['2'].name, 'keyword.control.conditional.state.luna-ui');
    assert.ok(state.pattern.patterns.some(pattern => pattern.name === 'constant.language.state.luna-ui'));
  }
});

test('multiline Lua commands preserve directive identity', () => {
  for (const line of [
    '  @slot onSetup: |',
    '    @field callback: |-',
    '  !@transition opacity: |'
  ]) {
    const result = firstPattern('multiline', line);
    assert.ok(result, line);
    assert.equal(result.pattern.name, 'meta.directive.lua-block.luna-ui');
    assert.ok(Object.values(result.pattern.beginCaptures)
      .some(capture => capture.name === 'keyword.control.directive.luna-ui'));
  }
  assert.equal(firstPattern('multiline', '  @transition opacity: |'), undefined);
});

test('values after dynamic ! tags are embedded Lua, but negated qualifiers are not', () => {
  for (const line of [
    '  !height: math.max(10, size)',
    "    !@transition rotation: TIME .. 'ms'",
    '  *mobile !text: tr("Open")'
  ]) {
    const result = firstPattern('inline-lua', line);
    assert.ok(result, line);
    assert.equal(result.pattern.contentName, 'meta.embedded.inline.lua');
    assert.ok(result.pattern.patterns.some(pattern => pattern.include === 'source.lua'));
  }
  assert.equal(firstPattern('inline-lua', '  *!mobile size: 16sp 16sp'), undefined);
});

test('ordinary text blocks are not embedded Lua', () => {
  assert.equal(firstPattern('multiline', '  text: |-'), undefined);
  assert.ok(firstPattern('multiline', '  !text: |-'));
  assert.ok(firstPattern('multiline', '  @slot onClick: |-'));
  assert.ok(firstPattern('multiline', '  @field callback: |-'));
  assert.equal(firstPattern('multiline', '  @transition opacity: |-'), undefined);
});

test('@slot, @field and @bind values receive embedded Lua scopes', () => {
  for (const line of [
    '  @slot onClick: togglePanel(self)',
    '  @field callback: function(self) return true end',
    '  @bind self: e_panel',
    '  *mobile @bind self: e_mobilePanel'
  ]) {
    const result = firstPattern('inline-lua', line);
    assert.ok(result, line);
    assert.equal(result.pattern.contentName, 'meta.embedded.inline.lua');
  }
  assert.equal(firstPattern('inline-lua', '  @transition opacity: 200ms'), undefined);
});
