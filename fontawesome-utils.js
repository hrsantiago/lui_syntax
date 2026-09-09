'use strict';

const path = require('node:path');
const { automaticAssetMounts, cleanAssetValue } = require('./asset-utils');

const FONT_EXTENSIONS = new Set(['.otf', '.ttf', '.woff']);

function parseFontAwesomeSource(value) {
  const source = cleanAssetValue(value);
  const match = source.match(/^@fontawesome-(.+)-x([0-9a-f]+)$/i);
  if (!match) return undefined;
  const descriptor = match[1].match(/^(.+)-([0-9]+(?:\.[0-9]+)?(?:[a-z%]+)?)$/i);
  if (!descriptor) return undefined;
  const codepoint = Number.parseInt(match[2], 16);
  if (!Number.isInteger(codepoint) || codepoint < 0 || codepoint > 0x10ffff) return undefined;
  return {
    source,
    style: descriptor[1],
    size: descriptor[2],
    hexadecimal: match[2].toLowerCase(),
    codepoint
  };
}

function automaticFontDirectories(sourceDirectory, workspaceDirectories) {
  const directories = [];
  const seen = new Set();
  const add = directory => {
    const normalized = path.normalize(directory);
    const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    if (seen.has(key)) return;
    seen.add(key);
    directories.push(normalized);
  };
  for (const mount of automaticAssetMounts(sourceDirectory, workspaceDirectories)) {
    if (mount.prefix === '/assets') add(path.join(mount.path, 'fonts'));
    else add(path.join(mount.path, 'assets', 'fonts'));
  }
  return directories;
}

function isFontFile(filePath) {
  return FONT_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());
}

function fontFileScore(filePath) {
  const name = path.basename(String(filePath || '')).toLowerCase();
  if (!isFontFile(name)) return -Infinity;
  let score = 0;
  if (/font[ _-]?awesome/.test(name)) score += 100;
  if (/^fa[ _-]/.test(name)) score += 80;
  if (/solid|free-solid/.test(name)) score += 30;
  if (/pro/.test(name)) score += 10;
  if (/regular/.test(name)) score -= 5;
  if (/brands?/.test(name)) score -= 20;
  if (path.extname(name) === '.otf') score += 2;
  return score;
}

function glyphSvg(font, codepoint) {
  const character = String.fromCodePoint(codepoint);
  const glyph = font.charToGlyph(character);
  if (!glyph || glyph.index === 0) return undefined;
  const initialSize = 64;
  const initial = glyph.getPath(0, 0, initialSize);
  const initialBox = initial.getBoundingBox();
  const initialWidth = Math.max(1, initialBox.x2 - initialBox.x1);
  const initialHeight = Math.max(1, initialBox.y2 - initialBox.y1);
  const fontSize = initialSize * Math.min(72 / initialWidth, 72 / initialHeight);
  const measured = glyph.getPath(0, 0, fontSize);
  const box = measured.getBoundingBox();
  const width = box.x2 - box.x1;
  const height = box.y2 - box.y1;
  const x = (96 - width) / 2 - box.x1;
  const y = (96 - height) / 2 - box.y1;
  const data = glyph.getPath(x, y, fontSize).toPathData(2);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">',
    '  <rect width="96" height="96" rx="12" fill="#1e1e1e"/>',
    `  <path d="${data}" fill="#f2f2f2"/>`,
    '</svg>',
    ''
  ].join('\n');
}

module.exports = {
  automaticFontDirectories,
  fontFileScore,
  glyphSvg,
  isFontFile,
  parseFontAwesomeSource
};
