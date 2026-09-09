'use strict';

const vscode = require('vscode');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const core = require('./lui-core');
const luaEmbedding = require('./lua-embedding');
const assetUtils = require('./asset-utils');
const fontAwesomeUtils = require('./fontawesome-utils');
const opentype = require('opentype.js');

const LANGUAGE = 'lui';
const COLOR_LANGUAGE = 'luna-ui-colors';
const LUI_EXTENSIONS = new Set(['.lui', '.lmod', '.lpe']);

function isLuiStyleExtension(extension) {
  return LUI_EXTENSIONS.has(String(extension || '').toLowerCase());
}

function isLunaLanguage(document) {
  return document.languageId === LANGUAGE || document.languageId === COLOR_LANGUAGE;
}

function severity(value) {
  return value === 'error' ? vscode.DiagnosticSeverity.Error
    : value === 'warning' ? vscode.DiagnosticSeverity.Warning
      : value === 'info' ? vscode.DiagnosticSeverity.Information
        : vscode.DiagnosticSeverity.Hint;
}

function rangeForLine(document, line, start = 0, end) {
  const text = document.lineAt(line).text;
  return new vscode.Range(line, Math.min(start, text.length), line, Math.min(end ?? text.length, text.length));
}

class WorkspaceIndex {
  constructor(output) {
    this.output = output;
    this.elements = new Map();
    this.nativeElements = new Map();
    this.classes = new Map();
    this.states = new Map();
    this.colors = new Map();
    this.luaGlobals = new Map();
    this.colorAliases = new Set(core.BUILTIN_COLOR_ALIASES);
    this.properties = new Set(core.CORE_PROPERTIES);
    this.loadOrder = [];
    this.importEvents = [];
    this.importDiagnostics = [];
    this.sourceErrors = [];
    this.loadOrderAuthoritative = false;
    this.rebuildPromise = undefined;
    this.ready = false;
  }

  add(map, name, uri, line, detail, extra = {}) {
    if (!name) return;
    const entries = map.get(name) || [];
    entries.push({ uri, line, detail, ...extra });
    map.set(name, entries);
  }

  indexLui(uri, text, styles = true) {
    const parsed = core.parseDocument(text);
    const colors = core.collectColorAliases(parsed, this.colorAliases);
    this.colorAliases = colors.aliases;
    for (const item of colors.definitions) {
      this.add(this.colors, item.name, uri, item.line, `Alias de cor ${item.name}: ${item.value}`, { value: item.value });
    }
    if (!styles) return;
    const symbols = core.collectLocalSymbols(parsed);
    for (const item of symbols.elements) {
      this.add(this.elements, item.name, uri, item.line,
        item.decl.inherited ? `${item.name} < ${item.decl.inherited}` : item.name);
    }
    for (const item of symbols.classes) this.add(this.classes, item.name, uri, item.line, `.${item.name}`);
    for (const item of symbols.states) this.add(this.states, item.name, uri, item.line, `Estado customizado ${item.name}`);
    for (const binding of core.collectLuaBindings(parsed)) {
      this.add(this.luaGlobals, binding.name, uri, binding.line,
        `Global Lua declarado por @bind ${binding.bindKind}`, binding);
    }
    for (const node of parsed.nodes) {
      if (!node.unique || !node.tag || /^[!]?[$@]/.test(node.tag)) continue;
      const name = node.tag.startsWith('!') ? node.tag.slice(1) : node.tag;
      if (/^[A-Za-z_][\w.-]*$/.test(name)) this.properties.add(name);
    }
  }

