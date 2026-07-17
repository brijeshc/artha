import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import Parser from 'web-tree-sitter';
import type { EnumLike, ResolvedSymbol, SymbolDecl, SymbolResolver } from './SymbolResolver';
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
    // `export class X {}` / `export const x` wrap the declaration; the members
    // inherit the module's public surface, so `exported` follows the wrapper.
    const exported = child.type === 'export_statement';

    if (NAMED_DECLARATIONS.has(decl.type)) {
      const name = nameOf(decl);
      if (!name) continue;
      out.push({ name, kind: friendlyKind(decl.type), exported });
      if (CLASS_TYPES.has(decl.type)) {
        const body = decl.childForFieldName('body');
        for (const member of body?.namedChildren ?? []) {
          if (!MEMBER_TYPES.has(member.type)) continue;
          const memberName = nameOf(member);
          if (memberName)
            out.push({
              name: `${name}.${memberName}`,
              kind: friendlyKind(member.type),
              exported,
            });
        }
      }
    } else if (decl.type === 'lexical_declaration' || decl.type === 'variable_declaration') {
      for (const d of decl.namedChildren) {
        if (d.type !== 'variable_declarator') continue;
        const name = nameOf(d);
        if (name) out.push({ name, kind: 'const', exported });
      }
    }
  }
  return out;
}

/**
 * The member names of a TS `enum` body (`enum X { A, B = 'b' }` → `[A, B]`),
 * covering both bare `property_identifier` members and `enum_assignment`s.
 */
function enumMembers(decl: Parser.SyntaxNode): string[] {
  const body =
    decl.childForFieldName('body') ??
    decl.namedChildren.find((c) => c.type === 'enum_body') ??
    null;
  if (!body) return [];
  const members: string[] = [];
  for (const m of body.namedChildren) {
    if (m.type === 'property_identifier') members.push(m.text);
    else if (m.type === 'enum_assignment') {
      const nameNode = m.childForFieldName('name') ?? m.namedChildren[0];
      if (nameNode) members.push(nameNode.text);
    }
  }
  return members;
}

/**
 * The string-literal members of a union type value, or `null` if it is not a
 * *pure* string-literal union (`'a' | 'b'`). Tree-sitter nests a 3+ member union
 * left-recursively (`union_type(union_type(a, b), c)`), so this flattens. A
 * `null`/`undefined` member is tolerated and skipped (common in status unions);
 * any other member (a type reference, `number`, a boolean literal) disqualifies
 * the whole union, so we never mislabel a general union as a state set.
 * Precision over recall - a wrong state machine is worse than a missing one.
 */
function stringUnionMembers(value: Parser.SyntaxNode): string[] | null {
  if (value.type !== 'union_type') return null;
  const members: string[] = [];
  let pure = true;

  const walk = (node: Parser.SyntaxNode): void => {
    for (const child of node.namedChildren) {
      if (!pure) return;
      if (child.type === 'union_type') {
        walk(child); // flatten the left-nested tail
        continue;
      }
      if (child.type === 'literal_type') {
        const lit = child.namedChildren[0];
        if (lit?.type === 'string') {
          const s = literalString(lit);
          if (s !== null && s !== '') {
            members.push(s);
            continue;
          }
        }
        // `'a' | null` parses the null as literal_type(null) - tolerate it.
        if (lit && (lit.type === 'null' || lit.text === 'undefined')) continue;
        pure = false; // a number/boolean literal → not a state set
        return;
      }
      // A bare `null`/`undefined` type, if the grammar surfaces it that way.
      if (
        child.type === 'null' ||
        (child.type === 'predefined_type' && child.text === 'undefined')
      ) {
        continue;
      }
      pure = false; // a type reference or anything else
      return;
    }
  };
  walk(value);

  if (!pure) return null;
  return members.length >= 2 ? members : null;
}

/**
 * Every string-literal union and TS enum a file declares (≥2 members) - the
 * deterministic seed for inferred state-machine candidates (21a). Mirrors
 * {@link findTopLevel}'s notion of a top-level declaration so each result's
 * `path#Name` is a valid pin target.
 */
