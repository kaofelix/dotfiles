#!/usr/bin/env python3
"""Render an explain-diff YAML spec as a dated, self-contained HTML page.

The preferred spec shape is:

  title: The answer-first title
  subtitle: Optional comparison metadata
  slug: short-filename-slug
  summary:
    answer: "The governing thought: what changed and why it matters."
    points:
      - Key support 1
      - Key support 2
  sections:
    - id: background
      heading: Background
      html: |
        <p>Use a YAML block scalar for multiline HTML.</p>
    - id: intuition
      heading: Intuition
      html: |
        <p>...</p>
    - id: walkthrough
      heading: Code walkthrough
      html: |
        <p>...</p>
    - id: glossary
      heading: Glossary
      html: |
        <p>Optional.</p>
  quiz:
    - question: Question text
      options:
        - text: Correct option
          correct: true
          feedback: Why it is correct.
        - text: Plausible distractor
          correct: false
          feedback: Why it is incorrect.

Provide exactly five quiz questions with four options and one correct option each.
Section HTML is restricted to semantic content tags. Useful classes are: grid, card,
before, after, callout, invariant, flow, node, step, terminal, dim, accent,
bar, table-wrap, and path. Highlighted code blocks use
<pre><code class="language-python">...</code></pre>; use the relevant Pygments
language or alias. Unannotated code blocks remain plain. JSON remains accepted for
compatibility, but YAML block scalars are safer for long HTML.

Usage:
    python render.py SPEC.yaml
    python render.py SPEC.yaml --output /tmp/custom.html
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import random
import re
from typing import Any

import yaml
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name
from pygments.util import ClassNotFound


REQUIRED_SECTIONS = ("background", "intuition", "walkthrough")
ALLOWED_SECTION_IDS = {*REQUIRED_SECTIONS, "glossary"}
ALLOWED_TAGS = {
    "p", "h3", "h4", "ul", "ol", "li", "strong", "em", "code", "pre",
    "div", "span", "figure", "figcaption", "table", "thead", "tbody",
    "tr", "th", "td", "details", "summary", "br",
}
ALLOWED_CLASSES = {
    "grid", "card", "before", "after", "callout", "invariant", "flow",
    "node", "step", "terminal", "dim", "accent", "bar", "table-wrap", "path",
}
ALLOWED_ATTRIBUTES = {"class", "role", "aria-label", "open"}
LANGUAGE_CLASS = re.compile(r"language-([a-z0-9][a-z0-9_+-]*)$")
CODE_BLOCK = re.compile(
    r'(<pre><code class="language-([a-z0-9][a-z0-9_+-]*)">)(.*?)(</code></pre>)',
    flags=re.I | re.S,
)


CSS = r"""
:root { color-scheme: light dark; --bg:#f7f7f4; --panel:#fff; --text:#202124; --muted:#62676f; --line:#d9dce1; --accent:#315f8c; --good:#287a47; --bad:#a53a3a; --code:#171a1f; --code-text:#edf1f7; }
@media (prefers-color-scheme:dark) { :root { --bg:#111419; --panel:#1a1f26; --text:#edf1f7; --muted:#aeb7c4; --line:#37414e; --accent:#79b8ed; --good:#8bd49c; --bad:#ff9b9b; --code:#090b0e; --code-text:#edf1f7; } }
* { box-sizing:border-box; }
html { scroll-behavior:smooth; }
body { margin:0; background:var(--bg); color:var(--text); font:17px/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
.shell { width:min(900px,calc(100% - 32px)); margin:auto; }
header { padding:56px 0 34px; border-bottom:1px solid var(--line); }
h1 { margin:.25rem 0 .75rem; font-size:clamp(2rem,6vw,3.7rem); line-height:1.08; letter-spacing:-.03em; }
.subtitle,.path,figcaption { color:var(--muted); }
.answer { font-size:1.2rem; max-width:760px; }
.key-points { display:grid; gap:8px; padding-left:1.3rem; }
nav { position:sticky; top:0; z-index:2; background:var(--bg); border-bottom:1px solid var(--line); }
nav ol { display:flex; gap:18px; overflow-x:auto; margin:0; padding:12px 0; list-style:none; }
nav a { color:var(--accent); white-space:nowrap; }
main { padding-bottom:64px; }
section { padding:42px 0; border-bottom:1px solid var(--line); scroll-margin-top:58px; }
h2 { margin-top:0; font-size:clamp(1.55rem,4vw,2.2rem); }
h3 { margin-top:1.8rem; }
code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
p code,li code,td code { padding:.08em .3em; border-radius:4px; background:color-mix(in srgb,var(--panel) 70%,var(--line)); }
pre { overflow-x:auto; white-space:pre-wrap; padding:16px; border-radius:8px; background:var(--code); color:var(--code-text); }
pre code { background:none; padding:0; }
.grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
.card,.question,.node { min-width:0; padding:18px; border:1px solid var(--line); border-radius:8px; background:var(--panel); }
.before { border-top:4px solid var(--bad); }
.after { border-top:4px solid var(--good); }
.callout { margin:20px 0; padding:16px 18px; border-left:4px solid var(--accent); background:var(--panel); }
.invariant { border-left-color:var(--good); }
.flow { display:flex; align-items:stretch; gap:12px; overflow-x:auto; margin:22px 0; }
.flow .node { flex:1 0 150px; }
.step { display:inline-grid; place-items:center; width:28px; height:28px; border-radius:50%; background:var(--accent); color:var(--bg); font-weight:700; }
.terminal { overflow-x:auto; white-space:pre; padding:14px; border-radius:8px; background:var(--code); color:var(--code-text); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
.accent { color:var(--accent); } .dim { color:var(--muted); } .bar { color:var(--good); }
.table-wrap { overflow-x:auto; }
table { width:100%; border-collapse:collapse; }
th,td { padding:10px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
.quiz-list { display:grid; gap:16px; }
.options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
button { min-height:48px; padding:10px 12px; border:1px solid var(--line); border-radius:7px; background:var(--panel); color:var(--text); font:inherit; text-align:left; cursor:pointer; }
a:focus-visible,button:focus-visible { outline:3px solid var(--accent); outline-offset:3px; }
button.correct { border-color:var(--good); } button.incorrect { border-color:var(--bad); }
.feedback { min-height:1.8em; color:var(--muted); }
.feedback .correct { color:var(--good); } .feedback .incorrect { color:var(--bad); }
footer { padding:24px 0 48px; color:var(--muted); }
@media (max-width:650px) { .shell { width:min(100% - 22px,900px); } .grid,.options { grid-template-columns:1fr; } .flow { flex-direction:column; } section { padding:34px 0; } }
@media (prefers-reduced-motion:reduce) { html { scroll-behavior:auto; } }
"""

SYNTAX_CSS = "/* Syntax highlighting generated by Pygments. */\n" + HtmlFormatter(
    style="github-dark",
    nowrap=True,
).get_style_defs("pre code")

JS = r"""
(() => {
  document.querySelectorAll('.question').forEach(question => {
    const feedback = question.querySelector('.feedback');
    question.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => {
        question.querySelectorAll('button').forEach(candidate => {
          candidate.classList.remove('correct', 'incorrect');
          candidate.setAttribute('aria-pressed', 'false');
        });
        const correct = button.dataset.correct === 'true';
        button.classList.add(correct ? 'correct' : 'incorrect');
        button.setAttribute('aria-pressed', 'true');
        const label = document.createElement('strong');
        label.className = correct ? 'correct' : 'incorrect';
        label.textContent = correct ? 'Correct.' : 'Incorrect.';
        feedback.replaceChildren(label, document.createTextNode(' ' + button.dataset.feedback));
      });
    });
  });
})();
"""


class SectionMarkupValidator(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.errors: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag not in ALLOWED_TAGS:
            self.errors.append(f"tag <{tag}> is not allowed")
        for name, value in attrs:
            if name not in ALLOWED_ATTRIBUTES:
                self.errors.append(f"attribute {name!r} is not allowed")
            if name == "class" and value:
                classes = set(value.split())
                language_classes = {item for item in classes if LANGUAGE_CLASS.fullmatch(item)}
                if language_classes and tag != "code":
                    self.errors.append("language-* classes are allowed only on <code>")
                unknown = classes - language_classes - ALLOWED_CLASSES
                if unknown:
                    self.errors.append(f"classes {sorted(unknown)!r} are not allowed")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)


class SpecError(ValueError):
    pass


def _required_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SpecError(f"{label} must be a non-empty string")
    return value.strip()


def validate_section_markup(fragment: str) -> None:
    parser = SectionMarkupValidator()
    try:
        parser.feed(fragment)
        parser.close()
    except Exception as exc:
        raise SpecError(f"invalid section markup: {exc}") from exc
    if parser.errors:
        raise SpecError("invalid section markup: " + "; ".join(parser.errors))
    for match in re.finditer(r"<pre(?:\s[^>]*)?>(.*?)</pre>", fragment, flags=re.I | re.S):
        if not re.match(r"\s*<code(?:\s[^>]*)?>", match.group(1), flags=re.I):
            raise SpecError("invalid section markup: every <pre> must contain <code>")


def highlight_section_markup(fragment: str) -> str:
    def replace(match: re.Match[str]) -> str:
        language = match.group(2).lower()
        try:
            lexer = get_lexer_by_name(language, stripall=False)
        except ClassNotFound as exc:
            raise SpecError(f"unknown syntax language: {language}") from exc
        source = html.unescape(match.group(3))
        formatter = HtmlFormatter(style="github-dark", nowrap=True)
        highlighted = highlight(source, lexer, formatter).rstrip("\n")
        return f"{match.group(1)}{highlighted}{match.group(4)}"

    return CODE_BLOCK.sub(replace, fragment)


def _validate_spec(spec: dict[str, Any]) -> None:
    _required_string(spec.get("title"), "title")
    summary = spec.get("summary")
    if not isinstance(summary, dict):
        raise SpecError("summary must be an object")
    _required_string(summary.get("answer"), "summary.answer")
    points = summary.get("points")
    if not isinstance(points, list) or not 2 <= len(points) <= 4:
        raise SpecError("summary.points must contain two to four supporting points")
    for index, point in enumerate(points):
        _required_string(point, f"summary.points[{index}]")

    sections = spec.get("sections")
    if not isinstance(sections, list):
        raise SpecError("sections must be a list")
    ids = [section.get("id") for section in sections if isinstance(section, dict)]
    if len(ids) != len(sections) or len(set(ids)) != len(ids):
        raise SpecError("sections must have unique IDs")
    if not set(REQUIRED_SECTIONS).issubset(ids) or set(ids) - ALLOWED_SECTION_IDS:
        raise SpecError(f"sections must include {list(REQUIRED_SECTIONS)} and only optional glossary")
    expected_order = list(REQUIRED_SECTIONS) + (["glossary"] if "glossary" in ids else [])
    if ids != expected_order:
        raise SpecError(f"section order must be {expected_order}")
    for index, section in enumerate(sections):
        _required_string(section.get("heading"), f"sections[{index}].heading")
        fragment = _required_string(section.get("html"), f"sections[{index}].html")
        validate_section_markup(fragment)

    quiz = spec.get("quiz")
    if not isinstance(quiz, list) or len(quiz) != 5:
        raise SpecError("provide exactly five quiz questions")
    for q_index, question in enumerate(quiz):
        if not isinstance(question, dict):
            raise SpecError(f"quiz[{q_index}] must be an object")
        _required_string(question.get("question"), f"quiz[{q_index}].question")
        options = question.get("options")
        if not isinstance(options, list) or len(options) != 4:
            raise SpecError(f"quiz[{q_index}] must have four options")
        correct = 0
        for o_index, option in enumerate(options):
            if not isinstance(option, dict) or not isinstance(option.get("correct"), bool):
                raise SpecError(f"quiz[{q_index}].options[{o_index}].correct must be boolean")
            _required_string(option.get("text"), f"quiz[{q_index}].options[{o_index}].text")
            _required_string(option.get("feedback"), f"quiz[{q_index}].options[{o_index}].feedback")
            correct += option["correct"]
        if correct != 1:
            raise SpecError(f"quiz[{q_index}] must have exactly one correct option")


def _answer_positions(spec: dict[str, Any]) -> list[int]:
    seed = int(hashlib.sha256(spec["slug"].encode()).hexdigest()[:16], 16)
    rng = random.Random(seed)
    positions = [0, 1, 2, 3]
    rng.shuffle(positions)
    return positions + [positions[0]]


def _ordered_options(spec: dict[str, Any], question_index: int, target: int) -> list[dict[str, Any]]:
    options = spec["quiz"][question_index]["options"]
    correct = next(option for option in options if option["correct"])
    distractors = [option for option in options if not option["correct"]]
    seed_text = f'{spec["slug"]}:{question_index}'
    rng = random.Random(int(hashlib.sha256(seed_text.encode()).hexdigest()[:16], 16))
    rng.shuffle(distractors)
    distractors.insert(target, correct)
    return distractors


def render(spec: dict[str, Any]) -> str:
    _validate_spec(spec)
    title = _required_string(spec["title"], "title")
    subtitle = str(spec.get("subtitle", "")).strip()
    summary = spec["summary"]

    toc = [('<li><a href="#summary">Summary</a></li>')]
    toc.extend(
        f'<li><a href="#{html.escape(section["id"], quote=True)}">{html.escape(section["heading"])}</a></li>'
        for section in spec["sections"]
    )
    toc.append('<li><a href="#quiz">Quiz</a></li>')

    points = "\n".join(f"<li>{html.escape(point)}</li>" for point in summary["points"])
    sections = "\n".join(
        f'<section id="{html.escape(section["id"], quote=True)}"><h2>{html.escape(section["heading"])}</h2>{highlight_section_markup(section["html"])}</section>'
        for section in spec["sections"]
    )

    positions = _answer_positions(spec)
    questions: list[str] = []
    for index, question in enumerate(spec["quiz"]):
        buttons = []
        for option in _ordered_options(spec, index, positions[index]):
            buttons.append(
                '<button type="button" aria-pressed="false" '
                f'data-correct="{str(option["correct"]).lower()}" '
                f'data-feedback="{html.escape(option["feedback"], quote=True)}">'
                f'{html.escape(option["text"])}</button>'
            )
        questions.append(
            f'<article class="question"><h3>{index + 1}. {html.escape(question["question"])}</h3>'
            f'<div class="options">{"".join(buttons)}</div>'
            '<p class="feedback" aria-live="polite"></p></article>'
        )

    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">
<title>{html.escape(title)}</title>
<style>{CSS}\n{SYNTAX_CSS}</style>
</head>
<body>
<header id="summary"><div class="shell"><h1>{html.escape(title)}</h1>{f'<p class="subtitle">{html.escape(subtitle)}</p>' if subtitle else ''}<p class="answer">{html.escape(summary["answer"])}</p><ul class="key-points">{points}</ul></div></header>
<nav aria-label="Table of contents"><ol class="shell">{"".join(toc)}</ol></nav>
<main class="shell">
{sections}
<section id="quiz"><h2>Quiz</h2><div class="quiz-list">{"".join(questions)}</div></section>
</main>
<footer class="shell">Self-contained explanation · no external dependencies</footer>
<script>{JS}</script>
</body>
</html>
'''


def correct_answer_positions(document: str) -> list[int]:
    positions: list[int] = []
    for block in re.findall(r'<article class="question">(.*?)</article>', document, flags=re.S):
        values = re.findall(r'data-correct="(true|false)"', block)
        positions.append(values.index("true"))
    return positions


def default_output_path(spec: dict[str, Any], today: str | None = None) -> Path:
    date = today or dt.date.today().isoformat()
    slug = _required_string(spec.get("slug"), "slug")
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise SpecError("slug must contain lowercase letters, numbers, and single hyphens")
    return Path(f"/tmp/{date}-explanation-{slug}.html")


def load_spec(path: Path) -> dict[str, Any]:
    try:
        source = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise SpecError(f"cannot read {path}: {exc}") from exc

    suffix = path.suffix.lower()
    try:
        if suffix in {".yaml", ".yml"}:
            loaded = yaml.safe_load(source)
        elif suffix == ".json":
            loaded = json.loads(source)
        else:
            raise SpecError("spec file must end in .yaml, .yml, or .json")
    except yaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        location = f":{mark.line + 1}:{mark.column + 1}" if mark else ""
        raise SpecError(f"{path.name}{location}: invalid YAML: {exc.problem}") from exc
    except json.JSONDecodeError as exc:
        raise SpecError(
            f"{path.name}:{exc.lineno}:{exc.colno}: invalid JSON: {exc.msg}"
        ) from exc

    if not isinstance(loaded, dict):
        raise SpecError(f"{path.name}: spec root must be a mapping")
    return loaded


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("spec", type=Path, help="YAML content specification")
    parser.add_argument("-o", "--output", type=Path, help="output HTML path")
    args = parser.parse_args()

    try:
        spec = load_spec(args.spec)
        output = args.output or default_output_path(spec)
        output.write_text(render(spec), encoding="utf-8")
    except (SpecError, OSError) as exc:
        parser.error(str(exc))
    print(output.absolute())


if __name__ == "__main__":
    main()
