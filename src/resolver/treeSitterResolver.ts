import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import Parser from 'web-tree-sitter';
import type { ResolvedSymbol, SymbolDecl, SymbolResolver } from './SymbolResolver';
import { contentHash } from './hash';

const require = createRequire(import.meta.url);
// Prebuilt grammars (tree-sitter-wasms) resolved from node_modules so this
// works both in dev (vitest) and bundled (dist) — nothing is bundled in.
const GRAMMAR_DIR = join(dirname(require.resolve('tree-sitter-wasms/package.json')), 'out');

type Lang = 'typescript' | 'tsx' | 'javascript';

const GRAMMAR_FILE: Record<Lang, string> = {
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript.wasm',
};

function langForExt(ext: string): Lang | null {
  switch (ext.toLowerCase()) {
    case '.ts':
    case '.mts':
    case '.cts':
      return 'typescript';
    case '.tsx':
      return 'tsx';
    case '.js':
    case '.mjs':
    case '.cjs':
    case '.jsx':
      return 'javascript';
    default:
      return null; // non-JS/TS is out of scope (SPEC) → unresolved
  }
}

const NAMED_DECLARATIONS = new Set([
  'function_declaration',
  'generator_function_declaration',
  'class_declaration',
  'abstract_class_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'module',
  'internal_module',
]);
const CLASS_TYPES = new Set(['class_declaration', 'abstract_class_declaration']);
const MEMBER_TYPES = new Set([
  'method_definition',
  'public_field_definition',
  'abstract_method_signature',
]);

/** `export class X {}` parses as an export_statement wrapping the declaration. */
function unwrapExport(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
  if (node.type === 'export_statement') {
    return node.childForFieldName('declaration') ?? node.namedChildren.at(-1) ?? null;
  }
  return node;
}

function nameOf(node: Parser.SyntaxNode): string | undefined {
  return node.childForFieldName('name')?.text;
}

function findTopLevel(root: Parser.SyntaxNode, name: string): Parser.SyntaxNode | null {
  for (const child of root.namedChildren) {
    const decl = unwrapExport(child);
    if (!decl) continue;

    if (NAMED_DECLARATIONS.has(decl.type) && nameOf(decl) === name) {
      return decl;
    }
    // const / let / var → one or more variable_declarator(s)
    if (decl.type === 'lexical_declaration' || decl.type === 'variable_declaration') {
      for (const d of decl.namedChildren) {
        if (d.type === 'variable_declarator' && nameOf(d) === name) return d;
      }
    }
  }
  return null;
}

function findMember(
  root: Parser.SyntaxNode,
  className: string,
  memberName: string,
): Parser.SyntaxNode | null {
  let classNode: Parser.SyntaxNode | null = null;
  for (const child of root.namedChildren) {
    const decl = unwrapExport(child);
    if (decl && CLASS_TYPES.has(decl.type) && nameOf(decl) === className) {
      classNode = decl;
      break;
    }
  }
  const body = classNode?.childForFieldName('body');
  if (!body) return null;
  for (const member of body.namedChildren) {
    if (MEMBER_TYPES.has(member.type) && nameOf(member) === memberName) return member;
  }
  return null;
}

function findSymbol(root: Parser.SyntaxNode, qualified: string): Parser.SyntaxNode | null {
  const parts = qualified.split('.');
  if (parts.length === 1) return findTopLevel(root, parts[0] as string);
  if (parts.length === 2) return findMember(root, parts[0] as string, parts[1] as string);
  return null; // deeper nesting unsupported in v0.1
}

/** A tree-sitter node type → the friendly kind shown in the link picker. */
function friendlyKind(type: string): string {
  switch (type) {
    case 'function_declaration':
    case 'generator_function_declaration':
      return 'function';
    case 'class_declaration':
    case 'abstract_class_declaration':
      return 'class';
    case 'interface_declaration':
      return 'interface';
    case 'type_alias_declaration':
      return 'type';
    case 'enum_declaration':
      return 'enum';
    case 'module':
    case 'internal_module':
      return 'module';
    case 'method_definition':
    case 'abstract_method_signature':
      return 'method';
    case 'public_field_definition':
      return 'field';
    default:
      return 'symbol';
  }
}

/**
 * Every symbol a file exposes, mirroring exactly what {@link findSymbol} can
 * resolve: top-level declarations (function/class/interface/type/enum/module +
 * const/let/var), plus each class's members as `Class.member`. So every name
 * this returns is a valid pin target.
 */
