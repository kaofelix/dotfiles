// Syntax highlighting through Prism (vendor/prism.js, built by scripts/vendor-prism.mjs): a
// file's language from its name, and each line's tokens in the kinds the panel colors.
// Pure: no Herdr imports, tested with node.
import Prism from "./vendor/prism.js";

// File extension -> Prism language.
const EXTENSIONS = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx",
  ts: "typescript", mts: "typescript", cts: "typescript", tsx: "tsx",
  rs: "rust", go: "go", zig: "zig", proto: "protobuf", dart: "dart", php: "php",
  c: "c", h: "c", cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp", m: "c", mm: "cpp",
  cs: "csharp", java: "java", kt: "kotlin", kts: "kotlin", swift: "swift", scala: "scala",
  py: "python", pyi: "python", rb: "ruby", rake: "ruby", gemspec: "ruby", pl: "perl", pm: "perl", r: "r",
  sh: "bash", bash: "bash", zsh: "bash", fish: "bash", env: "bash", ps1: "powershell",
  el: "elisp", lisp: "lisp", lsp: "lisp", cl: "lisp", asd: "lisp",
  clj: "clojure", cljs: "clojure", cljc: "clojure", edn: "clojure",
  scm: "scheme", ss: "scheme", rkt: "scheme", fnl: "clojure",
  hs: "haskell", ex: "elixir", exs: "elixir", erl: "erlang", hrl: "erlang", ml: "ocaml", mli: "ocaml",
  lua: "lua", nix: "nix", tf: "hcl", hcl: "hcl", graphql: "graphql", gql: "graphql",
  yml: "yaml", yaml: "yaml", toml: "toml", ini: "ini", cfg: "ini", conf: "ini", properties: "ini",
  json: "json", jsonc: "json5", json5: "json5", webmanifest: "json",
  css: "css", scss: "scss", less: "less", sql: "sql",
  html: "markup", htm: "markup", xml: "markup", svg: "markup", plist: "markup", vue: "markup", svelte: "markup",
  md: "markdown", mdx: "markdown", markdown: "markdown", diff: "diff", patch: "diff",
};
// Whole file names, for files without a telling extension.
const NAMES = {
  Dockerfile: "docker", Containerfile: "docker", Makefile: "makefile", GNUmakefile: "makefile", Justfile: "makefile",
  Gemfile: "ruby", Rakefile: "ruby", Brewfile: "ruby", ".emacs": "elisp", Cask: "elisp", Eask: "elisp",
  ".gitignore": "bash", ".env": "bash", ".zshrc": "bash", ".bashrc": "bash", ".profile": "bash",
};

export function languageOf(path) {
  const name = path.split("/").pop();
  // chezmoi source names: dot_zshrc.tmpl reads as .zshrc.
  const plain = name.replace(/\.tmpl$/, "").replace(/^dot_/, ".").replace(/^(?:private_|executable_|readonly_|literal_)+/, "");
  const ext = plain.includes(".") ? plain.split(".").pop().toLowerCase() : "";
  const id = NAMES[plain] ?? EXTENSIONS[ext];
  const grammar = id ? Prism.languages[id] : null;
  return grammar ? { id, grammar } : null;
}

// Prism token types (and aliases) -> the kinds the panel colors: "comment", "string",
// "number", "keyword", "constant", "type", "function", "property", "punctuation".
const KINDS = {
  comment: "comment", prolog: "comment", doctype: "comment", cdata: "comment", shebang: "comment", heading: "comment",
  string: "string", char: "string", "template-string": "string", regex: "string", "attr-value": "string",
  url: "string", code: "string", "code-snippet": "string", "string-property": "property",
  number: "number",
  boolean: "constant", constant: "constant", symbol: "constant", null: "constant", nil: "constant", entity: "constant",
  keyword: "keyword", important: "keyword", atrule: "keyword", rule: "keyword", tag: "keyword", selector: "keyword",
  directive: "keyword", title: "keyword", defun: null,
  function: "function", "function-name": "function", "function-definition": "function", macro: "function",
  car: "function", decorator: "function", annotation: "function",
  "class-name": "type", builtin: "type", type: "type", "type-definition": "type", bold: "type",
  property: "property", "attr-name": "property", key: "property", attribute: "property",
  punctuation: "punctuation", operator: "punctuation", list: "punctuation",
  // Code inside a string goes back to plain, then its own tokens.
  interpolation: null,
};

function kindOf(token, outer) {
  for (const name of [token.type, ...[token.alias ?? []].flat()]) {
    if (name in KINDS) return KINDS[name];
  }
  return outer;
}

// Tokens for each of `lines`, as [{ text, kind }], reading them as one run of text so a
// comment or string opened on one line carries on. kind: null (plain) or one of KINDS.
export function highlight(lang, lines) {
  if (!lang) return lines.map((text) => [{ text, kind: null }]);
  const out = [[]];
  const push = (text, kind) => {
    text.split("\n").forEach((part, i) => {
      if (i) out.push([]);
      if (!part) return;
      const line = out.at(-1), last = line.at(-1);
      if (last && last.kind === kind) last.text += part;
      else line.push({ text: part, kind });
    });
  };
  const walk = (stream, kind) => {
    for (const t of stream) {
      if (typeof t === "string") push(t, kind);
      else walk(Array.isArray(t.content) ? t.content : [t.content], kindOf(t, kind));
    }
  };
  walk(Prism.tokenize(lines.join("\n"), lang.grammar), null);
  while (out.length < lines.length) out.push([]);
  return out;
}
