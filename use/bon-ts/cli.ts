#!/usr/bin/env node

/**
 * BON CLI - Command-line interface for BON parser/evaluator.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { evaluate, EvalError } from "../../packages/bon-ts/src/evaluator.js";

function main(): number {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: bon <file> | bon -e <expression> | bon -p <file>");
    console.error("  -e <expr>   Evaluate BON expression from string");
    console.error("  -p <file>   Pretty-print JSON output");
    console.error("  -c <file>   Compact JSON output");
    return 1;
  }

  let pretty = true;
  let expr: string | null = null;
  let file: string | null = null;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
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
      default:
        if (!args[i].startsWith("-")) {
          file = args[i];
        }
        break;
    }
  }

  try {
    let result: unknown;

    if (expr) {
      result = evaluate(expr);
    } else if (file) {
      const source = fs.readFileSync(file, "utf-8");
      result = evaluate(source, path.dirname(file));
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
      result = evaluate(Buffer.concat(chunks).toString("utf-8"));
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
