'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const grammar = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../syntaxes/luna-ui-colors.tmLanguage.json'), 'utf8'));

function matchingPattern(line) {
  return grammar.patterns.find(pattern => new RegExp(pattern.match).test(line));
}

test('highlights LML color definitions and alias references', () => {
  const hex = matchingPattern('pallet-a-0: #202531');
  assert.equal(hex.captures['2'].name, 'entity.name.constant.color-alias.luna-ui');
  assert.equal(hex.captures['5'].name, 'constant.other.color.luna-ui');

  const alias = matchingPattern('button-idle: pallet-a-3');
  assert.equal(alias.captures['5'].name, 'variable.other.constant.color-alias-reference.luna-ui');
  assert.match(matchingPattern('// comment').name, /^comment\./);
});