  indexLua(uri, text) {
    const extendsPattern = /\b([A-Za-z_]\w*)\s*=\s*extends\s*\(\s*([A-Za-z_]\w*)\s*,\s*(['"])([A-Za-z_]\w*)\3/g;
    for (const match of text.matchAll(extendsPattern)) {
      const line = text.slice(0, match.index).split('\n').length - 1;
      this.add(this.nativeElements, match[4] || match[1], uri, line, `Classe Lua ${match[4] || match[1]} < ${match[2]}`);
    }
    const newClassPattern = /\b([A-Za-z_]\w*)\s*=\s*newclass\s*\(\s*(['"])([A-Za-z_]\w*)\2/g;
    for (const match of text.matchAll(newClassPattern)) {
      const line = text.slice(0, match.index).split('\n').length - 1;
      this.add(this.nativeElements, match[3] || match[1], uri, line, `Classe Lua ${match[3] || match[1]}`);
    }
    const styleProperty = /(?:node:tag\(\)|node\.tag)\s*==\s*(['"])([^'"]+)\1/g;
    for (const match of text.matchAll(styleProperty)) this.properties.add(match[2]);
  }

  indexCpp(uri, text) {
    const tagPattern = /(?:node->tag\(\)|\btag)\s*(?:==|!=)\s*"([^"]+)"/g;
    for (const match of text.matchAll(tagPattern)) this.properties.add(match[1]);
    const colorAliasPattern = /Color::registerAlias\s*\(\s*"([^"]+)"/g;
    for (const match of text.matchAll(colorAliasPattern)) {
      const line = text.slice(0, match.index).split('\n').length - 1;
      this.colorAliases.add(match[1]);
      this.add(this.colors, match[1], uri, line, `Alias de cor ${match[1]}`);
    }
    const luaClassPattern = /bindClass(?:Static)?Function\s*<\s*([A-Za-z_]\w*)/g;
    for (const match of text.matchAll(luaClassPattern)) {
      const line = text.slice(0, match.index).split('\n').length - 1;
      this.add(this.nativeElements, match[1], uri, line, `Classe nativa ${match[1]}`);
    }
  }

  expandPath(value) {
    const folders = vscode.workspace.workspaceFolders || [];
    let expanded = String(value || '');
    expanded = expanded.replace(/\$\{workspaceFolder(?::([^}]+))?\}/g, (_, name) => {
      const folder = name ? folders.find(item => item.name === name) : folders[0];
      return folder?.uri.fsPath || '';
    });
    expanded = expanded.replace(/\$\{env:([^}]+)\}/g, (_, name) => process.env[name] || '');
    if (expanded === '~' || expanded.startsWith(`~${path.sep}`) || expanded.startsWith('~/')) {
      expanded = path.join(os.homedir(), expanded.slice(2));
    }
    if (!path.isAbsolute(expanded)) {
      expanded = path.resolve(folders[0]?.uri.fsPath || process.cwd(), expanded);
    }
    return path.normalize(expanded);
  }

  async walkMarkup(directory) {
    const found = [];
    const ignored = new Set(['.git', 'node_modules', 'build', 'dist', 'out', 'vendor']);
    const walk = async current => {
      const entries = (await fs.readdir(current, { withFileTypes: true }))
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (entry.isDirectory() && !ignored.has(entry.name)) await walk(path.join(current, entry.name));
        else if (entry.isFile() && /\.(?:lui|lmod|lpe|lml|otml)$/i.test(entry.name)) found.push(path.join(current, entry.name));
      }
    };
    await walk(directory);
    return found;
  }

  async resolveStyleSources(config, maxFiles) {
    const configured = config.get('styleSources', []);
    if (!Array.isArray(configured) || !configured.length) {
      this.loadOrderAuthoritative = false;
      const exclude = config.get('index.exclude', '**/{.git,.luna-ui-cache,node_modules,build,dist,out,vendor}/**');
      const uris = await vscode.workspace.findFiles('**/*.{lui,lmod,lpe,lml,otml}', exclude, maxFiles);
      return uris.sort((a, b) => a.fsPath.localeCompare(b.fsPath)).map(uri => ({ uri, source: 'Workspace' }));
    }

    this.loadOrderAuthoritative = true;
    const resolved = [];
    for (let index = 0; index < configured.length && resolved.length < maxFiles; index += 1) {
      const source = typeof configured[index] === 'string'
        ? { path: configured[index] }
        : configured[index] || {};
      if (source.enabled === false || !source.path) continue;
      const root = this.expandPath(source.path);
      const label = source.name || `Fonte ${index + 1}`;
      try {
        const rootStat = await fs.stat(root);
        let paths = [];
        if (rootStat.isFile()) paths = [root];
        else if (Array.isArray(source.files) && source.files.length) {
          for (const relative of source.files) {
            const target = path.resolve(root, this.expandPath(relative).startsWith(root)
              ? path.relative(root, this.expandPath(relative)) : relative);
            const stat = await fs.stat(target);
            if (stat.isDirectory()) {
              this.loadOrderAuthoritative = false;
              paths.push(...await this.walkMarkup(target));
            }
            else if (/\.(?:lui|lmod|lpe|lml|otml)$/i.test(target)) paths.push(target);
          }
        } else if (rootStat.isDirectory()) {
          this.loadOrderAuthoritative = false;
          paths = await this.walkMarkup(root);
        }
        for (const filePath of paths) {
          if (resolved.length >= maxFiles) break;
          resolved.push({ uri: vscode.Uri.file(filePath), source: label });
        }
      } catch (error) {
        this.sourceErrors.push(`${label}: ${root} — ${error.message}`);
      }
    }
    return resolved;
  }

  async rebuild() {
    if (!this.rebuildPromise) {
      this.rebuildPromise = this.rebuildNow().finally(() => {
        this.rebuildPromise = undefined;
      });
    }
    return this.rebuildPromise;
  }

  async rebuildNow() {
    this.ready = false;
    this.elements.clear();
    this.nativeElements.clear();
    this.classes.clear();
    this.states.clear();
    this.colors.clear();
    this.luaGlobals.clear();
    this.colorAliases = new Set(core.BUILTIN_COLOR_ALIASES);
    this.properties = new Set(core.CORE_PROPERTIES);
    this.loadOrder = [];
    this.importEvents = [];
    this.importDiagnostics = [];
    this.sourceErrors = [];
    this.loadOrderAuthoritative = false;
    const config = vscode.workspace.getConfiguration('lunaUI');
    const maxFiles = config.get('index.maxFiles', 10000);
    const exclude = config.get('index.exclude', '**/{.git,.luna-ui-cache,node_modules,build,dist,out,vendor}/**');
    const uris = await vscode.workspace.findFiles('**/*.{lua,cpp,cc,cxx,h,hpp}', exclude, maxFiles);
    const files = [];
    for (const uri of uris) {
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(bytes).toString('utf8');
        const ext = uri.path.slice(uri.path.lastIndexOf('.')).toLowerCase();
        files.push({ uri, text, ext });
      } catch (_) {
        // An unreadable generated file should not disable language support.
      }
    }
    // Native aliases/classes and dynamic properties remain workspace-local.
    for (const file of files.filter(item => item.ext !== '.lua')) {
      this.indexCpp(file.uri, file.text);
    }
    for (const file of files.filter(item => item.ext === '.lua')) this.indexLua(file.uri, file.text);

    const styleUris = await this.resolveStyleSources(config, maxFiles);
    const dirty = new Map(vscode.workspace.textDocuments
      .filter(document => document.isDirty)
      .map(document => [document.uri.toString(), document.getText()]));
    const styleFiles = [];
    for (const item of styleUris) {
      try {
        const text = dirty.get(item.uri.toString())
          ?? Buffer.from(await vscode.workspace.fs.readFile(item.uri)).toString('utf8');
        const ext = path.extname(item.uri.fsPath).toLowerCase();
        const parsed = core.parseDocument(text);
        const file = { ...item, text, ext, parsed, label: item.uri.fsPath };
        styleFiles.push(file);
        this.loadOrder.push(file);
        if (isLuiStyleExtension(ext)) {
          for (const binding of core.collectLuaBindings(parsed)) {
            this.add(this.luaGlobals, binding.name, item.uri, binding.line,
              `Global Lua declarado por @bind ${binding.bindKind}`, binding);
          }
        }
        for (const issue of parsed.diagnostics) {
          this.importDiagnostics.push({ ...issue, uri: item.uri, label: item.uri.fsPath });
        }
      } catch (error) {
        this.sourceErrors.push(`${item.source}: ${item.uri.fsPath} — ${error.message}`);
      }
    }

    for (const file of styleFiles.filter(item => ['.lml', '.otml'].includes(item.ext))) {
      const colors = core.collectColorAliases(file.parsed, this.colorAliases);
      this.colorAliases = colors.aliases;
      for (const color of colors.definitions) {
        this.add(this.colors, color.name, file.uri, color.line,
          `Alias de cor ${color.name}: ${color.value}`, { value: color.value });
      }
    }
    const model = core.buildStyleModel(styleFiles.filter(item => isLuiStyleExtension(item.ext)));
    this.importEvents = model.events;
    if (this.loadOrderAuthoritative) this.importDiagnostics.push(...model.diagnostics);
    for (const [name, entry] of model.elements) this.elements.set(name, [entry]);
    for (const [name, entry] of model.classes) this.classes.set(name, [entry]);
    for (const [name, entry] of model.states) this.states.set(name, [entry]);
    for (const property of model.properties) this.properties.add(property);
    for (const [name, entries] of this.nativeElements) {
      const current = this.elements.get(name) || [];
      this.elements.set(name, [...current, ...entries]);
    }
    this.ready = true;
  }

  showLoadOrder() {
    this.output.clear();
    this.output.appendLine('Luna UI — ordem de carregamento efetiva');
    this.output.appendLine(this.loadOrderAuthoritative
      ? 'A ordem abaixo é explícita e usada para validar @undef, heranças e sobrescritas.'
      : 'A ordem abaixo foi inferida. Diagnósticos dependentes da ordem ficam desativados para evitar falsos positivos.');
    let lastSource;
    this.loadOrder.forEach((file, index) => {
      if (file.source !== lastSource) {
        this.output.appendLine(`\n[${file.source}]`);
        lastSource = file.source;
      }
      this.output.appendLine(`${String(index + 1).padStart(4, '0')}  ${file.uri.fsPath}`);
    });
    if (!this.loadOrder.length) this.output.appendLine('\nNenhum arquivo de style foi resolvido.');
    if (this.sourceErrors.length) {
      this.output.appendLine('\nErros de configuração/leitura:');
      for (const message of this.sourceErrors) this.output.appendLine(`- ${message}`);
    }
    const important = this.importEvents.filter(event =>
      ['override-class', 'override-element', 'undef-element', 'missing-undef'].includes(event.kind));
    if (important.length) {
      this.output.appendLine('\nSobrescritas e @undef:');
      for (const event of important) {
        const location = `${event.current.label}:${event.current.line + 1}`;
        const previous = event.previous ? ` (anterior: ${event.previous.label}:${event.previous.line + 1})` : '';
        this.output.appendLine(`- ${event.kind}: ${event.name} — ${location}${previous}`);
      }
    }
    this.output.show(true);
  }

  locations(map, name) {
    return map.get(name) || [];
  }

  resolveColor(value, localValues = new Map()) {
    let current = String(value || '').trim();
    const chain = [];
    const seen = new Set();
    while (current && !seen.has(current) && chain.length < 64) {
      const literal = core.parseHexColor(current);
      if (literal) return { color: literal, hex: core.formatHexColor(literal), chain };
      seen.add(current);
      chain.push(current);
      const builtin = core.BUILTIN_COLOR_VALUES.get(current);
      if (builtin) {
        const color = core.parseHexColor(builtin);
        return { color, hex: core.formatHexColor(color), chain };
      }
      if (localValues.has(current)) {
        current = localValues.get(current);
        continue;
      }
      const indexed = this.locations(this.colors, current).at(-1);
      if (!indexed?.value) return undefined;
      current = indexed.value;
    }
    return undefined;
  }

  diagnosticsForDocument(document) {
    if (!this.loadOrderAuthoritative) return [];
    const sourceKey = document.uri.toString();
    if (!this.loadOrder.some(file => file.uri.toString() === sourceKey && isLuiStyleExtension(file.ext))) {
      return this.importDiagnostics.filter(issue => issue.uri.toString() === sourceKey);
    }
    const files = this.loadOrder.filter(file => isLuiStyleExtension(file.ext)).map(file => {
      if (file.uri.toString() !== sourceKey) return file;
      const text = document.getText();
      return { ...file, text, parsed: core.parseDocument(text) };
    });
    return core.buildStyleModel(files).diagnostics.filter(issue => issue.uri.toString() === sourceKey);
  }
}

class AssetResolver {
  constructor(index) {
    this.index = index;
    this.cache = new Map();
  }

