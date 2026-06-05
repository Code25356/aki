/**
 * Code Execution Sandbox
 * Runs JavaScript code in a sandboxed environment and returns output.
 */

export interface ExecutionResult {
  output: string;
  error?: string;
  duration: number;
}

/**
 * Execute JavaScript code in a sandboxed Function scope.
 * The code has access to Math, Date, JSON, console.log (captured), but NOT the DOM or app state.
 */
export function executeJavaScript(code: string, timeout = 5000): ExecutionResult {
  const start = performance.now();
  const logs: string[] = [];

  try {
    // Create a sandboxed console that captures output
    const sandbox = {
      console: {
        log: (...args: unknown[]) => logs.push(args.map(formatValue).join(" ")),
        error: (...args: unknown[]) => logs.push(`[ERROR] ${args.map(formatValue).join(" ")}`),
        warn: (...args: unknown[]) => logs.push(`[WARN] ${args.map(formatValue).join(" ")}`),
        info: (...args: unknown[]) => logs.push(args.map(formatValue).join(" ")),
        table: (data: unknown) => logs.push(formatValue(data)),
      },
      Math,
      Date,
      JSON,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      Number,
      String,
      Boolean,
      Array,
      Object,
      Map,
      Set,
      RegExp,
      Error,
      Promise,
      setTimeout: undefined, // block async
      setInterval: undefined,
      fetch: undefined, // block network
      XMLHttpRequest: undefined,
    };

    // Build the function with sandbox variables
    const argNames = Object.keys(sandbox);
    const argValues = Object.values(sandbox);

    // Wrap code to capture the last expression's value
    const wrappedCode = `
      "use strict";
      let __result__;
      try {
        __result__ = (function() { ${code} })();
      } catch(e) {
        throw e;
      }
      return __result__;
    `;

    const fn = new Function(...argNames, wrappedCode);

    // Execute with timeout check
    const result = fn(...argValues);
    const duration = performance.now() - start;

    if (duration > timeout) {
      return { output: "", error: `Execution timed out (${timeout}ms limit)`, duration };
    }

    // Combine logs and return value
    let output = logs.join("\n");
    if (result !== undefined && result !== null) {
      const formatted = formatValue(result);
      if (output) {
        output += "\n" + formatted;
      } else {
        output = formatted;
      }
    }

    return { output: output || "(no output)", duration };
  } catch (err) {
    const duration = performance.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);
    const output = logs.length > 0 ? logs.join("\n") + "\n\n" : "";
    return { output, error: errorMsg, duration };
  }
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length > 50) {
      return `[${value.slice(0, 50).map(formatValue).join(", ")} ... (${value.length} items)]`;
    }
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