function enumerate(root: Parser.SyntaxNode): SymbolDecl[] {
  const out: SymbolDecl[] = [];
  for (const child of root.namedChildren) {
    const decl = unwrapExport(child);
    if (!decl) continue;

    if (NAMED_DECLARATIONS.has(decl.type)) {
      const name = nameOf(decl);
      if (!name) continue;
      out.push({ name, kind: friendlyKind(decl.type) });
      if (CLASS_TYPES.has(decl.type)) {
        const body = decl.childForFieldName('body');
        for (const member of body?.namedChildren ?? []) {
          if (!MEMBER_TYPES.has(member.type)) continue;
          const memberName = nameOf(member);
          if (memberName)
            out.push({ name: `${name}.${memberName}`, kind: friendlyKind(member.type) });
        }
      }
    } else if (decl.type === 'lexical_declaration' || decl.type === 'variable_declaration') {
      for (const d of decl.namedChildren) {
        if (d.type !== 'variable_declarator') continue;
        const name = nameOf(d);
        if (name) out.push({ name, kind: 'const' });
      }
    }
  }
  return out;
}

interface ParsedFile {
  lines: string[];
  root: Parser.SyntaxNode;
}

/**
 * Create the built-in tree-sitter resolver rooted at `repoRoot`.
 *
 * Async because the WASM runtime + grammars must initialize once up front;
 * `resolve`/`hash` are then synchronous (parsing a file is sync, and parses
 * are cached per file for the life of the resolver).
 */
export async function createTreeSitterResolver(repoRoot: string): Promise<SymbolResolver> {
  await Parser.init();
  const parser = new Parser();
  const languages = new Map<Lang, Parser.Language>();
  for (const lang of Object.keys(GRAMMAR_FILE) as Lang[]) {
    languages.set(lang, await Parser.Language.load(join(GRAMMAR_DIR, GRAMMAR_FILE[lang])));
  }

  const cache = new Map<string, ParsedFile | null>();

  function parseFile(absPath: string, lang: Lang): ParsedFile | null {
    const cached = cache.get(absPath);
    if (cached !== undefined) return cached;

    if (!existsSync(absPath)) {
      cache.set(absPath, null);
      return null;
    }
    const source = readFileSync(absPath, 'utf8');
    parser.setLanguage(languages.get(lang) as Parser.Language);
    // Split on '\n' so indices line up with tree-sitter's row numbering; any
    // stray '\r' is dropped later by normalizeForHash.
    const parsed: ParsedFile = { lines: source.split('\n'), root: parser.parse(source).rootNode };
    cache.set(absPath, parsed);
    return parsed;
  }

  function spanText(lines: string[], startRow: number, endRow: number): string {
    return lines.slice(startRow, endRow + 1).join('\n');
  }

  function resolve(symbolRef: string): ResolvedSymbol | null {
    const hashIdx = symbolRef.indexOf('#');
    if (hashIdx <= 0) return null;
    const relPath = symbolRef.slice(0, hashIdx);
    const qualified = symbolRef.slice(hashIdx + 1);
    if (qualified.length === 0) return null;

    const lang = langForExt(extname(relPath));
    if (lang === null) return null;

    const absPath = join(repoRoot, relPath);
    const parsed = parseFile(absPath, lang);
    if (!parsed) return null;

    const node = findSymbol(parsed.root, qualified);
    if (!node) return null;

    const startRow = node.startPosition.row;
    const endRow = node.endPosition.row;
    const posixPath = relPath.split('\\').join('/');
    return {
      symbolRef,
      symbolId: `${posixPath}#${qualified}`,
      filePath: absPath,
      startLine: startRow + 1,
      endLine: endRow + 1,
      contentHash: contentHash(spanText(parsed.lines, startRow, endRow)),
    };
  }

  function hash(sym: ResolvedSymbol): string {
    if (!existsSync(sym.filePath)) return contentHash('');
    const lines = readFileSync(sym.filePath, 'utf8').split('\n');
    return contentHash(spanText(lines, sym.startLine - 1, sym.endLine - 1));
  }

  function list(relPath: string): SymbolDecl[] {
    const lang = langForExt(extname(relPath));
    if (lang === null) return [];
    const parsed = parseFile(join(repoRoot, relPath), lang);
    return parsed ? enumerate(parsed.root) : [];
  }

  return { resolve, hash, list };
}