  clear() {
    this.cache.clear();
  }

  extensions(document) {
    return vscode.workspace.getConfiguration('lunaUI', document.uri)
      .get('assets.extensions', ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'ico', 'svg'])
      .map(value => String(value).replace(/^\./, '').toLowerCase())
      .filter(Boolean);
  }

  mounts(document) {
    const folders = vscode.workspace.workspaceFolders || [];
    const owning = vscode.workspace.getWorkspaceFolder(document.uri);
    const workspacePaths = [...new Map([owning, ...folders].filter(Boolean)
      .map(folder => [folder.uri.toString(), folder.uri.fsPath])).values()];
    const automatic = vscode.workspace.getConfiguration('lunaUI', document.uri)
      .get('assets.automaticSearch.enabled', true)
      ? assetUtils.automaticAssetMounts(path.dirname(document.uri.fsPath), workspacePaths)
      : [];
    const configured = vscode.workspace.getConfiguration('lunaUI', document.uri).get('assets.sources', []);
    const explicit = Array.isArray(configured) ? configured.flatMap(item => {
        const source = typeof item === 'string' ? { path: item } : item || {};
        if (source.enabled === false || !source.path) return [];
        return [{ path: this.index.expandPath(source.path), prefix: source.prefix || '/', automatic: false }];
      }) : [];
    return [...new Map([...automatic, ...explicit]
      .map(mount => [`${mount.prefix}\0${mount.path}`, mount])).values()];
  }

  candidates(document, value) {
    return assetUtils.candidateAssetPaths(
      value,
      this.mounts(document),
      path.dirname(document.uri.fsPath),
      this.extensions(document)
    );
  }

  async resolve(document, value) {
    const candidates = this.candidates(document, value);
    const key = candidates.join('\0');
    if (this.cache.has(key)) return this.cache.get(key) || undefined;
    for (const candidate of candidates) {
      try {
        const stat = await fs.stat(candidate);
        if (!stat.isFile()) continue;
        const result = { uri: vscode.Uri.file(candidate), mtimeMs: stat.mtimeMs };
        this.cache.set(key, result);
        return result;
      } catch (_) {
        // Try the next configured mount or extension.
      }
    }
    this.cache.set(key, null);
    return undefined;
  }
}

class FontAwesomeResolver {
  constructor(index, storageUri) {
    this.index = index;
    this.cacheRoot = path.join(storageUri.fsPath, 'fontawesome-previews');
    this.fileLists = new Map();
    this.fonts = new Map();
    this.previews = new Map();
  }

  clear() {
    this.fileLists.clear();
    this.fonts.clear();
    this.previews.clear();
  }

  roots(document) {
    const configuration = vscode.workspace.getConfiguration('lunaUI', document.uri);
    const folders = vscode.workspace.workspaceFolders || [];
    const owning = vscode.workspace.getWorkspaceFolder(document.uri);
    const workspacePaths = [...new Map([owning, ...folders].filter(Boolean)
      .map(folder => [folder.uri.toString(), folder.uri.fsPath])).values()];
    const automatic = configuration.get('assets.automaticSearch.enabled', true)
      ? fontAwesomeUtils.automaticFontDirectories(path.dirname(document.uri.fsPath), workspacePaths)
      : [];
    const configured = String(configuration.get('fontAwesome.fontPath', '') || '').trim();
    return [...new Set([...automatic, ...(configured ? [this.index.expandPath(configured)] : [])])];
  }

  async filesInRoot(root) {
    try {
      const stat = await fs.stat(root);
      if (stat.isFile()) return fontAwesomeUtils.isFontFile(root) ? [root] : [];
      if (!stat.isDirectory()) return [];
      const found = [];
      const visit = async (directory, depth) => {
        if (depth > 3 || found.length >= 1000) return;
        const entries = await fs.readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
          if (found.length >= 1000) break;
          const candidate = path.join(directory, entry.name);
          if (entry.isDirectory()) await visit(candidate, depth + 1);
          else if (entry.isFile() && fontAwesomeUtils.isFontFile(candidate)) found.push(candidate);
        }
      };
      await visit(root, 0);
      return found.sort((left, right) =>
        fontAwesomeUtils.fontFileScore(right) - fontAwesomeUtils.fontFileScore(left)
        || left.localeCompare(right));
    } catch (_) {
      return [];
    }
  }

  async fontFiles(document) {
    const roots = this.roots(document);
    const key = roots.join('\0');
    if (!this.fileLists.has(key)) {
      this.fileLists.set(key, (async () => {
        const files = [];
        const seen = new Set();
        for (const root of roots) {
          for (const file of await this.filesInRoot(root)) {
            const normalized = path.normalize(file);
            const identity = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
            if (!seen.has(identity)) {
              seen.add(identity);
              files.push(normalized);
            }
          }
        }
        return files;
      })());
    }
    return this.fileLists.get(key);
  }

  async loadFont(filePath) {
    if (!this.fonts.has(filePath)) {
      this.fonts.set(filePath, (async () => {
        try {
          const bytes = await fs.readFile(filePath);
          const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          return opentype.parse(buffer);
        } catch (_) {
          return undefined;
        }
      })());
    }
    return this.fonts.get(filePath);
  }

  async resolve(document, source) {
    const reference = fontAwesomeUtils.parseFontAwesomeSource(source);
    if (!reference) return { invalid: true, roots: this.roots(document) };
    const files = await this.fontFiles(document);
    for (const fontPath of files) {
      const font = await this.loadFont(fontPath);
      if (!font) continue;
      const svg = fontAwesomeUtils.glyphSvg(font, reference.codepoint);
      if (!svg) continue;
      const stat = await fs.stat(fontPath);
      const key = crypto.createHash('sha1')
        .update(`${fontPath}\0${stat.mtimeMs}\0${reference.codepoint}`).digest('hex');
      let uri = this.previews.get(key);
      if (!uri) {
        await fs.mkdir(this.cacheRoot, { recursive: true });
        const previewPath = path.join(this.cacheRoot, `${key}.svg`);
        await fs.writeFile(previewPath, svg, 'utf8');
        uri = vscode.Uri.file(previewPath);
        this.previews.set(key, uri);
      }
      const fullName = font.names?.fullName?.en || font.names?.fontFamily?.en;
      return { ...reference, uri, fontUri: vscode.Uri.file(fontPath), fontPath, fullName };
    }
    return { ...reference, missing: true, roots: this.roots(document), files };
  }
}

class AssetReferenceHighlighter {
  constructor() {
    this.decoration = vscode.window.createTextEditorDecorationType({ color: '#4fc1ff' });
  }

  clear(document) {
    const uri = document.uri.toString();
    for (const editor of vscode.window.visibleTextEditors.filter(item => item.document.uri.toString() === uri)) {
      editor.setDecorations(this.decoration, []);
    }
  }

