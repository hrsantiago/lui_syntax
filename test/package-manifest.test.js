'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const pkg = require('../package.json');

test('preserves the published Marketplace identity', () => {
  assert.equal(pkg.publisher, 'Pedrilsk');
  assert.equal(pkg.name, 'lui-language');
  assert.equal(pkg.version, '0.1.7');
});

test('preserves the 0.1.x LUI language contract', () => {
  const language = pkg.contributes.languages.find(item => item.id === 'lui');
  assert.ok(language);
  assert.deepEqual(language.extensions, ['.lui', '.lmod', '.lpe']);
  assert.ok(pkg.activationEvents.includes('onLanguage:lui'));
  assert.ok(pkg.contributes.configuration.properties['lui.fileExtensions']);
  assert.ok(pkg.contributes.configuration.properties['lunaUI.assets.referenceHighlight.enabled']);
  assert.equal(
    pkg.contributes.configuration.properties['lunaUI.navigation.referenceHighlight.enabled'].default,
    true
  );
  const styleSource = pkg.contributes.configuration.properties['lunaUI.styleSources'];
  const objectSource = styleSource.items.anyOf.find(item => item.type === 'object');
  assert.equal(objectSource.properties.scanCode.default, true);
  assert.equal(
    pkg.contributes.configuration.properties['lunaUI.luaIntegration.enabled'].default,
    true
  );
  assert.equal(
    pkg.contributes.configuration.properties['lunaUI.luaIntegration.bindGlobalType'].default,
    'any'
  );
  assert.equal(pkg.contributes.configurationDefaults['files.exclude']['**/.luna-ui-cache'], true);
  assert.equal(pkg.contributes.configurationDefaults['search.exclude']['**/.luna-ui-cache'], true);
});
