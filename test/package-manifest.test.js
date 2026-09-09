'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const pkg = require('../package.json');

test('preserves the published Marketplace identity', () => {
  assert.equal(pkg.publisher, 'Pedrilsk');
  assert.equal(pkg.name, 'lui-language');
  assert.equal(pkg.version, '0.1.5');
});

test('preserves the 0.1.x LUI language contract', () => {
  const language = pkg.contributes.languages.find(item => item.id === 'lui');
  assert.ok(language);
  assert.deepEqual(language.extensions, ['.lui', '.lmod', '.lpe']);
  assert.ok(pkg.activationEvents.includes('onLanguage:lui'));
  assert.ok(pkg.contributes.configuration.properties['lui.fileExtensions']);
});
