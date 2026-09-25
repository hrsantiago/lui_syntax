'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const IMAGE_MIME_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.bmp', 'image/bmp'],
  ['.ico', 'image/x-icon'],
  ['.svg', 'image/svg+xml']
]);

function imageMimeType(filePath) {
  return IMAGE_MIME_TYPES.get(path.extname(String(filePath || '')).toLowerCase());
}

function executeFile(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, error => error ? reject(error) : resolve());
  });
}

function pipeFile(command, args, filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${command} terminou com o código ${code}.`));
    });
    fs.readFile(filePath).then(bytes => child.stdin.end(bytes), reject);
  });
}

async function copyOnWindows(filePath) {
  const supported = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico']);
  const extension = path.extname(filePath).toLowerCase();
  if (!supported.has(extension)) {
    throw new Error('No Windows, a cópia suporta PNG, JPG, JPEG, GIF, BMP e ICO.');
  }
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    "$imagePath = [Environment]::GetEnvironmentVariable('LUNA_UI_IMAGE_PATH')",
    "$extension = [IO.Path]::GetExtension($imagePath).ToLowerInvariant()",
    "if ($extension -eq '.ico') {",
    '  $icon = New-Object System.Drawing.Icon -ArgumentList $imagePath',
    '  try {',
    '    $bitmap = $icon.ToBitmap()',
    '    try { [System.Windows.Forms.Clipboard]::SetImage($bitmap) } finally { $bitmap.Dispose() }',
    '  } finally { $icon.Dispose() }',
    '} else {',
    '  $image = [System.Drawing.Image]::FromFile($imagePath)',
    '  try { [System.Windows.Forms.Clipboard]::SetImage($image) } finally { $image.Dispose() }',
    '}'
  ].join('\n');
  const env = { ...process.env, LUNA_UI_IMAGE_PATH: filePath };
  await executeFile('powershell.exe', ['-NoProfile', '-STA', '-NonInteractive', '-Command', script], { env });
}

async function copyOnMacOS(filePath) {
  const script = [
    'on run argv',
    '  set imageFile to POSIX file (item 1 of argv)',
    '  set the clipboard to (read imageFile as picture)',
    'end run'
  ].join('\n');
  await executeFile('osascript', ['-e', script, filePath]);
}

async function copyOnLinux(filePath) {
  const mimeType = imageMimeType(filePath);
  if (!mimeType) throw new Error('Formato de imagem não reconhecido para cópia.');
  try {
    await pipeFile('wl-copy', ['--type', mimeType], filePath);
    return;
  } catch (_) {
    try {
      await pipeFile('xclip', ['-selection', 'clipboard', '-t', mimeType, '-i'], filePath);
      return;
    } catch (_) {
      throw new Error('Instale wl-clipboard ou xclip para copiar imagens no Linux.');
    }
  }
}

async function copyImageToClipboard(filePath, platform = process.platform) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error('O asset resolvido não é um arquivo.');
  if (platform === 'win32') return copyOnWindows(filePath);
  if (platform === 'darwin') return copyOnMacOS(filePath);
  if (platform === 'linux') return copyOnLinux(filePath);
  throw new Error(`Cópia de imagem não suportada em ${platform}.`);
}

function fontAwesomeSearchUrl(reference) {
  const glyphName = String(reference?.glyphName || '').trim();
  const syntheticName = /^(?:uni|u)[0-9a-f]+$/i.test(glyphName);
  const query = glyphName && !syntheticName
    ? glyphName.replace(/^fa[-_]?/i, '')
    : String(reference?.hexadecimal || '').replace(/^0x/i, '');
  const url = new URL('https://fontawesome.com/search');
  if (query) url.searchParams.set('q', query);
  return url.toString();
}

module.exports = {
  copyImageToClipboard,
  fontAwesomeSearchUrl,
  imageMimeType
};
