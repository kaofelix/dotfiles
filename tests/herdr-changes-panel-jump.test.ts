import { beforeAll, describe, expect, test } from "bun:test";
import { installHerdrStubs } from "./support/herdr-changes-panel-stub";

installHerdrStubs();

let Panel: any;
beforeAll(async () => {
  Panel = (await import("../home/dot_config/herdr-app/mods/changes-panel/main.js")).default;
});

// The list's scroll handle and the context's timer, recorded: `scroll_to_item(i, "top")`
// only scrolls as far as it must, so where a row lands depends on where the list came from.
function panel(topIndex: number, count = 100) {
  const calls: [number, string][] = [];
  const timers: ((cx: any) => void)[] = [];
  const notified = { n: 0 };
  const cx: any = { notify() { notified.n++; }, timer: { after: (_ms: number, fn: any) => timers.push(fn) } };
  const view = Object.create(Panel.prototype);
  Object.assign(view, {
    topIndex, items: Array.from({ length: count }, () => ({})),
    scroll: { scroll_to_item: (i: number, how: string) => calls.push([i, how]) },
  });
  const tick = () => { while (timers.length) timers.shift()!(cx); };
  return { view, cx, calls, tick, notified };
}

describe("jumping to a row puts it at the top", () => {
  test("a row further down is approached from the end, so it lands at the top, not the bottom", () => {
    const { view, cx, calls, tick } = panel(10);
    view.scrollToTop(40, cx);
    expect(calls).toEqual([[99, "top"]]);
    tick();
    expect(calls).toEqual([[99, "top"], [40, "top"]]);
    expect(view.topIndex).toBe(40);
  });

  test("a row above is scrolled to directly: that already lands at the top", () => {
    const { view, cx, calls, tick } = panel(40);
    view.scrollToTop(10, cx);
    tick();
    expect(calls).toEqual([[10, "top"]]);
  });

  test("the row already at the top is realigned directly, in case it is partly scrolled off", () => {
    const { view, cx, calls, tick } = panel(10);
    view.scrollToTop(10, cx);
    tick();
    expect(calls).toEqual([[10, "top"]]);
  });

  test("a second jump before the first lands wins", () => {
    const { view, cx, calls, tick } = panel(0);
    view.scrollToTop(40, cx);
    view.scrollToTop(60, cx);
    tick();
    expect(calls).toEqual([[99, "top"], [99, "top"], [60, "top"]]);
  });

  test("a jump upward cancels a pending downward one", () => {
    const { view, cx, calls, tick } = panel(0);
    view.scrollToTop(40, cx);
    view.scrollToTop(5, cx);
    tick();
    expect(calls).toEqual([[99, "top"], [5, "top"]]);
  });
});

describe("the pinned header after a jump", () => {
  test("is chosen from the target, not from the end of the list the jump passed through", () => {
    const { view, cx, tick } = panel(10);
    view.scrollToTop(40, cx);
    view.topIndex = 97; // the list laid out at the end on the way, and reported its first row
    tick();
    expect(view.topIndex).toBe(40);
  });

  test("is redrawn once more after the list lands, either way", () => {
    for (const to of [40, 5]) {
      const { view, cx, tick, notified } = panel(10);
      view.scrollToTop(to, cx);
      const before = notified.n;
      tick();
      expect(notified.n).toBeGreaterThan(before);
    }
  });
});

describe("which file's header is pinned", () => {
  const f = (name: string) => ({ name });
  const a = f("a"), b = f("b");
  const items = [{ t: "file", f: a }, { t: "unified", f: a }, { t: "unified", f: a }, { t: "file", f: b }, { t: "unified", f: b }];
  const pinned = (topIndex: number) => Object.assign(Object.create(Panel.prototype), { items, topIndex }).pinnedFile();

  test("the file the first row belongs to", () => {
    expect(pinned(1)).toBe(a);
    expect(pinned(4)).toBe(b);
  });

  test("none when the first row is a header", () => {
    expect(pinned(0)).toBeNull();
    expect(pinned(3)).toBeNull();
  });

  test("none on a file's last row, where the copy would cover the next header", () => {
    expect(pinned(2)).toBeNull();
  });
});
