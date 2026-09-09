'use strict';

const path = require('node:path');

function isAssetSourceProperty(property) {
  return property === 'icon-source' || property === 'image-source'
    || property.endsWith('-image-source');
}

function cleanAssetValue(value) {
  let current = String(value || '').trim();
  if (current.length >= 2 && ((current.startsWith('"') && current.endsWith('"'))
    || (current.startsWith("'") && current.endsWith("'")))) {
    current = current.slice(1, -1).trim();
  }
  return current;
}

function isFontAwesomeSource(value) {
  return /^@fontawesome(?:-|$)/i.test(cleanAssetValue(value));
}

function automaticAssetMounts(sourceDirectory, workspaceDirectories) {
  const mounts = [];
  const seen = new Set();
  const add = (directory, prefix) => {
    const normalized = path.normalize(directory);
    const key = `${prefix}\0${normalized}`;
    if (seen.has(key)) return;
    seen.add(key);
    mounts.push({ path: normalized, prefix, automatic: true });
  };

  const starts = [sourceDirectory, ...workspaceDirectories].filter(Boolean);
  for (const start of starts) {
    let current = path.resolve(start);
    while (true) {
      // When the opened folder is `assets` itself, /assets/foo maps to
      // <workspace>/foo rather than <workspace>/assets/foo.
      if (path.basename(current).toLowerCase() === 'assets') add(current, '/assets');
      // Handles a workspace containing assets and an assets folder beside a
      // nested workspace as the loop climbs through its parents.
      add(current, '/');
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return mounts;
}

function candidateAssetPaths(value, mounts, sourceDirectory, extensions) {
  const source = cleanAssetValue(value);
  if (!source || isFontAwesomeSource(source) || source.includes('\0')) return [];
  const candidates = [];
  const seen = new Set();
  const add = base => {
    const normalized = path.normalize(base);
    const variants = path.extname(normalized)
      ? [normalized]
      : [normalized, ...extensions.map(extension => `${normalized}.${String(extension).replace(/^\./, '')}`)];
    for (const candidate of variants) {
      if (!seen.has(candidate)) {
        seen.add(candidate);
        candidates.push(candidate);
      }
    }
  };

  const virtualPath = source.replaceAll('\\', '/');
  if (!virtualPath.startsWith('/') && sourceDirectory) add(path.resolve(sourceDirectory, source));
  for (const mount of mounts) {
    const prefix = (`/${String(mount.prefix || '/').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')}`)
      .replace(/^\/$/, '/');
    const normalizedSource = `/${virtualPath.replace(/^\/+/, '')}`;
    if (prefix !== '/' && normalizedSource !== prefix && !normalizedSource.startsWith(`${prefix}/`)) continue;
    const relative = prefix === '/' ? normalizedSource.slice(1) : normalizedSource.slice(prefix.length).replace(/^\//, '');
    add(path.resolve(mount.path, relative));
  }
  return candidates;
}

module.exports = {
  automaticAssetMounts,
  candidateAssetPaths,
  cleanAssetValue,
  isAssetSourceProperty,
  isFontAwesomeSource
};