  update(document) {
    if (!vscode.workspace.getConfiguration('lunaUI', document.uri)
      .get('assets.referenceHighlight.enabled', true) || document.languageId !== LANGUAGE) {
      this.clear(document);
      return;
    }
    const ranges = assetReferences(document).map(reference => reference.range);
    for (const editor of vscode.window.visibleTextEditors
      .filter(item => item.document.uri.toString() === document.uri.toString())) {
      editor.setDecorations(this.decoration, ranges);
    }
  }

  dispose() {
    this.decoration.dispose();
  }
}

function completion(label, kind, detail, insertText) {
  const item = new vscode.CompletionItem(label, kind);
  item.detail = detail;
  if (insertText) item.insertText = insertText;
  return item;
}

function valueCompletions(property, index) {
  let values = [];
  if (property === 'layout') values = core.LAYOUTS;
  else if (property === 'align' || property.endsWith('-align')) values = core.ALIGNMENTS;
  else if (/^(?:visible|enabled|checked|on|focusable|phantom|draggable|fixed-|auto-|fit-|flip-|multiline|selectable|text-wrap)/.test(property)) {
    values = ['true', 'false'];
  } else if (property.startsWith('@transition')) {
    values = ['0.2s', '200ms', ...core.EASING_EQUATIONS, ...core.EASING_FUNCTIONS];
  } else if (property.startsWith('@animation')) {
    values = ['0.5s', '200ms', ...core.LOOP_DIRECTIONS, ...core.EASING_EQUATIONS, ...core.EASING_FUNCTIONS];
  } else if (['color', 'color-edge'].includes(core.typeForProperty(property))) {
    values = [...index.colorAliases];
  } else if (['dpunit', 'point', 'size', 'rect', 'dpunit-edge', 'spacing'].includes(core.typeForProperty(property))) {
    values = ['0px', '1dp', '1sp', '1em', '100%'];
  }
  return values.map(value => completion(value, vscode.CompletionItemKind.Value, `Valor Luna UI para ${property}`));
}

function makeCompletionProvider(index) {
  return {
    provideCompletionItems(document, position) {
      const line = document.lineAt(position.line).text;
      const prefix = line.slice(0, position.character);
      const colon = prefix.indexOf(':');
      if (colon >= 0) {
        const effectiveTag = core.stripQualifier(prefix.slice(0, colon).trim()).tag;
        if (effectiveTag.startsWith('!')) return [];
        const property = effectiveTag.replace(/^!/, '');
        return valueCompletions(property, index);
      }

      const indent = line.match(/^\s*/)[0].length;
      const items = [];
      if (indent === 0) {
        for (const [name, definitions] of index.elements) {
          items.push(completion(name, vscode.CompletionItemKind.Class,
            definitions[0]?.detail || 'Elemento Luna UI', new vscode.SnippetString(`${name}\n  \${0}`)));
        }
        for (const [name] of index.classes) {
          items.push(completion(`.${name}`, vscode.CompletionItemKind.Class, 'Classe de estilo Luna UI'));
        }
        return items;
      }

      for (const property of index.properties) {
        items.push(completion(property, vscode.CompletionItemKind.Property, 'Propriedade Luna UI', `${property}: `));
      }
      for (const command of core.COMMANDS.filter(name => name !== '@undef')) {
        items.push(completion(command, vscode.CompletionItemKind.Keyword, 'Comando Luna UI', `${command} `));
      }
      for (const state of new Set([...core.STATES, ...index.states.keys()])) {
        items.push(completion(`$${state}`, vscode.CompletionItemKind.EnumMember, 'Estado Luna UI', `$${state}:`));
      }
      for (const [name, definitions] of index.elements) {
        items.push(completion(name, vscode.CompletionItemKind.Class,
          definitions[0]?.detail || 'Widget Luna UI'));
      }
      for (const [name] of index.classes) {
        items.push(completion(`.${name}`, vscode.CompletionItemKind.Class, 'Aplicar classe de estilo'));
      }
      return items;
    }
  };
}

function makeColorCompletionProvider(index) {
  return {
    provideCompletionItems(document, position) {
      const prefix = document.lineAt(position.line).text.slice(0, position.character);
      if (prefix.includes(':')) {
        return [...index.colorAliases].sort().map(value =>
          completion(value, vscode.CompletionItemKind.Color, 'Alias de cor Luna UI'));
      }
      return [completion('alias-name', vscode.CompletionItemKind.Color,
        'Novo alias de cor', new vscode.SnippetString('${1:alias-name}: ${2:#ffffff}'))];
    }
  };
}

function tokenAt(document, position) {
  const line = document.lineAt(position.line).text;
  const pattern = /\.?[A-Za-z_][\w-]*/g;
  for (const match of line.matchAll(pattern)) {
    const start = match.index;
    const end = start + match[0].length;
    if (position.character >= start && position.character <= end) {
      return { text: match[0], range: new vscode.Range(position.line, start, position.line, end) };
    }
  }
  return undefined;
}

function valueRange(document, node, value = node.value, offset = 0) {
  const colon = node.raw.indexOf(':');
  const valueStart = node.raw.indexOf(node.value, Math.max(0, colon + 1));
  const start = Math.max(node.indent, valueStart) + offset;
  return new vscode.Range(node.line, start, node.line, start + value.length);
}