function collectEnumLikes(root: Parser.SyntaxNode): EnumLike[] {
  const out: EnumLike[] = [];
  for (const child of root.namedChildren) {
    const decl = unwrapExport(child);
    if (!decl) continue;

    if (decl.type === 'enum_declaration') {
      const name = nameOf(decl);
      const members = enumMembers(decl);
      if (name && members.length >= 2) out.push({ name, kind: 'enum', members });
    } else if (decl.type === 'type_alias_declaration') {
      const name = nameOf(decl);
      const value = decl.childForFieldName('value');
      if (name && value) {
        const members = stringUnionMembers(value);
        if (members) out.push({ name, kind: 'union', members });
      }
    }
  }
  return out;
}

const COMPARISON_OPS = new Set(['===', '!==', '==', '!=']);

/**
 * Is this string-literal node a state *value* - assigned, compared, `case`d,
 * initialized, or returned - rather than incidental prose? The gate that keeps a
 * union member that happens to be a common word (`'active'`, `'open'`) from
 * pulling in unrelated code. Precision over recall.
 */
function isStateLiteralContext(lit: Parser.SyntaxNode): boolean {
  const p = lit.parent;
  if (!p) return false;
  // A string literal can never be an assignment target, a declarator/field name,
  // or a case selector's own operator, so a literal sitting *directly* under any
  // of these is the value - no need to match by node identity (web-tree-sitter
  // hands back a fresh wrapper on each access, so `=== lit` never holds anyway).
  switch (p.type) {
    case 'binary_expression': {
      const op = p.childForFieldName('operator')?.text;
      return op !== undefined && COMPARISON_OPS.has(op);
    }
    case 'assignment_expression':
    case 'public_field_definition':
    case 'variable_declarator':
    case 'switch_case':
    case 'return_statement':
      return true;
    default:
      return false;
  }
}

/**
 * The qualified name (`fn` / `Class.method`) of the top-level declaration that
 * encloses `node`, mirroring exactly what {@link findSymbol} can resolve, or
 * `null` when the usage sits somewhere unpinnable (a bare top-level statement, a
 * nested closure whose name does not resolve). So every returned ref is a valid pin.
 */
function enclosingQualifiedName(node: Parser.SyntaxNode): string | null {
  let top = node;
  while (top.parent && top.parent.type !== 'program') top = top.parent;
  const decl = unwrapExport(top);
  if (!decl) return null;

  if (CLASS_TYPES.has(decl.type)) {
    const className = nameOf(decl);
    if (!className) return null;
    for (let cur: Parser.SyntaxNode | null = node; cur && cur !== decl; cur = cur.parent) {
      if (MEMBER_TYPES.has(cur.type)) {
        const member = nameOf(cur);
        return member ? `${className}.${member}` : className;
      }
    }
    return className; // inside the class body but not a resolvable member (rare)
  }
  if (NAMED_DECLARATIONS.has(decl.type)) return nameOf(decl) ?? null;
  if (decl.type === 'lexical_declaration' || decl.type === 'variable_declaration') {
    for (let cur: Parser.SyntaxNode | null = node; cur && cur !== decl; cur = cur.parent) {
      if (cur.type === 'variable_declarator') return nameOf(cur) ?? null;
    }
  }
  return null;
}

/**
 * The declarations in a file that use a state (21b-2). For a union, a member
 * appears as a string literal in a value context (assign/compare/case/init/
 * return); for an enum, an `Enum.Member` access. Each is rolled up to its
 * enclosing resolvable declaration, deduped, in source order. The declaration's
 * own body is excluded by construction - its literals sit in `literal_type`, not
 * a value context.
 */
