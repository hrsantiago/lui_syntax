'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'luna-ui-vsix-'));
const extensionDir = path.join(stage, 'extension');
fs.mkdirSync(extensionDir, { recursive: true });

const ignore = new Set(['.vscode', 'test', 'scripts', '.vscodeignore']);
const runtimeDependencyFiles = new Set([
  'node_modules/opentype.js/package.json',
  'node_modules/opentype.js/dist/opentype.js'
]);
function shouldCopy(source, entry) {
  const relative = path.relative(root, path.join(source, entry.name)).replaceAll(path.sep, '/');
  if (!relative.startsWith('node_modules/')) return true;
  if (runtimeDependencyFiles.has(relative)) return true;
  return entry.isDirectory() && [...runtimeDependencyFiles].some(file => file.startsWith(`${relative}/`));
}
function copyTree(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (ignore.has(entry.name) || entry.name.endsWith('.vsix') || entry.name.endsWith('.zip')) continue;
    if (!shouldCopy(source, entry)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else fs.copyFileSync(from, to);
  }
}
copyTree(root, extensionDir);

const contentTypes = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="md" ContentType="text/markdown" />
  <Default Extension="vsixmanifest" ContentType="text/xml" />
</Types>\n`;
fs.writeFileSync(path.join(stage, '[Content_Types].xml'), contentTypes);

const escapeXml = value => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const manifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="${escapeXml(pkg.name)}" Version="${escapeXml(pkg.version)}" Publisher="${escapeXml(pkg.publisher)}" />
    <DisplayName>${escapeXml(pkg.displayName)}</DisplayName>
    <Description xml:space="preserve">${escapeXml(pkg.description)}</Description>
    <Tags>${escapeXml(pkg.keywords.join(','))}</Tags>
    <Categories>${escapeXml(pkg.categories.join(','))}</Categories>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${escapeXml(pkg.engines.vscode)}" />
      <Property Id="Microsoft.VisualStudio.Services.GitHubFlavoredMarkdown" Value="true" />
    </Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" /></Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Changelog" Path="extension/CHANGELOG.md" Addressable="true" />
  </Assets>
</PackageManifest>\n`;
fs.writeFileSync(path.join(stage, 'extension.vsixmanifest'), manifest);

const output = path.join(root, `${pkg.name}-${pkg.version}.vsix`);
if (fs.existsSync(output)) fs.unlinkSync(output);
const zipped = spawnSync('zip', ['-q', '-r', output, '[Content_Types].xml', 'extension.vsixmanifest', 'extension'], {
  cwd: stage,
  stdio: 'inherit'
});
if (zipped.status !== 0) process.exit(zipped.status || 1);
console.log(output);
