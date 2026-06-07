/**
 * Code Execution Sandbox
 * Runs JavaScript code in an isolated Web Worker with no access to
 * the main thread, DOM, localStorage, fetch, or Tauri IPC.
 */

export interface ExecutionResult {
  output: string;
  error?: string;
  duration: number;
}

const WORKER_CODE = `
"use strict";
// Remove all dangerous globals inside the worker
self.fetch = undefined;
self.XMLHttpRequest = undefined;
self.importScripts = undefined;
self.navigator = undefined;
self.location = undefined;
self.indexedDB = undefined;
self.caches = undefined;
self.WebSocket = undefined;
self.EventSource = undefined;

self.onmessage = function(e) {
  const { code, id } = e.data;
  const logs = [];
  const start = performance.now();

  const sandboxConsole = {
    log: (...args) => logs.push(args.map(formatVal).join(" ")),
    error: (...args) => logs.push("[ERROR] " + args.map(formatVal).join(" ")),
    warn: (...args) => logs.push("[WARN] " + args.map(formatVal).join(" ")),
    info: (...args) => logs.push(args.map(formatVal).join(" ")),
    table: (data) => logs.push(formatVal(data)),
  };

  try {
    const fn = new Function("console", "Math", "Date", "JSON", "parseInt", "parseFloat",
      "isNaN", "isFinite", "Number", "String", "Boolean", "Array", "Object",
      "Map", "Set", "RegExp", "Error",
      '"use strict"; ' + code
    );
    const result = fn(sandboxConsole, Math, Date, JSON, parseInt, parseFloat,
      isNaN, isFinite, Number, String, Boolean, Array, Object,
      Map, Set, RegExp, Error);

    const duration = performance.now() - start;
    let output = logs.join("\\n");
    if (result !== undefined && result !== null) {
      const formatted = formatVal(result);
      output = output ? output + "\\n" + formatted : formatted;
    }
    self.postMessage({ id, output: output || "(no output)", duration });
  } catch (err) {
    const duration = performance.now() - start;
    const output = logs.length > 0 ? logs.join("\\n") + "\\n\\n" : "";
    self.postMessage({ id, output, error: err.message || String(err), duration });
  }
};

function formatVal(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length > 50) {
      return "[" + value.slice(0, 50).map(formatVal).join(", ") + " ... (" + value.length + " items)]";
    }
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === "object") {
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }
  return String(value);
}
`;

let workerBlobUrl: string | null = null;

function getWorkerUrl(): string {
  if (!workerBlobUrl) {
    const blob = new Blob([WORKER_CODE], { type: "application/javascript" });
    workerBlobUrl = URL.createObjectURL(blob);
  }
  return workerBlobUrl;
}

/**
 * Execute JavaScript code in an isolated Web Worker.
 * No access to DOM, localStorage, fetch, Tauri IPC, or any main-thread state.
 * Falls back to Function-based sandbox in environments without Worker (tests).
 */
export function executeJavaScript(code: string, timeout = 5000): Promise<ExecutionResult> {
  // Fallback for test environments (Node.js) where Worker is unavailable
  if (typeof Worker === "undefined") {
    return executeFallback(code);
  }

  return new Promise((resolve) => {
    const worker = new Worker(getWorkerUrl());
    const id = Math.random().toString(36).slice(2);
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        worker.terminate();
        resolve({ output: "", error: `Execution timed out (${timeout}ms limit)`, duration: timeout });
      }
    }, timeout);

    worker.onmessage = (e) => {
      if (e.data.id === id && !settled) {
        settled = true;
        clearTimeout(timer);
        worker.terminate();
        resolve({
          output: e.data.output,
          error: e.data.error,
          duration: e.data.duration,
        });
      }
    };

    worker.onerror = (e) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        worker.terminate();
        resolve({ output: "", error: e.message || "Worker error", duration: 0 });
      }
    };

    worker.postMessage({ code, id });
  });
}

function formatVal(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length > 50) {
      return "[" + value.slice(0, 50).map(formatVal).join(", ") + " ... (" + value.length + " items)]";
    }
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === "object") {
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }
  return String(value);
}

function executeFallback(code: string): Promise<ExecutionResult> {
  const logs: string[] = [];
  const start = performance.now();

  const sandboxConsole = {
    log: (...args: unknown[]) => logs.push(args.map(formatVal).join(" ")),
    error: (...args: unknown[]) => logs.push("[ERROR] " + args.map(formatVal).join(" ")),
    warn: (...args: unknown[]) => logs.push("[WARN] " + args.map(formatVal).join(" ")),
    info: (...args: unknown[]) => logs.push(args.map(formatVal).join(" ")),
    table: (data: unknown) => logs.push(formatVal(data)),
  };

  const blocked = () => { throw new Error("Not available in sandbox"); };

  try {
    const fn = new Function(
      "console", "Math", "Date", "JSON", "parseInt", "parseFloat",
      "isNaN", "isFinite", "Number", "String", "Boolean", "Array", "Object",
      "Map", "Set", "RegExp", "Error", "setTimeout", "setInterval", "fetch",
      '"use strict"; ' + code
    );
    const result = fn(
      sandboxConsole, Math, Date, JSON, parseInt, parseFloat,
      isNaN, isFinite, Number, String, Boolean, Array, Object,
      Map, Set, RegExp, Error, blocked, blocked, blocked
    );

    const duration = performance.now() - start;
    let output = logs.join("\n");
    if (result !== undefined && result !== null) {
      const formatted = formatVal(result);
      output = output ? output + "\n" + formatted : formatted;
    }
    return Promise.resolve({ output: output || "(no output)", duration });
  } catch (err: unknown) {
    const duration = performance.now() - start;
    const output = logs.length > 0 ? logs.join("\n") + "\n\n" : "";
    const message = err instanceof Error ? err.message : String(err);
    return Promise.resolve({ output, error: message, duration });
  }
}
