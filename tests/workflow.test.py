"""Exercise the real Make recipes with package-manager boundaries replaced.

No host packages, credentials, or live dotfiles are changed by these tests.
"""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class WorkflowFixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="dotfiles-workflow-")
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name).resolve()
        self.repo = self.base / "checkout with spaces"
        self.repo.mkdir()
        shutil.copy2(ROOT / "Makefile", self.repo)
        shutil.copytree(ROOT / "scripts", self.repo / "scripts")
        self.home = self.base / "home"
        self.home.mkdir()
        self.bin = self.base / "bin"
        self.bin.mkdir()
        self.log = self.base / "events.jsonl"
        # These are external boundaries, not alternative workflow implementations.
        stub = f"#!{sys.executable}\n" + '''import json, os, pathlib, sys
name = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
if name == "brew" and args == ["shellenv"]:
    print("export DOTFILES_BREW_READY=1")
    sys.exit(0)
with open(os.environ["EVENT_LOG"], "a") as log:
    log.write(json.dumps([name, args, os.getenv("DOTFILES_BREW_READY"),
                          os.getenv("DOTFILES_MISE_READY")]) + "\\n")
if os.environ.get("FAIL_COMMAND") == " ".join([name] + args):
    sys.exit(17)
if name == "brew" and args == ["install", "chezmoi"] and os.getenv("BOOTSTRAP_CHEZMOI"):
    installed = pathlib.Path(sys.argv[0]).parent / "chezmoi"
    installed.write_bytes(pathlib.Path(os.environ["BOOTSTRAP_CHEZMOI"]).read_bytes())
    installed.chmod(0o755)
if name == "mise" and args[:2] == ["exec", "--"]:
    os.environ["DOTFILES_MISE_READY"] = "1"
    os.execvp(args[2], args[2:])
if name == "chezmoi" and args == ["source-path"]:
    print(os.environ["TEST_REPO"] + "/home")
'''
        for name in ["brew", "chezmoi", "mise", "npm", "gh", "misecompsync"]:
            path = self.bin / name
            path.write_text(stub)
            path.chmod(0o755)
        auth = self.home / ".local/bin/pi-auth-setup"
        auth.parent.mkdir(parents=True)
        auth.write_text(stub)
        auth.chmod(0o755)
        self.env = os.environ.copy()
        # Keep tools installed through mise out of this fake fresh-shell PATH.
        self.env.update(
            PATH=f"{self.bin}:/usr/bin:/bin",
            HOME=str(self.home),
            EVENT_LOG=str(self.log),
            TEST_REPO=str(self.repo),
        )
        for key in ["MAKEFLAGS", "MFLAGS", "MAKELEVEL", "NONINTERACTIVE",
                    "TARGET_DIR", "FAIL_COMMAND", "DOTFILES_BREW_READY",
                    "DOTFILES_MISE_READY"]:
            self.env.pop(key, None)

    def run_make(self, target, *args, **env):
        return subprocess.run(
            ["make", "--no-print-directory", "-C", str(self.repo), target, *args],
            env={**self.env, **env}, text=True, capture_output=True, timeout=20,
        )

    def events(self):
        if not self.log.exists():
            return []
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def commands(self):
        return [(name, args) for name, args, _, _ in self.events()
                if not (name == "mise" and args[:1] == ["exec"])]

    def assert_ok(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def chezmoi_command(self, action):
        return ("chezmoi", [f"--source={self.repo}", f"--destination={self.home}", action])


class WorkflowTest(WorkflowFixture):
    def test_sync_applies_before_installing_and_finishes_ready_without_auth(self):
        self.assert_ok(self.run_make("sync"))
        self.assertEqual(self.commands(), [
            self.chezmoi_command("apply"),
            ("brew", ["bundle", "install", "--no-upgrade", f"--file={self.repo}/Brewfile"]),
            ("mise", ["install"]),
            *[("npm", ["ci", "--prefix", f"{self.repo}/packages/{package}"])
              for package in ["pifind", "pi-footer", "pi-tavily"]],
            ("misecompsync", []),
            self.chezmoi_command("verify"),
        ])
        for name, _, brew_ready, mise_ready in self.events():
            self.assertEqual(brew_ready, "1", name)
            if name in ["npm", "misecompsync"]:
                self.assertEqual(mise_ready, "1", name)

    def test_upgrade_uses_new_config_and_reconciles_declared_packages(self):
        self.assert_ok(self.run_make("upgrade"))
        commands = self.commands()
        self.assertEqual(commands[:4], [
            self.chezmoi_command("apply"),
            ("brew", ["update"]),
            ("brew", ["bundle", "install", "--upgrade", f"--file={self.repo}/Brewfile"]),
            ("mise", ["upgrade"]),
        ])
        self.assertEqual(commands[-2:], [
            ("misecompsync", []),
            self.chezmoi_command("verify"),
        ])
        self.assertEqual(sum(name == "npm" for name, _ in commands), 3)

    def test_setup_preserves_headless_opt_out_and_explicit_tool_environment(self):
        self.assert_ok(self.run_make("setup", NONINTERACTIVE="1"))
        self.assertIn(("gh", ["config", "set", "git_protocol", "ssh", "--host", "github.com"]), self.commands())
        self.assertFalse(any(name == "pi-auth-setup" for name, _ in self.commands()))
        self.log.unlink()
        self.assert_ok(self.run_make("setup"))
        self.assertEqual(self.commands()[-1], ("pi-auth-setup", []))
        for name, _, brew_ready, mise_ready in self.events():
            if name in ["gh", "pi-auth-setup"]:
                self.assertEqual((brew_ready, mise_ready), ("1", "1"), name)

    def test_setup_bootstraps_missing_chezmoi_before_applying_files(self):
        bootstrap = self.base / "chezmoi-to-install"
        (self.bin / "chezmoi").rename(bootstrap)
        # Exclude system chezmoi too: Linux may have it in /usr/bin.
        for name in ["sh", "make"]:
            (self.bin / name).symlink_to(shutil.which(name))
        self.assert_ok(self.run_make("setup", NONINTERACTIVE="1",
                                     BOOTSTRAP_CHEZMOI=str(bootstrap), PATH=str(self.bin)))
        self.assertEqual(self.commands()[:2], [
            ("brew", ["install", "chezmoi"]),
            self.chezmoi_command("apply"),
        ])

    def test_pi_auth_uses_tool_environment_without_syncing_or_upgrading(self):
        self.assert_ok(self.run_make("pi-auth"))
        self.assertEqual(self.commands(), [("pi-auth-setup", [])])
        self.assertEqual(self.events()[-1][2:], ["1", "1"])

    def test_provisioning_rejects_alternate_destinations_before_side_effects(self):
        for target in ["setup", "sync", "upgrade", "pi-auth"]:
            with self.subTest(target=target):
                result = self.run_make(target, f"TARGET_DIR={self.base}/render-home")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("chezmoi --destination", result.stderr)
                self.assertEqual(self.commands(), [])

    def test_dry_run_does_not_execute_package_manager_wrappers(self):
        for target in ["setup", "sync", "upgrade", "pi-auth"]:
            with self.subTest(target=target):
                self.log.unlink(missing_ok=True)
                self.assert_ok(self.run_make(target, "-n"))
                self.assertEqual(self.events(), [])

    def test_failure_stops_before_dependent_work_and_can_be_retried(self):
        cases = [
            (f"chezmoi --source={self.repo} --destination={self.home} apply", 1),
            (f"brew bundle install --no-upgrade --file={self.repo}/Brewfile", 2),
            ("mise install", 3),
            (f"npm ci --prefix {self.repo}/packages/pifind", 4),
            ("misecompsync", 7),
            (f"chezmoi --source={self.repo} --destination={self.home} verify", 8),
        ]
        for failure, count in cases:
            with self.subTest(failure=failure):
                self.log.unlink(missing_ok=True)
                result = self.run_make("sync", FAIL_COMMAND=failure)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(len(self.commands()), count)
        self.log.unlink()
        self.assert_ok(self.run_make("sync"))


class RefreshTest(WorkflowFixture):
    def setUp(self):
        super().setUp()
        self.env.update(GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1")
        (self.repo / "home").mkdir()
        self.remote = self.base / "remote.git"
        self.git("init", "--bare", str(self.remote), cwd=self.base)
        self.git("init")
        self.git("add", ".")
        self.commit("initial")
        self.git("remote", "add", "origin", str(self.remote))
        self.git("push", "-u", "origin", "HEAD")
        self.peer = self.base / "peer"
        self.git("clone", str(self.remote), str(self.peer), cwd=self.base)

    def git(self, *args, cwd=None):
        result = subprocess.run(["git", *args], cwd=cwd or self.repo,
                                env=self.env, text=True, capture_output=True, timeout=20)
        self.assert_ok(result)
        return result.stdout.strip()

    def commit(self, message, cwd=None):
        self.git("-c", "user.name=Workflow Test", "-c", "user.email=test@example.invalid",
                 "-c", "commit.gpgsign=false", "commit", "-am", message, cwd=cwd)

    def upstream_change(self):
        (self.peer / "upstream-file").write_text("new source state\n")
        self.git("add", ".", cwd=self.peer)
        self.commit("upstream", cwd=self.peer)
        self.git("push", cwd=self.peer)

    def refresh(self, *args):
        return subprocess.run(
            ["bash", str(ROOT / "home/dot_local/bin/executable_refresh_dotfiles"), *args],
            env=self.env, text=True, capture_output=True, timeout=20,
        )

    def test_files_only_refresh_fast_forwards_and_applies_without_installing(self):
        self.upstream_change()
        self.assert_ok(self.refresh())
        self.assertTrue((self.repo / "upstream-file").exists())
        self.assertEqual(self.commands(), [
            ("chezmoi", ["source-path"]),
            ("chezmoi", [f"--source={self.repo}", f"--destination={self.home}", "apply"]),
        ])

    def test_sync_refresh_fast_forwards_then_reconciles_environment(self):
        self.upstream_change()
        self.assert_ok(self.refresh("--sync"))
        self.assertTrue((self.repo / "upstream-file").exists())
        self.assertEqual(self.commands()[1], self.chezmoi_command("apply"))
        self.assertIn(("mise", ["install"]), self.commands())
        self.assertEqual(self.commands()[-1], self.chezmoi_command("verify"))
        self.assertFalse(any(name == "pi-auth-setup" for name, _ in self.commands()))

    def test_dirty_refresh_refuses_to_pull_or_apply(self):
        self.upstream_change()
        (self.repo / "untracked").write_text("keep this\n")
        before = self.git("rev-parse", "HEAD")
        result = self.refresh("--sync")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("local changes", result.stderr)
        self.assertEqual(self.git("rev-parse", "HEAD"), before)
        self.assertEqual(self.commands(), [("chezmoi", ["source-path"])])

    def test_divergent_refresh_refuses_to_rebase_or_apply(self):
        self.upstream_change()
        (self.repo / "Makefile").write_text((self.repo / "Makefile").read_text() + "\n# local\n")
        self.commit("local")
        before = self.git("rev-parse", "HEAD")
        self.assertNotEqual(self.refresh().returncode, 0)
        self.assertEqual(self.git("rev-parse", "HEAD"), before)
        self.assertEqual(self.commands(), [("chezmoi", ["source-path"])])

    def test_help_and_invalid_arguments_have_no_side_effects(self):
        result = self.refresh("--help")
        self.assert_ok(result)
        self.assertIn("--sync", result.stdout)
        self.assertEqual(self.refresh("--sync", "unexpected").returncode, 2)
        self.assertEqual(self.refresh("--unknown").returncode, 2)
        self.assertEqual(self.commands(), [])


if __name__ == "__main__":
    unittest.main()