function collectMemberUsages(root: Parser.SyntaxNode, state: EnumLike): string[] {
  const members = new Set(state.members);
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (node: Parser.SyntaxNode): void => {
    const ref = enclosingQualifiedName(node);
    if (ref && !seen.has(ref)) {
      seen.add(ref);
      out.push(ref);
    }
  };
  const visit = (node: Parser.SyntaxNode): void => {
    if (state.kind === 'union' && node.type === 'string') {
      const s = literalString(node);
      if (s !== null && members.has(s) && isStateLiteralContext(node)) add(node);
    } else if (state.kind === 'enum' && node.type === 'member_expression') {
      const prop = node.childForFieldName('property');
      if (node.childForFieldName('object')?.text === state.name && prop && members.has(prop.text)) {
        add(node);
      }
    }
    for (const child of node.namedChildren) visit(child);
  };
  visit(root);
  return out;
}

/**
 * The literal value of a static string specifier (`'./x'`, `` `./x` ``), or
 * `null` for a computed one (a template with `${…}` substitutions can't be
 * resolved statically, so it's skipped rather than guessed at).
 */
function literalString(node: Parser.SyntaxNode): string | null {
  if (node.type === 'string') {
    const frag = node.namedChildren.find((c) => c.type === 'string_fragment');
    if (frag) return frag.text;
    // An empty string ('' / "") has no fragment child.
    return node.text.length >= 2 ? node.text.slice(1, -1) : '';
  }
  if (node.type === 'template_string') {
    if (node.namedChildren.some((c) => c.type === 'template_substitution')) return null;
    const frag = node.namedChildren.find((c) => c.type === 'string_fragment');
    return frag ? frag.text : '';
  }
  return null;
}

/** The specifier an `import …`/`export … from` statement targets, if static. */
function statementSource(node: Parser.SyntaxNode): string | null {
  const src = node.childForFieldName('source');
  if (src) return literalString(src);
  // Grammar-version fallback: the source is the sole trailing string child.
  const str = node.namedChildren.find((c) => c.type === 'string' || c.type === 'template_string');
  return str ? literalString(str) : null;
}

/** The specifier a `require(...)` / dynamic `import(...)` call targets, if static. */
function callSource(node: Parser.SyntaxNode): string | null {
  const fn = node.childForFieldName('function');
  if (!fn) return null;
  // `require(...)` is an identifier callee; dynamic `import(...)` is an `import` node.
  if (!(fn.type === 'import' || (fn.type === 'identifier' && fn.text === 'require'))) return null;
  const args = node.childForFieldName('arguments');
  const first = args?.namedChildren[0];
  return first ? literalString(first) : null;
}

/**
 * Every module specifier a file declares, in source order. Walks the whole tree
 * (require/dynamic-import can appear anywhere, not just at the top level) and
 * collects static string targets of import/export-from statements and
 * require/import() calls. Duplicates are kept - counts feed the graph's edge
 * weights.
 */
function collectImports(root: Parser.SyntaxNode): string[] {
  const out: string[] = [];
  const visit = (node: Parser.SyntaxNode): void => {
    if (node.type === 'import_statement' || node.type === 'export_statement') {
      const spec = statementSource(node);
      if (spec !== null) out.push(spec);
    } else if (node.type === 'call_expression') {
      const spec = callSource(node);
      if (spec !== null) out.push(spec);
    }
    for (const child of node.namedChildren) visit(child);
  };
  visit(root);
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

  function imports(relPath: string): string[] {
    const lang = langForExt(extname(relPath));
    if (lang === null) return [];
    const parsed = parseFile(join(repoRoot, relPath), lang);
    return parsed ? collectImports(parsed.root) : [];
  }

  function enumLikes(relPath: string): EnumLike[] {
    const lang = langForExt(extname(relPath));
    if (lang === null) return [];
    const parsed = parseFile(join(repoRoot, relPath), lang);
    return parsed ? collectEnumLikes(parsed.root) : [];
  }

  function memberUsages(relPath: string, state: EnumLike): string[] {
    const lang = langForExt(extname(relPath));
    if (lang === null) return [];
    const parsed = parseFile(join(repoRoot, relPath), lang);
    return parsed ? collectMemberUsages(parsed.root, state) : [];
  }

  return { resolve, hash, list, enumLikes, imports, memberUsages };
}