function colorValuesInNode(node) {
  const effective = core.stripQualifier(node.tag).tag;
  if (!node.unique || !node.value || effective.startsWith('!')) return [];
  const property = effective.replace(/^!/, '');
  const type = core.typeForProperty(property);
  if (type === 'color') return [{ value: node.value, offset: 0 }];
  if (type !== 'color-edge') return [];
  return [...node.value.matchAll(/#[0-9a-fA-F]+|[A-Za-z_][\w-]*/g)]
    .map(match => ({ value: match[0], offset: match.index }));
}

function makeDocumentColorProvider(index) {
  return {
    async provideDocumentColors(document) {
      if (!vscode.workspace.getConfiguration('lunaUI', document.uri).get('colors.decorations.enabled', true)) return [];
      if (!index.ready) await index.rebuild();
      const parsed = core.parseDocument(document.getText());
      const found = [];
      if (document.languageId === COLOR_LANGUAGE) {
        const localValues = new Map();
        for (const node of parsed.root.children) {
          if (!node.unique || !node.tag || !node.value) continue;
          const resolved = index.resolveColor(node.value, localValues);
          if (resolved) {
            found.push(new vscode.ColorInformation(
              valueRange(document, node),
              new vscode.Color(resolved.color.red, resolved.color.green,
                resolved.color.blue, resolved.color.alpha)
            ));
            localValues.set(node.tag, node.value);
          }
        }
        return found;
      }
      for (const node of parsed.nodes) {
        for (const item of colorValuesInNode(node)) {
          const resolved = index.resolveColor(item.value);
          if (!resolved) continue;
          found.push(new vscode.ColorInformation(
            valueRange(document, node, item.value, item.offset),
            new vscode.Color(resolved.color.red, resolved.color.green,
              resolved.color.blue, resolved.color.alpha)
          ));
        }
      }
      return found;
    },

    provideColorPresentations(color) {
      const value = core.formatHexColor(color);
      return value ? [new vscode.ColorPresentation(value)] : [];
    }
  };
}

function assetReferences(document) {
  const parsed = core.parseDocument(document.getText());
  return parsed.nodes.flatMap(node => {
    if (!node.unique || !node.value) return [];
    const effective = core.stripQualifier(node.tag).tag;
    if (effective.startsWith('!')) return [];
    const property = effective.replace(/^!/, '');
    if (!assetUtils.isAssetSourceProperty(property)) return [];
    const source = assetUtils.cleanAssetValue(node.value);
    if (!source) return [];
    return [{
      kind: assetUtils.isFontAwesomeSource(source) ? 'fontawesome' : 'asset',
      property,
      source,
      range: valueRange(document, node)
    }];
  });
}

function assetReferenceAt(document, position) {
  return assetReferences(document).find(reference => reference.range.contains(position));
}

function makeAssetProvider(resolver, fontAwesomeResolver) {
  return {
    async provideHover(document, position) {
      if (!vscode.workspace.getConfiguration('lunaUI', document.uri).get('assets.hoverPreview.enabled', true)) {
        return undefined;
      }
      const reference = assetReferenceAt(document, position);
      if (!reference) return undefined;
      if (reference.kind === 'fontawesome') {
        if (!vscode.workspace.getConfiguration('lunaUI', document.uri)
          .get('fontAwesome.hoverPreview.enabled', true)) return undefined;
        const icon = await fontAwesomeResolver.resolve(document, reference.source);
        const markdown = new vscode.MarkdownString();
        if (icon.invalid) {
          markdown.appendMarkdown(`**${reference.property}** — referência Font Awesome inválida.\n\n`);
          markdown.appendMarkdown('Formato esperado: `@FontAwesome-estilo-tamanho-xcodigo`.');
          return new vscode.Hover(markdown, reference.range);
        }
        if (icon.missing) {
          markdown.appendMarkdown(`**${reference.property}** — ícone Font Awesome não encontrado.\n\n`);
          markdown.appendMarkdown(`Código: \`U+${icon.hexadecimal.toUpperCase()}\` · estilo: \`${icon.style}\` · tamanho: \`${icon.size}\`\n\n`);
          if (icon.files?.length) {
            markdown.appendMarkdown('O código não existe nas fontes encontradas:\n\n');
            for (const file of icon.files.slice(0, 8)) markdown.appendMarkdown(`- \`${file}\`\n`);
          } else {
            markdown.appendMarkdown('Nenhuma fonte `.ttf`, `.otf` ou `.woff` foi encontrada em `/assets/fonts/`.\n\n');
            markdown.appendMarkdown('Configure o arquivo ou a pasta em `lunaUI.fontAwesome.fontPath`.');
          }
          return new vscode.Hover(markdown, reference.range);
        }
        const openCommand = `command:lunaUI.openAsset?${encodeURIComponent(JSON.stringify([icon.fontUri.toString()]))}`;
        markdown.isTrusted = { enabledCommands: ['lunaUI.openAsset'] };
        markdown.baseUri = vscode.Uri.file(`${path.dirname(icon.uri.fsPath)}${path.sep}`);
        markdown.appendMarkdown(`**${reference.property}** — \`${reference.source}\`\n\n`);
        markdown.appendMarkdown(`![Prévia do Font Awesome](./${path.basename(icon.uri.fsPath)})\n\n`);
        markdown.appendMarkdown(`\`U+${icon.hexadecimal.toUpperCase()}\` · estilo \`${icon.style}\` · tamanho \`${icon.size}\`  \n`);
        if (icon.fullName) markdown.appendMarkdown(`${icon.fullName}  \n`);
        markdown.appendMarkdown(`[Abrir fonte](${openCommand})  \n\`${icon.fontPath}\``);
        return new vscode.Hover(markdown, reference.range);
      }
      const asset = await resolver.resolve(document, reference.source);
      if (!asset) {
        const attemptedDirectories = new Set();
        const attempts = resolver.candidates(document, reference.source).filter(candidate => {
          const directory = path.dirname(candidate);
          if (attemptedDirectories.has(directory)) return false;
          attemptedDirectories.add(directory);
          return true;
        }).slice(0, 8);
        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`**${reference.property}** — asset não encontrado.\n\n`);
        if (attempts.length) {
          markdown.appendMarkdown('Primeiros caminhos testados:\n\n');
          for (const attempt of attempts) markdown.appendMarkdown(`- \`${attempt}\`\n`);
        }
        markdown.appendMarkdown('\nA busca automática acontece antes de `lunaUI.assets.sources`.');
        return new vscode.Hover(markdown, reference.range);
      }
      const openCommand = `command:lunaUI.openAsset?${encodeURIComponent(JSON.stringify([asset.uri.toString()]))}`;
      const markdown = new vscode.MarkdownString();
      markdown.isTrusted = { enabledCommands: ['lunaUI.openAsset'] };
      markdown.baseUri = vscode.Uri.file(`${path.dirname(asset.uri.fsPath)}${path.sep}`);
      markdown.appendMarkdown(`**${reference.property}** — \`${reference.source}\`\n\n`);
      markdown.appendMarkdown(`![Prévia do asset](./${encodeURIComponent(path.basename(asset.uri.fsPath))})\n\n`);
      markdown.appendMarkdown(`[Abrir asset](${openCommand})  \n\`${asset.uri.fsPath}\``);
      return new vscode.Hover(markdown, reference.range);
    },

    async provideDefinition(document, position) {
      const reference = assetReferenceAt(document, position);
      if (!reference) return undefined;
      if (reference.kind === 'fontawesome') {
        const icon = await fontAwesomeResolver.resolve(document, reference.source);
        return icon.fontUri ? new vscode.Location(icon.fontUri, new vscode.Position(0, 0)) : undefined;
      }
      const asset = await resolver.resolve(document, reference.source);
      return asset ? new vscode.Location(asset.uri, new vscode.Position(0, 0)) : undefined;
    }
  };
}

function makeDefinitionProvider(index) {
  return {
    provideDefinition(document, position) {
      const token = tokenAt(document, position);
      if (!token) return undefined;
      const isClass = token.text.startsWith('.');
      const name = token.text.replace(/^\./, '');
      if (document.languageId === COLOR_LANGUAGE) {
        const parsed = core.parseDocument(document.getText());
        const local = parsed.root.children.filter(node => node.unique && node.tag === name);
        if (local.length) {
          return local.map(node => new vscode.Location(document.uri,
            new vscode.Position(node.line, node.indent)));
        }
        return index.locations(index.colors, name).map(entry =>
          new vscode.Location(entry.uri, new vscode.Position(entry.line, 0)));
      }
      const localMatches = core.findLocalDefinitions(
        core.parseDocument(document.getText()), name, isClass ? 'class' : 'element');
      if (localMatches.length) {
        return localMatches.map(entry => new vscode.Location(document.uri, new vscode.Position(entry.line, 0)));
      }
      const found = isClass ? index.locations(index.classes, name) : index.locations(index.elements, name);
      if (!found.length && index.colors.has(name)) {
        return index.locations(index.colors, name).map(entry =>
          new vscode.Location(entry.uri, new vscode.Position(entry.line, 0)));
      }
      return found.map(entry => new vscode.Location(entry.uri, new vscode.Position(entry.line, 0)));
    }
  };
}

function makeLuaGlobalDefinitionProvider(index) {
  return {
    provideDefinition(document, position) {
      const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
      if (!range) return undefined;
      const name = document.getText(range);
      const found = index.locations(index.luaGlobals, name);
      if (!found.length) return undefined;
      return found.map(entry => new vscode.Location(entry.uri, new vscode.Range(
        entry.line,
        entry.start ?? 0,
        entry.line,
        entry.end ?? ((entry.start ?? 0) + name.length)
      )));
    }
  };
}

function makeHoverProvider(index) {
  return {
    provideHover(document, position) {
      const token = tokenAt(document, position);
      if (!token) return undefined;
      const raw = token.text;
      const name = raw.replace(/^\./, '');
      if (document.languageId === COLOR_LANGUAGE) {
        const parsed = core.parseDocument(document.getText());
        const local = parsed.root.children.find(node => node.unique && node.tag === name);
        const indexed = index.locations(index.colors, name)[0];
        const resolved = index.resolveColor(name);
        const final = resolved ? ` Cor final: \`${resolved.hex}\`.` : '';
        const chain = resolved?.chain.length > 1 ? `\n\nResolução: \`${resolved.chain.join(' → ')}\`.` : '';
        if (local) return new vscode.Hover(`Alias de cor **${name}**: \`${local.value}\`.${final}${chain}`, token.range);
        if (indexed) return new vscode.Hover(`${indexed.detail || `Alias de cor **${name}**.`}${final}${chain}`, token.range);
      }
      if (raw.startsWith('.') && index.classes.has(name)) {
        return new vscode.Hover([`**.${name}**`, 'Classe de estilo Luna UI.'], token.range);
      }
      const element = index.locations(index.elements, name)[0];
      if (element) return new vscode.Hover([`**${name}**`, element.detail || 'Elemento Luna UI.'], token.range);
      if (index.properties.has(name)) {
        const type = core.typeForProperty(name);
        const extra = name === 'layout' ? `Valores: ${core.LAYOUTS.join(', ')}.`
          : type ? `Tipo de valor: **${type}**.` : 'Propriedade reconhecida pelo core ou pelo workspace.';
        return new vscode.Hover([`**${name}**`, extra], token.range);
      }
      if (index.colorAliases.has(name)) {
        const resolved = index.resolveColor(name);
        const chain = resolved?.chain.length > 1 ? `\n\nResolução: \`${resolved.chain.join(' → ')}\`.` : '';
        const value = resolved ? ` Cor final: \`${resolved.hex}\`.` : '';
        return new vscode.Hover(`Alias de cor **${name}**.${value}${chain}`, token.range);
      }
      if (core.UNITS.includes(name)) {
        return new vscode.Hover(`Unidade **${name}** reconhecida por \`DPUnit\`.`, token.range);
      }
      return undefined;
    }
  };
}

function symbolKind(node) {
  if (node.declaration?.kind === 'class') return vscode.SymbolKind.Class;
  if (node.declaration?.kind === 'element') return vscode.SymbolKind.Interface;
  if (node.tag.startsWith('$')) return vscode.SymbolKind.Event;
  if (node.tag.startsWith('@')) return vscode.SymbolKind.Function;
  if (node.unique) return vscode.SymbolKind.Property;
  return vscode.SymbolKind.Object;
}

function makeDocumentSymbolProvider() {
  return {
    provideDocumentSymbols(document) {
      const parsed = core.parseDocument(document.getText());
      function subtreeEnd(node) {
        const childEnd = node.children.length ? subtreeEnd(node.children[node.children.length - 1]) : node.line;
        const multilineEnd = node.multilineLines?.length ? node.multilineLines.at(-1).line : node.line;
        return Math.max(node.line, childEnd, multilineEnd);
      }
      function convert(node) {
        const endLine = subtreeEnd(node);
        const symbol = new vscode.DocumentSymbol(
          node.tag || `- ${node.value}`,
          node.value && !node.multiline ? node.value : '',
          symbolKind(node),
          new vscode.Range(node.line, 0, endLine, document.lineAt(endLine).text.length),
          rangeForLine(document, node.line, node.indent, node.raw.length)
        );
        symbol.children = node.children.map(convert);
        return symbol;
      }
      return parsed.root.children.map(node => {
        node.declaration = core.parseDeclaration(node.tag);
        return convert(node);
      });
    }
  };
}

function makeFoldingProvider() {
  return {
    provideFoldingRanges(document) {
      const parsed = core.parseDocument(document.getText());
      const ranges = [];
      function subtreeEnd(node) {
        const childEnd = node.children.length ? subtreeEnd(node.children[node.children.length - 1]) : node.line;
        const multilineEnd = node.multilineLines?.length ? node.multilineLines.at(-1).line : node.line;
        return Math.max(node.line, childEnd, multilineEnd);
      }
      for (const node of parsed.nodes) {
        const last = subtreeEnd(node);
        if (last > node.line) ranges.push(new vscode.FoldingRange(node.line, last));
      }
      return ranges;
    }
  };
}

function vscodeDiagnostic(issue, document) {
  const diagnosticRange = document
    ? rangeForLine(document, issue.line, issue.start, issue.end)
    : new vscode.Range(issue.line, issue.start || 0, issue.line,
      Math.max((issue.start || 0) + 1, issue.end || (issue.start || 0) + 1));
  const item = new vscode.Diagnostic(diagnosticRange, issue.message, severity(issue.severity));
  item.code = issue.code;
  item.source = 'Luna UI';
  return item;
}

class LuaEmbeddedBridge {
  constructor(diagnostics, context) {
    this.diagnostics = diagnostics;
    this.states = new Map();
    this.sourceByVirtual = new Map();
    this.fallbackRoot = vscode.Uri.joinPath(context.globalStorageUri, 'embedded-lua');
    this.shadowRootsReady = new Map();
    this.shadowUris = new Set();
  }

  bindGlobalType(scope) {
    return vscode.workspace.getConfiguration('lunaUI', scope)
      .get('luaIntegration.bindGlobalType', 'any') === 'UIWidget'
      ? 'UIWidget'
      : 'any';
  }

  shadowRoot(document) {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri) || vscode.workspace.workspaceFolders?.[0];
    // Keep the shadow inside the owning workspace so LuaLS applies the same
    // runtime, workspace libraries, globals and diagnostics configuration.
    // Do not place it below .vscode: LuaLS ignores that directory by default.
    return folder ? vscode.Uri.joinPath(folder.uri, '.luna-ui-cache') : this.fallbackRoot;
  }

  virtualUri(document, root = this.shadowRoot(document)) {
    const hash = crypto.createHash('sha1').update(document.uri.toString()).digest('hex');
    const base = path.basename(document.uri.fsPath, path.extname(document.uri.fsPath))
      .replace(/[^A-Za-z0-9_-]/g, '_');
    return vscode.Uri.joinPath(root, `${base}-${hash.slice(0, 12)}.lua`);
  }

  isShadowUri(uri) {
    return this.shadowUris.has(uri.toString());
  }

  async ensureShadowRoot(root) {
    const key = root.toString();
    if (!this.shadowRootsReady.has(key)) {
      this.shadowRootsReady.set(key, vscode.workspace.fs.createDirectory(root));
    }
    await this.shadowRootsReady.get(key);
  }

  async supportsLua() {
    const candidates = vscode.extensions.all.filter(extension =>
      extension.packageJSON?.contributes?.languages?.some(language => language.id === 'lua')
      || extension.id.toLowerCase() === 'sumneko.lua');
    await Promise.all(candidates.map(extension => extension.isActive
      ? undefined
      : extension.activate().catch(() => undefined)));
    return (await vscode.languages.getLanguages()).includes('lua');
  }

  async writeShadow(root, uri, content) {
    await this.ensureShadowRoot(root);
    const key = uri.toString();
    this.shadowUris.add(key);
    let document = vscode.workspace.textDocuments.find(item => item.uri.toString() === key);
    if (!document) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
      document = await vscode.workspace.openTextDocument(uri);
    } else if (document.getText() !== content) {
      const edit = new vscode.WorkspaceEdit();
      const end = document.positionAt(document.getText().length);
      edit.replace(uri, new vscode.Range(0, 0, end.line, end.character), content);
      await vscode.workspace.applyEdit(edit);
      await document.save();
    }
    if (document.languageId !== 'lua') {
      document = await vscode.languages.setTextDocumentLanguage(document, 'lua');
    }
    return document;
  }

  async refreshGlobals(globals) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder || !(await this.supportsLua())) return;
    const bindGlobalType = this.bindGlobalType(folder.uri);
    const root = vscode.Uri.joinPath(folder.uri, '.luna-ui-cache');
    const uri = vscode.Uri.joinPath(root, 'luna-ui-bindings.lua');
    const content = luaEmbedding.buildLuaBindingsDocument(globals, bindGlobalType);
    await this.writeShadow(root, uri, content);
  }

  async refresh(document) {
    const enabled = vscode.workspace.getConfiguration('lunaUI', document.uri).get('luaIntegration.enabled', true);
    if (!enabled || document.languageId !== LANGUAGE || !(await this.supportsLua())) return undefined;
    const bindGlobalType = this.bindGlobalType(document.uri);
    const built = luaEmbedding.buildLuaVirtualDocument(
      document.getText(), document.uri.toString(), bindGlobalType);
    const root = this.shadowRoot(document);
    const virtualUri = this.virtualUri(document, root);
    const state = { ...built, sourceUri: document.uri, virtualUri, version: document.version };
    const key = virtualUri.toString();
    this.states.set(document.uri.toString(), state);
    this.sourceByVirtual.set(key, state);
    this.diagnostics.delete(document.uri);
    await this.writeShadow(root, virtualUri, state.content);
    return state;
  }

  async position(document, position) {
    const state = await this.refresh(document);
    if (!state) return undefined;
    const mapping = luaEmbedding.mappingAtSource(state, position.line, position.character);
    if (!mapping) return undefined;
    const mapped = luaEmbedding.sourceToVirtual(mapping, position.line, position.character);
    return { state, position: new vscode.Position(mapped.line, mapped.character) };
  }

  sourceRange(state, range) {
    const startMapping = state.mappings.find(item => item.virtualLine === range.start.line
      && range.end.character >= item.virtualStart && range.start.character <= item.virtualEnd);
    const endMapping = state.mappings.find(item => item.virtualLine === range.end.line
      && range.end.character >= item.virtualStart
      && (range.end.line !== range.start.line || range.start.character <= item.virtualEnd)) || startMapping;
    if (!startMapping || !endMapping) return undefined;
    const start = luaEmbedding.virtualToSource(startMapping, range.start.line,
      Math.max(startMapping.virtualStart, range.start.character));
    const end = luaEmbedding.virtualToSource(endMapping, range.end.line,
      Math.min(endMapping.virtualEnd, range.end.character));
    return new vscode.Range(start.line, start.character, end.line, end.character);
  }

  diagnosticSourceRange(state, range) {
    const direct = this.sourceRange(state, range);
    if (direct) return direct;

    // Parser errors such as a missing `end` are commonly attached to EOF by
    // LuaLS. EOF is outside every expression mapping, so associate the error
    // with the closest preceding embedded expression instead of dropping it.
    const mapping = luaEmbedding.closestMappingAtOrBefore(
      state, range.start.line, range.start.character);
    if (!mapping) return undefined;
    return new vscode.Range(
      mapping.sourceLine,
      mapping.sourceStart,
      mapping.sourceLine,
      Math.max(mapping.sourceStart + 1, mapping.sourceEnd)
    );
  }

  mapDiagnostics(uri) {
    const state = this.sourceByVirtual.get(uri.toString());
    if (!state) return;
    const mapped = [];
    for (const diagnostic of vscode.languages.getDiagnostics(uri)) {
      const range = this.diagnosticSourceRange(state, diagnostic.range);
      if (!range) continue;
      const item = new vscode.Diagnostic(range, diagnostic.message, diagnostic.severity);
      item.code = diagnostic.code;
      item.source = diagnostic.source || 'Lua';
      item.tags = diagnostic.tags;
      mapped.push(item);
    }
    this.diagnostics.set(state.sourceUri, mapped);
  }

  async completion(document, position, token, context) {
    const mapped = await this.position(document, position);
    if (!mapped || token.isCancellationRequested) return undefined;
    const result = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider',
      mapped.state.virtualUri, mapped.position, context.triggerCharacter);
    if (!result) return undefined;
    const items = Array.isArray(result) ? result : result.items;
    for (const item of items || []) {
      if (item.range instanceof vscode.Range) item.range = this.sourceRange(mapped.state, item.range);
      else if (item.range?.inserting && item.range?.replacing) {
        const inserting = this.sourceRange(mapped.state, item.range.inserting);
        const replacing = this.sourceRange(mapped.state, item.range.replacing);
        item.range = inserting && replacing ? { inserting, replacing } : undefined;
      }
      item.additionalTextEdits = undefined;
    }
    return result;
  }

  async hover(document, position, token) {
    const mapped = await this.position(document, position);
    if (!mapped || token.isCancellationRequested) return undefined;
    const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider',
      mapped.state.virtualUri, mapped.position);
    if (!hovers?.length) return undefined;
    const contents = hovers.flatMap(hover => hover.contents || []);
    const range = hovers[0].range ? this.sourceRange(mapped.state, hovers[0].range) : undefined;
    return new vscode.Hover(contents, range);
  }

  async definition(document, position, token) {
    const mapped = await this.position(document, position);
    if (!mapped || token.isCancellationRequested) return undefined;
    const definitions = await vscode.commands.executeCommand('vscode.executeDefinitionProvider',
      mapped.state.virtualUri, mapped.position);
    if (!definitions) return undefined;
    const values = Array.isArray(definitions) ? definitions : [definitions];
    return values.map(value => {
      if (value.uri?.toString() === mapped.state.virtualUri.toString()) {
        const range = this.sourceRange(mapped.state, value.range);
        return range ? new vscode.Location(mapped.state.sourceUri, range) : undefined;
      }
      if (value.targetUri?.toString() === mapped.state.virtualUri.toString()) {
        const targetRange = this.sourceRange(mapped.state, value.targetRange);
        const targetSelectionRange = this.sourceRange(mapped.state, value.targetSelectionRange);
        return targetRange && targetSelectionRange
          ? { ...value, targetUri: mapped.state.sourceUri, targetRange, targetSelectionRange }
          : undefined;
      }
      return value;
    }).filter(Boolean);
  }

  async signature(document, position, token, context) {
    const mapped = await this.position(document, position);
    if (!mapped || token.isCancellationRequested) return undefined;
    return vscode.commands.executeCommand('vscode.executeSignatureHelpProvider',
      mapped.state.virtualUri, mapped.position, context.triggerCharacter);
  }

  async openShadow(document) {
    const state = await this.refresh(document);
    if (!state) {
      vscode.window.showWarningMessage('Luna UI: nenhuma extensão com suporte à linguagem Lua foi encontrada.');
      return;
    }
    const shadow = await vscode.workspace.openTextDocument(state.virtualUri);
    await vscode.window.showTextDocument(shadow, { preview: true, viewColumn: vscode.ViewColumn.Beside });
  }
}

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection('luna-ui');
  const luaDiagnostics = vscode.languages.createDiagnosticCollection('luna-ui-embedded-lua');
  const output = vscode.window.createOutputChannel('Luna UI');
  const index = new WorkspaceIndex(output);
  const assetResolver = new AssetResolver(index);
  const fontAwesomeResolver = new FontAwesomeResolver(index, context.globalStorageUri);
  const assetReferenceHighlighter = new AssetReferenceHighlighter();
  const luaBridge = new LuaEmbeddedBridge(luaDiagnostics, context);
  const colorProvider = makeDocumentColorProvider(index);
  const assetProvider = makeAssetProvider(assetResolver, fontAwesomeResolver);
  let timer;

  async function validate(document) {
    if (!isLunaLanguage(document)) return;
    assetReferenceHighlighter.update(document);
    const config = vscode.workspace.getConfiguration('lunaUI');
    if (!config.get('diagnostics.enabled', true)) {
      diagnostics.delete(document.uri);
      return;
    }
    const parsed = core.parseDocument(document.getText());
    if (document.languageId === COLOR_LANGUAGE) {
      const issues = core.validateColorScheme(parsed, index.colorAliases);
      const seen = new Set();
      diagnostics.set(document.uri, issues.filter(issue => {
        const key = `${issue.line}:${issue.start}:${issue.code}:${issue.message}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map(issue => vscodeDiagnostic(issue, document)));
      return;
    }
    const local = core.collectLocalSymbols(parsed);
    const semantic = core.validateSemantics(parsed, {
      elements: new Set([...index.elements.keys(), ...local.elements.map(item => item.name)]),
      classes: new Set([...index.classes.keys(), ...local.classes.map(item => item.name)]),
      states: new Set([...index.states.keys(), ...local.states.map(item => item.name)]),
      properties: index.properties,
      colorAliases: index.colorAliases,
      unknownElements: config.get('diagnostics.unknownElements', 'warning'),
      unknownProperties: config.get('diagnostics.unknownProperties', 'off'),
      unknownColorAliases: config.get('diagnostics.unknownColorAliases', 'off'),
      validateRootReferences: false
    });
    const importIssues = index.diagnosticsForDocument(document);
    const issues = [...parsed.diagnostics, ...semantic, ...importIssues];

    const seen = new Set();
    const all = issues.filter(issue => {
      const key = `${issue.line}:${issue.start}:${issue.code}:${issue.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(issue => vscodeDiagnostic(issue, document));
    diagnostics.set(document.uri, all);
    if (config.get('luaIntegration.enabled', true)) await luaBridge.refresh(document);
    else luaDiagnostics.delete(document.uri);
  }

  async function reindex() {
    await index.rebuild();
    await luaBridge.refreshGlobals(index.luaGlobals);
    diagnostics.clear();
    const grouped = new Map();
    for (const issue of index.importDiagnostics) {
      const key = issue.uri.toString();
      const group = grouped.get(key) || { uri: issue.uri, issues: [] };
      group.issues.push(vscodeDiagnostic(issue));
      grouped.set(key, group);
    }
    for (const group of grouped.values()) diagnostics.set(group.uri, group.issues);
    await Promise.all(vscode.workspace.textDocuments.map(validate));
    vscode.window.setStatusBarMessage(
      `Luna UI: ${index.elements.size} elementos, ${index.classes.size} classes e ${index.colorAliases.size} cores`, 3500);
    if (index.sourceErrors.length) {
      vscode.window.showWarningMessage('Luna UI: algumas fontes de style não puderam ser carregadas. Use “Show Load Order” para ver os detalhes.');
    }
  }

  function schedule(document, rebuild = false) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (rebuild) await reindex();
      else await validate(document);
    }, 250);
  }

  context.subscriptions.push(
    diagnostics,
    luaDiagnostics,
    output,
    assetReferenceHighlighter,
    vscode.commands.registerCommand('lunaUI.reindex', reindex),
    vscode.commands.registerCommand('lunaUI.showLoadOrder', () => index.showLoadOrder()),
    vscode.commands.registerCommand('lunaUI.openLuaShadow', () => {
      const document = vscode.window.activeTextEditor?.document;
      if (document?.languageId === LANGUAGE) return luaBridge.openShadow(document);
      return vscode.window.showWarningMessage('Abra um arquivo .lui para inspecionar o Lua embutido.');
    }),
    vscode.commands.registerCommand('lunaUI.openAsset', uri => {
      if (typeof uri !== 'string') return undefined;
      return vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(uri));
    }),
    vscode.workspace.onDidOpenTextDocument(validate),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (isLunaLanguage(event.document)) schedule(event.document);
    }),
    vscode.workspace.onDidSaveTextDocument(document => {
      assetResolver.clear();
      fontAwesomeResolver.clear();
      if (!luaBridge.isShadowUri(document.uri)) {
        schedule(document, /\.(?:lui|lmod|lpe|lml|otml|lua|cpp|cc|cxx|h|hpp)$/i.test(document.fileName));
      }
    }),
    vscode.workspace.onDidCreateFiles(() => {
      assetResolver.clear();
      fontAwesomeResolver.clear();
    }),
    vscode.workspace.onDidDeleteFiles(() => {
      assetResolver.clear();
      fontAwesomeResolver.clear();
      reindex();
    }),
    vscode.workspace.onDidRenameFiles(() => {
      assetResolver.clear();
      fontAwesomeResolver.clear();
      reindex();
    }),
    vscode.workspace.onDidCloseTextDocument(document => {
      assetReferenceHighlighter.clear(document);
      if (isLunaLanguage(document)) diagnostics.delete(document.uri);
      if (document.languageId === LANGUAGE) luaDiagnostics.delete(document.uri);
    }),
    vscode.languages.onDidChangeDiagnostics(event => {
      for (const uri of event.uris) {
        if (luaBridge.isShadowUri(uri)) luaBridge.mapDiagnostics(uri);
      }
    }),
    vscode.window.onDidChangeVisibleTextEditors(editors => {
      for (const editor of editors) {
        if (isLunaLanguage(editor.document)) assetReferenceHighlighter.update(editor.document);
      }
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('lunaUI')) {
        assetResolver.clear();
        fontAwesomeResolver.clear();
        reindex();
      }
    }),
    vscode.languages.registerCompletionItemProvider(LANGUAGE, makeCompletionProvider(index), ':', '.', '@', '$', ' '),
    vscode.languages.registerCompletionItemProvider(COLOR_LANGUAGE,
      makeColorCompletionProvider(index), ':', ' '),
    vscode.languages.registerCompletionItemProvider(LANGUAGE, {
      provideCompletionItems: (document, position, token, completionContext) =>
        luaBridge.completion(document, position, token, completionContext)
    }, '.', ':', '"', "'"),
    vscode.languages.registerDefinitionProvider(LANGUAGE, makeDefinitionProvider(index)),
    vscode.languages.registerDefinitionProvider(COLOR_LANGUAGE, makeDefinitionProvider(index)),
    vscode.languages.registerDefinitionProvider(LANGUAGE, assetProvider),
    vscode.languages.registerDefinitionProvider(LANGUAGE, {
      provideDefinition: (document, position, token) => luaBridge.definition(document, position, token)
    }),
    vscode.languages.registerDefinitionProvider({ language: 'lua', scheme: 'file' },
      makeLuaGlobalDefinitionProvider(index)),
    vscode.languages.registerHoverProvider(LANGUAGE, makeHoverProvider(index)),
    vscode.languages.registerHoverProvider(COLOR_LANGUAGE, makeHoverProvider(index)),
    vscode.languages.registerHoverProvider(LANGUAGE, assetProvider),
    vscode.languages.registerHoverProvider(LANGUAGE, {
      provideHover: (document, position, token) => luaBridge.hover(document, position, token)
    }),
    vscode.languages.registerSignatureHelpProvider(LANGUAGE, {
      provideSignatureHelp: (document, position, token, signatureContext) =>
        luaBridge.signature(document, position, token, signatureContext)
    }, '(', ','),
    vscode.languages.registerDocumentSymbolProvider(LANGUAGE, makeDocumentSymbolProvider()),
    vscode.languages.registerDocumentSymbolProvider(COLOR_LANGUAGE, makeDocumentSymbolProvider()),
    vscode.languages.registerColorProvider(LANGUAGE, colorProvider),
    vscode.languages.registerColorProvider(COLOR_LANGUAGE, colorProvider),
    vscode.languages.registerFoldingRangeProvider(LANGUAGE, makeFoldingProvider()),
    vscode.languages.registerFoldingRangeProvider(COLOR_LANGUAGE, makeFoldingProvider())
  );

  reindex();
}

function deactivate() {}

module.exports = { activate, deactivate };
