"""Exercise installed skill entrypoints against synthetic logs, never live history."""

import csv
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ClaudeSessionsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix="claude-duckdb-")
        cls.addClassCleanup(cls.tmp.cleanup)
        cls.base = Path(cls.tmp.name).resolve()
        cls.home = cls.base / "home with spaces"
        cls.home.mkdir()
        config = cls.base / "config.toml"
        config.write_text("")
        cls.chezmoi = [
            "chezmoi", f"--source={ROOT}", f"--destination={cls.home}",
            f"--config={config}", f"--cache={cls.base / 'cache'}",
            f"--persistent-state={cls.base / 'state.boltdb'}", "--exclude=externals",
        ]
        cls.skill = cls.home / ".agents/skills/claude-sessions-duckdb"
        cls.skill.parent.mkdir(parents=True)
        rendered = subprocess.run([*cls.chezmoi, "apply", str(cls.skill)],
                                  capture_output=True, text=True)
        if rendered.returncode:
            raise RuntimeError(rendered.stderr)
        cls.scripts = cls.skill / "scripts"

    def setUp(self):
        self.case = Path(tempfile.mkdtemp(dir=self.base))
        self.log = self.case / "projects/test/main.jsonl"
        self.log.parent.mkdir(parents=True)
        self.env = {**os.environ, "HOME": str(self.home),
                    "CLAUDE_SESSION_GLOB": str(self.log)}

    def write_log(self, events, path=None):
        path = path or self.log
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("".join(json.dumps(e) + "\n" for e in events))

    def event(self, id, role, content, **extra):
        return {
            "type": role, "uuid": id, "parentUuid": None,
            "timestamp": "2026-01-01T00:00:00Z", "sessionId": "main",
            "cwd": "/example", "message": {"role": role, "content": content},
            **extra,
        }

    def run_script(self, name, *args, sql=None):
        return subprocess.run([str(self.scripts / name), *args], input=sql,
                              env=self.env, text=True, capture_output=True, timeout=30)

    def query(self, sql):
        result = self.run_script("query.sh", "-json", "-c", sql)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_compact_transcript_omits_context_tools_and_thinking(self):
        self.write_log([
            self.event("u1", "user", "Please inspect this."),
            self.event("m1", "user", "Skill definition", isMeta=True),
            self.event("a1", "assistant", [
                {"type": "thinking", "thinking": "private"},
                {"type": "text", "text": "Checking"},
                {"type": "tool_use", "id": "t1", "name": "Read", "input": {}},
                {"type": "text", "text": "now"},
            ]),
            self.event("r1", "user", [
                {"type": "tool_result", "tool_use_id": "t1", "content": "output"},
            ]),
            self.event("c1", "user", "Compacted history", isCompactSummary=True),
            # Append order, not timestamps or UUID sorting, preserves this reply.
            self.event("a0", "assistant", [{"type": "text", "text": "Done"}],
                       timestamp="2025-12-31T23:59:59Z"),
        ])
        result = self.run_script("conversation-text.sh", str(self.log))
        self.assertEqual(result.returncode, 0, result.stderr)
        rows = list(csv.DictReader(io.StringIO(result.stdout)))
        self.assertEqual([(r["event_id"], r["text"]) for r in rows], [
            ("u1", "Please inspect this."), ("a1", "Checking\nnow"), ("a0", "Done"),
        ])
        full = self.run_script("conversation-text.sh", "--include-context", str(self.log))
        self.assertEqual(full.returncode, 0, full.stderr)
        self.assertEqual(len(list(csv.DictReader(io.StringIO(full.stdout)))), 5)

    def test_tools_are_joined_within_a_file_and_preserve_structured_results(self):
        def call(id):
            return self.event(id, "assistant", [
                {"type": "tool_use", "id": "shared", "name": "Read",
                 "input": {"path": "/example"}},
                {"type": "tool_use", "id": "pending", "name": "Bash", "input": {}},
            ])

        self.write_log([
            call("a1"),
            self.event("r1", "user", [
                {"type": "tool_result", "tool_use_id": "shared", "is_error": True,
                 "content": [{"type": "text", "text": "Missing file"},
                             {"type": "image", "source": {"data": "synthetic"}},
                             {"type": "text", "text": "Try another path"}]},
            ]),
        ])
        child = self.log.with_suffix("") / "subagents/agent-worker.jsonl"
        self.write_log([
            call("child-call"),
            self.event("child-result", "user", [
                {"type": "tool_result", "tool_use_id": "shared", "content": "child output"},
            ], isSidechain=True, agentId="worker"),
        ], child)
        self.env["CLAUDE_SESSION_GLOB"] = str(self.log.parent / "**/*.jsonl")
        rows = self.query("""
            SELECT filename, tool_call_id, tool_arguments_text, is_error, result_text,
                   json_type(result_content) AS result_type
            FROM claude_tool_executions ORDER BY filename, tool_call_id
        """)
        self.assertEqual(len(rows), 4)
        main = [r for r in rows if r["filename"] == str(self.log)]
        self.assertEqual(main[0]["tool_call_id"], "pending")
        self.assertIsNone(main[0]["result_text"])
        self.assertEqual(main[1]["result_text"], "Missing file\nTry another path")
        self.assertTrue(main[1]["is_error"])
        self.assertEqual(main[1]["result_type"], "ARRAY")
        self.assertEqual(json.loads(main[1]["tool_arguments_text"]), {"path": "/example"})
        sub = [r for r in rows if r["filename"] == str(child)]
        self.assertEqual(sub[1]["result_text"], "child output")
        streams = self.query("SELECT session_id, agent_id FROM claude_sessions ORDER BY filename")
        self.assertEqual(streams, [{"session_id": "main", "agent_id": None},
                                   {"session_id": "main", "agent_id": "worker"}])

    def test_usage_counts_latest_record_per_response_not_each_content_block(self):
        def response(event_id, message_id, output):
            e = self.event(event_id, "assistant", [{"type": "text", "text": "ok"}])
            e["message"].update(id=message_id, model="example-model", usage={
                "input_tokens": 5, "cache_read_input_tokens": 10,
                "cache_creation_input_tokens": 2, "output_tokens": output,
            })
            return e

        self.write_log([
            response("a1", "response-1", 1), response("a2", "response-1", 20),
            response("a3", "response-2", 3),
            # Missing message IDs must not collapse distinct responses.
            response("a4", None, 4), response("a5", None, 5),
        ])
        child = self.log.with_suffix("") / "subagents/agent-worker.jsonl"
        self.write_log([response("c1", "response-1", 7)], child)
        self.env["CLAUDE_SESSION_GLOB"] = str(self.log.parent / "**/*.jsonl")
        self.assertEqual(self.query("""
            SELECT count(*) AS responses, sum(output_tokens)::BIGINT AS output,
                   sum(input_tokens)::BIGINT AS input,
                   sum(cache_read_input_tokens)::BIGINT AS cached
            FROM claude_token_usage
        """), [{"responses": 5, "output": 39, "input": 25, "cached": 50}])

    def test_unknown_events_and_nontext_blocks_remain_available_for_profiling(self):
        self.write_log([
            {"type": "new-event", "payload": {"future": [1, 2]}},
            self.event("u1", "user", [{"type": "image", "source": {"data": "fake"}}]),
            {"type": "assistant", "uuid": "empty", "message": {"role": "assistant"}},
        ])
        self.assertEqual(self.query("SELECT count(*) AS n FROM claude_events"), [{"n": 3}])
        self.assertEqual(self.query("SELECT count(*) AS n FROM claude_conversation"), [{"n": 0}])
        self.assertEqual(self.query("SELECT content_type FROM claude_content"),
                         [{"content_type": "image"}])

    def test_corrupt_input_fails_instead_of_silently_losing_rows(self):
        self.log.write_text('{"type":"user"}\n{"type":\n')
        result = self.run_script("query.sh", "-c", "SELECT count(*) FROM claude_events")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Malformed JSON", result.stderr)

    def test_help_path_validation_and_installed_attributes(self):
        for name in ["query.sh", "conversation-text.sh"]:
            self.assertTrue(os.access(self.scripts / name, os.X_OK))
            help_result = self.run_script(name, "--help")
            self.assertEqual(help_result.returncode, 0, help_result.stderr)
            self.assertIn("Usage:", help_result.stdout)
        self.assertEqual(self.run_script("conversation-text.sh").returncode, 2)
        self.assertEqual(self.run_script("conversation-text.sh", "relative.jsonl").returncode, 2)
        self.assertEqual(self.run_script("conversation-text.sh", str(self.log)).returncode, 1)
        special = self.case / "session[1].jsonl"
        special.write_text('{}\n')
        self.assertEqual(self.run_script("conversation-text.sh", str(special)).returncode, 2)
        verified = subprocess.run([*self.chezmoi, "verify", str(self.skill)],
                                  text=True, capture_output=True)
        self.assertEqual(verified.returncode, 0, verified.stderr)

    def test_default_scope_uses_isolated_home_and_subagent_filename_fallbacks(self):
        main = self.home / ".claude/projects/default/parent.jsonl"
        child = main.with_suffix("") / "subagents/agent-child.jsonl"
        self.write_log([{"type": "future-event"}], main)
        self.write_log([{"type": "future-event"}], child)
        self.env.pop("CLAUDE_SESSION_GLOB")
        self.assertEqual(self.query("""
            SELECT session_id, agent_id FROM claude_sessions ORDER BY filename
        """), [{"session_id": "parent", "agent_id": None},
               {"session_id": "parent", "agent_id": "child"}])


if __name__ == "__main__":
    unittest.main()
