/**
 * Node's test runner does not transform JSX, so this mounts the real ChartMenu
 * by compiling that one component and rendering it into a small DOM.
 * The menu component stays mounted while the menu closes and opens again.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { unlinkSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL, fileURLToPath } from "node:url";
import { localDateKey } from "./chart.ts";
import { chartReadingSunSign } from "./chart-menu.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript") as {
  transpileModule: (
    source: string,
    options: { compilerOptions: Record<string, number>; fileName: string },
  ) => { outputText: string };
  JsxEmit: { ReactJSX: number };
  ScriptTarget: { ES2022: number };
  ModuleKind: { ESNext: number };
};
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const libDir = join(repoRoot, "src/lib");
const compiledPath = join(libDir, "_chart_panel_render.mjs");

class MiniNode {
  childNodes: MiniNode[] = [];
  parentNode: MiniNode | null = null;
  nodeType = 0;
  nodeName = "";
  nodeValue = "";
  ownerDocument: MiniDocument | null = null;

  appendChild(child: MiniNode): MiniNode {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  insertBefore(child: MiniNode, ref: MiniNode | null): MiniNode {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    const index = ref ? this.childNodes.indexOf(ref) : -1;
    if (index < 0) this.childNodes.push(child);
    else this.childNodes.splice(index, 0, child);
    return child;
  }

  removeChild(child: MiniNode): MiniNode {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  contains(node: MiniNode): boolean {
    if (node === this) return true;
    return this.childNodes.some((child) => child.contains(node));
  }

  get firstChild(): MiniNode | null {
    return this.childNodes[0] ?? null;
  }

  get nextSibling(): MiniNode | null {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index + 1] ?? null;
  }

  get textContent(): string {
    if (this.nodeType === 3 || this.nodeType === 8) return this.nodeValue;
    return this.childNodes.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.childNodes = [];
    if (value) this.appendChild(this.ownerDocument!.createTextNode(String(value)));
  }

  addEventListener(): void {}
  removeEventListener(): void {}
}

class MiniElement extends MiniNode {
  tagName: string;
  attributes: Record<string, string> = {};
  style = new Proxy({}, { get: () => "", set: () => true });
  namespaceURI = "http://www.w3.org/1999/xhtml";

  constructor(tag: string, doc: MiniDocument) {
    super();
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.nodeName = this.tagName;
    this.ownerDocument = doc;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = String(value);
  }

  getAttribute(name: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name]! : null;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  hasAttribute(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  setAttributeNS(_ns: string, name: string, value: string): void {
    this.setAttribute(name, value);
  }

  focus(): void {}
}

class MiniText extends MiniNode {
  constructor(value: string, doc: MiniDocument) {
    super();
    this.nodeType = 3;
    this.nodeName = "#text";
    this.nodeValue = String(value);
    this.ownerDocument = doc;
  }
}

class MiniDocument extends MiniNode {
  documentElement: MiniElement;
  head: MiniElement;
  body: MiniElement;
  visibilityState = "visible";
  activeElement: MiniElement | null = null;
  defaultView: object | null = null;

  constructor() {
    super();
    this.nodeType = 9;
    this.nodeName = "#document";
    this.ownerDocument = this;
    this.documentElement = new MiniElement("html", this);
    this.head = new MiniElement("head", this);
    this.body = new MiniElement("body", this);
    this.appendChild(this.documentElement);
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
  }

  createElement(tag: string): MiniElement {
    return new MiniElement(tag, this);
  }

  createElementNS(_ns: string, tag: string): MiniElement {
    return this.createElement(tag);
  }

  createTextNode(text: string): MiniText {
    return new MiniText(text, this);
  }

  createComment(text: string): MiniText {
    const node = new MiniText(text, this);
    node.nodeType = 8;
    node.nodeName = "#comment";
    return node;
  }
}

function walk(node: MiniNode, visit: (el: MiniElement) => void): void {
  if (node instanceof MiniElement) visit(node);
  for (const child of node.childNodes) walk(child, visit);
}

function findLabeled(node: MiniNode, label: string): MiniElement | null {
  let found: MiniElement | null = null;
  walk(node, (el) => {
    if (!found && el.getAttribute("aria-label") === label) found = el;
  });
  return found;
}

function findReading(node: MiniNode): MiniElement | null {
  let found: MiniElement | null = null;
  walk(node, (el) => {
    if (found || el.tagName !== "P") return;
    if (el.getAttribute("aria-label") === "Today's sun") return;
    if (chartReadingSunSign(el.textContent)) found = el;
  });
  return found;
}

describe("Chart menu clock on open", () => {
  it("refreshes the sun row and the reading when a mounted menu reopens after a sign change", async () => {
    const previousTz = process.env.TZ;
    process.env.TZ = "America/Chicago";
    const morningMs = Date.parse("2026-09-22T12:00:00-05:00");
    const eveningMs = Date.parse("2026-09-22T20:00:00-05:00");
    assert.equal(localDateKey(new Date(morningMs), "America/Chicago"), "2026-09-22");
    assert.equal(localDateKey(new Date(eveningMs), "America/Chicago"), "2026-09-22");

    const document = new MiniDocument();
    const view = {
      document,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      HTMLElement: MiniElement,
      HTMLIFrameElement: class HTMLIFrameElement {},
      location: { protocol: "http:", href: "http://localhost/" },
      navigator: { userAgent: "node" },
      addEventListener(): void {},
      removeEventListener(): void {},
    };
    const windowStub = { ...view, self: view, top: view, window: view };
    document.defaultView = windowStub;
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousFetch = globalThis.fetch;
    const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const previousHtmlElement = globalThis.HTMLElement;
    const previousLocalStorage = globalThis.localStorage;
    const RealDate = Date;
    let nowMs = morningMs;
    let fetches = 0;
    let reactRoot: { render: (node: unknown) => void; unmount: () => void } | null = null;

    class FakeDate extends RealDate {
      constructor(...args: [] | [string | number | Date]) {
        super(args.length === 0 ? nowMs : args[0]!);
      }

      static now(): number {
        return nowMs;
      }
    }

    try {
      globalThis.window = windowStub as unknown as Window & typeof globalThis;
      globalThis.document = document as unknown as Document;
      Object.defineProperty(globalThis, "navigator", {
        value: windowStub.navigator,
        configurable: true,
      });
      globalThis.HTMLElement = MiniElement as unknown as typeof HTMLElement;
      globalThis.IS_REACT_ACT_ENVIRONMENT = true;
      const mem = new Map<string, string>();
      globalThis.localStorage = {
        getItem: (key) => (mem.has(key) ? mem.get(key)! : null),
        setItem: (key, value) => {
          mem.set(key, String(value));
        },
        removeItem: (key) => {
          mem.delete(key);
        },
        clear: () => mem.clear(),
        key: (index) => [...mem.keys()][index] ?? null,
        get length() {
          return mem.size;
        },
      };
      globalThis.fetch = (async () => {
        fetches += 1;
        throw new Error("chart open fetched");
      }) as typeof fetch;
      globalThis.Date = FakeDate as DateConstructor;

      const { useChartStore } = await import("./chart-store.ts");
      useChartStore.setState({ skyNoteByDay: {}, diaryByDay: {} });

      const source = readFileSync(join(repoRoot, "src/components/chart-panel.tsx"), "utf8");
      const compiled = ts
        .transpileModule(source, {
          compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX,
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
          },
          fileName: "chart-panel.tsx",
        })
        .outputText.replace(/from "@\/lib\/([^"]+)"/g, (_match, name: string) => {
          return `from ${JSON.stringify(pathToFileURL(join(libDir, `${name}.ts`)).href)}`;
        });
      writeFileSync(compiledPath, compiled);
      const mod = await import(`${pathToFileURL(compiledPath).href}?t=${RealDate.now()}`);
      const React = require("react") as {
        createElement: (...args: unknown[]) => unknown;
        act: (callback: () => unknown) => Promise<void>;
      };
      const { createRoot } = require("react-dom/client") as {
        createRoot: (el: MiniElement) => { render: (node: unknown) => void; unmount: () => void };
      };
      const host = document.createElement("div");
      document.body.appendChild(host);
      reactRoot = createRoot(host);
      const renderMenu = (open: boolean) =>
        React.act(async () => {
          reactRoot!.render(
            React.createElement(mod.ChartMenu, {
              open,
              onAsk() {},
              onClose() {},
            }),
          );
        });

      await renderMenu(true);
      assert.equal(localDateKey(new FakeDate()), "2026-09-22");
      const morningSun = findLabeled(host, "Today's sun");
      const morningReading = findReading(host);
      assert.equal(morningSun?.textContent, "Sun · Virgo");
      assert.equal(chartReadingSunSign(morningReading?.textContent), "Virgo");

      await renderMenu(false);
      assert.equal(findLabeled(host, "Today's sun"), null);

      nowMs = eveningMs;
      await renderMenu(true);
      const eveningSun = findLabeled(host, "Today's sun");
      const eveningReading = findReading(host);
      assert.equal(localDateKey(new FakeDate()), "2026-09-22");
      assert.equal(eveningSun?.textContent, "Sun · Libra");
      assert.equal(chartReadingSunSign(eveningReading?.textContent), "Libra");
      assert.doesNotMatch(eveningReading?.textContent ?? "", /Virgo/);
      assert.equal(fetches, 0);
      assert.doesNotMatch(source, /speechSynthesis|streamGrok|\bfetch\(|requestHerDay|setInterval|setPose/);
    } finally {
      if (reactRoot) {
        const React = require("react") as { act: (callback: () => unknown) => Promise<void> };
        await React.act(async () => {
          reactRoot?.unmount();
        });
      }
      try {
        unlinkSync(compiledPath);
      } catch {
        /* already gone */
      }
      globalThis.Date = RealDate;
      globalThis.fetch = previousFetch;
      process.env.TZ = previousTz;
      if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
      globalThis.HTMLElement = previousHtmlElement;
      if (previousLocalStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
      else globalThis.localStorage = previousLocalStorage;
      if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
      else globalThis.window = previousWindow;
      if (previousDocument === undefined) delete (globalThis as { document?: unknown }).document;
      else globalThis.document = previousDocument;
    }
  });
});
