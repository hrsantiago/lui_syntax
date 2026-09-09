'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const configuration = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../language-configuration.json'), 'utf8'));
const words = new RegExp(configuration.wordPattern, 'g');

test('word pattern keeps hyphenated Luna UI symbols intact', () => {
  assert.deepEqual('UIButton.hover-hand'.match(words), ['UIButton', '.hover-hand']);
  assert.deepEqual('color: pallet-idle'.match(words), ['color', 'pallet-idle']);
  assert.deepEqual('$changed !focus'.match(words), ['$changed', '!focus']);
  assert.deepEqual('@bind self: e_panel'.match(words), ['@bind', 'self', 'e_panel']);
  assert.deepEqual('!@transition rotation'.match(words), ['!@transition', 'rotation']);
});

test('indentation advances only for actual Luna UI block openers', () => {
  const increase = new RegExp(configuration.indentationRules.increaseIndentPattern);
  const decrease = new RegExp(configuration.indentationRules.decreaseIndentPattern);

  for (const line of [
    'Panel < UIWidget.hover-hand',
    '  UIWidget',
    '.hover-hand',
    '  $hover !checked:',
    '  layout: verticalBox',
    '  @repeat 3 UIWidget',
    '  @animation opacity: 0.5s -1 alternate',
    '  @slot onSetup: |',
    '  !text: |-'
  ]) assert.equal(increase.test(line), true, line);

  for (const line of [
    '',
    '  height: 20sp',
    '  color: pallet-idle',
    '  @bind self: e_panel',
    '  @slot onClick: togglePanel(self)',
    '  @transition opacity: 200ms',
    '  // comment'
  ]) assert.equal(increase.test(line), false, line);

  assert.equal(decrease.test(''), false);
  assert.equal(decrease.test('  '), false);
});

test('Enter on an indented empty line outdents exactly one level', () => {
  const rule = configuration.onEnterRules.find(item => item.action.indent === 'outdent');
  assert.ok(rule);
  const beforeText = new RegExp(rule.beforeText);
  assert.equal(beforeText.test('    '), true);
  assert.equal(beforeText.test('  '), true);
  assert.equal(beforeText.test(''), false);
  assert.equal(beforeText.test('    height: 20sp'), false);
});
