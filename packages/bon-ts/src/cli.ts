/**
 * BON CLI - Command-line interface for BON parser/evaluator.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { evaluate, EvalError } from "./evaluator.js";

function parseParams(params: string[] | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!params) return result;
  for (const p of params) {
    if (!p.includes("=")) {
      throw new Error(`Invalid param format: ${p} (expected key=value)`);
    }
    const [key, ...rest] = p.split("=");
    const val = rest.join("=");
    // Try to parse as JSON value
    try {
      result[key] = JSON.parse(val);
    } catch {
      // Treat as string
      result[key] = val;
    }
  }
  return result;
}

function main(): number {
  const args = process.argv.slice(2);

  let pretty = true;
  let expr: string | null = null;
  let file: string | null = null;
  const paramsList: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "-e":
      case "--eval":
        expr = args[++i];
        break;
      case "-p":
      case "--pretty":
        pretty = true;
        if (args[i + 1] && !args[i + 1].startsWith("-")) {
          file = args[++i];
        }
        break;
      case "-c":
      case "--compact":
        pretty = false;
        if (args[i + 1] && !args[i + 1].startsWith("-")) {
          file = args[++i];
        }
        break;
      case "--param":
        while (i + 1 < args.length && !args[i + 1].startsWith("-")) {
          paramsList.push(args[++i]);
        }
        break;
      default:
        if (!arg.startsWith("-")) {
          file = arg;
        }
        break;
    }
  }

  try {
    const params = parseParams(paramsList);

    let result: unknown;

    if (expr) {
      result = evaluate(expr, ".", params);
    } else if (file) {
      const source = fs.readFileSync(file, "utf-8");
      result = evaluate(source, path.dirname(file), params);
    } else {
      // Read from stdin
      const chunks: Buffer[] = [];
      const fd = fs.openSync("/dev/stdin", "r");
      const buf = Buffer.alloc(1024);
      let bytesRead: number;
      do {
        bytesRead = fs.readSync(fd, buf);
        chunks.push(buf.subarray(0, bytesRead));
      } while (bytesRead > 0);
      fs.closeSync(fd);
      result = evaluate(Buffer.concat(chunks).toString("utf-8"), ".", params);
    }

    const indent = pretty ? 2 : undefined;
    console.log(JSON.stringify(result, null, indent));
    return 0;
  } catch (e) {
    if (e instanceof EvalError || e instanceof Error) {
      console.error(`Error: ${e.message}`);
    } else {
      console.error(`Internal error: ${e}`);
    }
    return 1;
  }
}

process.exit(main());