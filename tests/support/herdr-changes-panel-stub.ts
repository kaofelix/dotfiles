import { mock } from "bun:test";

// Herdr's modules, stubbed for tests that load the changes-panel code. mock.module is
// process-wide, so every test file installs this one shape. Tests swap `stub.exec` and
// `stub.readTextFile` for real or counting versions.
const none = () => undefined;
export const stub: { exec: (...args: any[]) => any; readTextFile: (...args: any[]) => any } = { exec: none, readTextFile: none };

export function installHerdrStubs() {
  mock.module("herdr", () => ({
    agents: () => [], appHome: () => "/tmp/changes-panel-test", focused: none, hc: none, notify: none, closeOverlay: none, openOverlay: none,
    panes: () => [], spaces: () => [], props: () => ({}), settings: () => ({}), theme: () => ({}),
    exec: (...args: any[]) => stub.exec(...args), readTextFile: (...args: any[]) => stub.readTextFile(...args),
  }));
  mock.module("gpui-kit", () => ({ View: class {}, div: () => ({}), svg: () => ({}) }));
  mock.module("gpui-base", () => ({ InputState: {}, Input: {}, Scrollbar: {}, VirtualListScrollHandle: {}, v_virtual_list: () => ({}), v_flex: () => ({}), h_flex: () => ({}) }));
}

// exec() as Herdr runs it: a real process, { code, stdout, stderr }.
export async function realExec(cmd: string, args: string[], options: { cwd?: string } = {}) {
  const proc = Bun.spawn([cmd, ...args], { cwd: options.cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, stdout, stderr };
}
