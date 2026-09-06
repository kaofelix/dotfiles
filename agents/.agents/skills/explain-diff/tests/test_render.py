import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "scripts" / "render.py"
spec = importlib.util.spec_from_file_location("explain_diff_renderer", MODULE_PATH)
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


def valid_spec():
    return {
        "title": "Reserve <visibility>",
        "subtitle": "Commit abc123",
        "slug": "reserve-visibility",
        "summary": {
            "answer": "Reserve usage appears only for Luna.",
            "points": ["Visibility is model-specific.", "The label becomes Luna."],
        },
        "sections": [
            {
                "id": "background",
                "heading": "Background",
                "html": "<p>The API returns a <code>gpt-reserve</code> window.</p>",
            },
            {
                "id": "intuition",
                "heading": "Intuition",
                "html": '<div class="callout"><strong>Think of it as a gate.</strong></div>',
            },
            {
                "id": "walkthrough",
                "heading": "Code walkthrough",
                "html": "<pre><code>return model.includes(&amp;quot;luna&amp;quot;)</code></pre>",
            },
        ],
        "quiz": [
            {
                "question": f"Question {index}?",
                "options": [
                    {
                        "text": f"Correct {index}",
                        "correct": True,
                        "feedback": "That follows the visibility rule.",
                    }
                ]
                + [
                    {
                        "text": f"Distractor {index}-{option}",
                        "correct": False,
                        "feedback": "That confuses filtering with formatting.",
                    }
                    for option in range(3)
                ],
            }
            for index in range(5)
        ],
    }


class RenderTests(unittest.TestCase):
    def test_renders_the_fixed_page_contract(self):
        output = renderer.render(valid_spec())

        self.assertIn("<title>Reserve &lt;visibility&gt;</title>", output)
        self.assertIn('href="#background"', output)
        self.assertIn('id="walkthrough"', output)
        self.assertIn("Content-Security-Policy", output)
        self.assertEqual(5, output.count('class="question"'))
        positions = renderer.correct_answer_positions(output)
        self.assertEqual({0, 1, 2, 3}, set(positions))
        self.assertEqual(2, max(positions.count(position) for position in set(positions)))
        self.assertNotIn("https://", output)
        self.assertNotIn("http://", output)

    def test_highlights_language_annotated_code_at_render_time(self):
        candidate = valid_spec()
        candidate["sections"][2]["html"] = (
            '<pre><code class="language-python">'
            "def answer(value):\n    return value + 1"
            "</code></pre>"
        )

        output = renderer.render(candidate)

        self.assertIn('<code class="language-python">', output)
        self.assertIn('<span class="k">def</span>', output)
        self.assertIn("Pygments", output)

    def test_rejects_unknown_code_languages(self):
        candidate = valid_spec()
        candidate["sections"][2]["html"] = (
            '<pre><code class="language-not-a-real-language">x</code></pre>'
        )

        with self.assertRaisesRegex(ValueError, "unknown syntax language"):
            renderer.render(candidate)

    def test_rejects_executable_or_networked_section_markup(self):
        unsafe_fragments = [
            '<script>alert("x")</script>',
            '<img src="https://example.com/tracker.png">',
            '<p onclick="alert(1)">click</p>',
            '<a href="file:///tmp/secret">secret</a>',
            '<div class="language-python">misplaced language</div>',
        ]

        for fragment in unsafe_fragments:
            with self.subTest(fragment=fragment):
                candidate = valid_spec()
                candidate["sections"][0]["html"] = fragment
                with self.assertRaisesRegex(ValueError, "section markup"):
                    renderer.render(candidate)

    def test_requires_the_explanation_and_quiz_shape(self):
        candidate = valid_spec()
        candidate["sections"] = candidate["sections"][:-1]
        with self.assertRaisesRegex(ValueError, "sections"):
            renderer.render(candidate)

        candidate = valid_spec()
        candidate["sections"] = list(reversed(candidate["sections"]))
        with self.assertRaisesRegex(ValueError, "section order"):
            renderer.render(candidate)

        candidate = valid_spec()
        candidate["quiz"] = candidate["quiz"][:-1]
        with self.assertRaisesRegex(ValueError, "five quiz"):
            renderer.render(candidate)

    def test_default_output_path_is_dated_and_global(self):
        path = renderer.default_output_path(valid_spec(), today="2026-09-02")
        self.assertEqual(Path("/tmp/2026-09-02-explanation-reserve-visibility.html"), path)

    def test_loads_yaml_with_multiline_section_html(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "lesson.yaml"
            path.write_text(
                "title: Reserve visibility\n"
                "slug: reserve-visibility\n"
                "summary:\n"
                "  answer: Reserve appears only for Luna.\n"
                "  points:\n"
                "    - Visibility is model-specific.\n"
                "    - Formatting changes only the label.\n"
                "sections:\n"
                "  - id: background\n"
                "    heading: Background\n"
                "    html: |\n"
                "      <p>First paragraph.</p>\n"
                "\n"
                "      <p>Second paragraph.</p>\n"
                "  - id: intuition\n"
                "    heading: Intuition\n"
                "    html: <p>A gate followed by a label.</p>\n"
                "  - id: walkthrough\n"
                "    heading: Code walkthrough\n"
                "    html: <p>The predicate runs first.</p>\n"
                "quiz:\n"
                + "\n".join(
                    f"  - question: Question {index}?\n"
                    "    options:\n"
                    "      - {text: Correct, correct: true, feedback: Right.}\n"
                    "      - {text: Wrong A, correct: false, feedback: Not A.}\n"
                    "      - {text: Wrong B, correct: false, feedback: Not B.}\n"
                    "      - {text: Wrong C, correct: false, feedback: Not C.}"
                    for index in range(5)
                )
                + "\n"
            )

            loaded = renderer.load_spec(path)

        self.assertEqual("Reserve visibility", loaded["title"])
        self.assertEqual(
            "<p>First paragraph.</p>\n\n<p>Second paragraph.</p>\n",
            loaded["sections"][0]["html"],
        )

    def test_keeps_json_input_compatible(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "lesson.json"
            path.write_text(json.dumps(valid_spec()))
            loaded = renderer.load_spec(path)

        self.assertEqual(valid_spec(), loaded)

    def test_reports_yaml_parse_location_without_a_traceback(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "broken.yaml"
            path.write_text("title: ok\nsections:\n  - broken: [\n")
            with self.assertRaisesRegex(
                ValueError,
                r"broken\.yaml:\d+:\d+: invalid YAML",
            ):
                renderer.load_spec(path)

            result = subprocess.run(
                [sys.executable, MODULE_PATH, path],
                capture_output=True,
                text=True,
            )

        self.assertNotEqual(0, result.returncode)
        self.assertIn("invalid YAML", result.stderr)
        self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
