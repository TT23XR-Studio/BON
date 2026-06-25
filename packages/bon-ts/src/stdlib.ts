/**
 * BON Standard Library - Built-in functions for BON evaluator.
 */

export class BONRuntimeError extends Error {
  constructor(
    message: string,
    public code: string = "E999",
  ) {
    super(message);
    this.name = "BONRuntimeError";
  }
}

function typeCheck(value: unknown, expectedType: string, funcName: string, argIdx: number): void {
  const actual = Array.isArray(value) ? "array" : typeof value;
  if (expectedType === "array") {
    if (!Array.isArray(value)) {
      throw new BONRuntimeError(`${funcName}() argument ${argIdx + 1}: expected array, got ${actual}`, "E007");
    }
  } else if (actual !== expectedType) {
    throw new BONRuntimeError(`${funcName}() argument ${argIdx + 1}: expected ${expectedType}, got ${actual}`, "E007");
  }
}

// ── String operations ────────────────────────────────────────

function stdUpper(args: unknown[]): string {
  typeCheck(args[0], "string", "std.upper", 0);
  return (args[0] as string).toUpperCase();
}

function stdLower(args: unknown[]): string {
  typeCheck(args[0], "string", "std.lower", 0);
  return (args[0] as string).toLowerCase();
}

function stdTrim(args: unknown[]): string {
  typeCheck(args[0], "string", "std.trim", 0);
  return (args[0] as string).trim();
}

function stdSplit(args: unknown[]): unknown[] {
  typeCheck(args[0], "string", "std.split", 0);
  typeCheck(args[1], "string", "std.split", 1);
  return (args[0] as string).split(args[1] as string);
}

function stdReplace(args: unknown[]): string {
  typeCheck(args[0], "string", "std.replace", 0);
  typeCheck(args[1], "string", "std.replace", 1);
  typeCheck(args[2], "string", "std.replace", 2);
  return (args[0] as string).replaceAll(args[1] as string, args[2] as string);
}

function stdLen(args: unknown[]): number {
  const val = args[0];
  if (typeof val === "string" || Array.isArray(val) || (typeof val === "object" && val !== null)) {
    return Array.isArray(val) ? val.length : typeof val === "string" ? val.length : Object.keys(val).length;
  }
  throw new BONRuntimeError("std.len() argument 1: expected string, array, or object", "E007");
}

// ── Array operations ─────────────────────────────────────────

function stdAt(args: unknown[]): unknown {
  typeCheck(args[0], "array", "std.at", 0);
  typeCheck(args[1], "number", "std.at", 1);
  const arr = args[0] as unknown[];
  let idx = args[1] as number;
  if (idx < 0) idx += arr.length;
  if (idx < 0 || idx >= arr.length) {
    throw new BONRuntimeError(`std.at() index ${args[1]} out of bounds for array of length ${arr.length}`, "E006");
  }
  return arr[idx];
}

function stdFirst(args: unknown[]): unknown {
  return stdAt([args[0], 0]);
}

function stdLast(args: unknown[]): unknown {
  return stdAt([args[0], -1]);
}

function stdMap(args: unknown[], callFn: FnCaller): unknown[] {
  typeCheck(args[0], "array", "std.map", 0);
  const arr = args[0] as unknown[];
  const fn = args[1];
  return arr.map((item, i) => callFn(fn, [item, i]));
}

function stdFilter(args: unknown[], callFn: FnCaller): unknown[] {
  typeCheck(args[0], "array", "std.filter", 0);
  const arr = args[0] as unknown[];
  const fn = args[1];
  return arr.filter((item) => callFn(fn, [item]));
}

function stdReduce(args: unknown[], callFn: FnCaller): unknown {
  typeCheck(args[0], "array", "std.reduce", 0);
  const arr = args[0] as unknown[];
  const init = args[1];
  const fn = args[2];
  return arr.reduce((acc, item) => callFn(fn, [acc, item]), init);
}

function stdConcat(args: unknown[]): unknown[] {
  typeCheck(args[0], "array", "std.concat", 0);
  typeCheck(args[1], "array", "std.concat", 1);
  return [...(args[0] as unknown[]), ...(args[1] as unknown[])];
}

// ── Object operations ────────────────────────────────────────

function stdMerge(args: unknown[]): Record<string, unknown> {
  typeCheck(args[0], "object", "std.merge", 0);
  typeCheck(args[1], "object", "std.merge", 1);
  return { ...(args[0] as Record<string, unknown>), ...(args[1] as Record<string, unknown>) };
}

function stdKeys(args: unknown[]): string[] {
  typeCheck(args[0], "object", "std.keys", 0);
  return Object.keys(args[0] as Record<string, unknown>);
}

function stdValues(args: unknown[]): unknown[] {
  typeCheck(args[0], "object", "std.values", 0);
  return Object.values(args[0] as Record<string, unknown>);
}

// ── Type conversion ──────────────────────────────────────────

function stdToString(args: unknown[]): string {
  const val = args[0];
  if (typeof val === "boolean") return val ? "true" : "false";
  if (val === null || val === undefined) return "null";
  return String(val);
}

function stdToNumber(args: unknown[]): number | null {
  const val = args[0];
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const num = Number(val);
    return isNaN(num) ? null : num;
  }
  return null;
}

function stdTypeOf(args: unknown[]): string {
  const val = args[0];
  if (val === null || val === undefined) return "null";
  if (typeof val === "boolean") return "boolean";
  if (typeof val === "number") return "number";
  if (typeof val === "string") return "string";
  if (Array.isArray(val)) return "array";
  if (typeof val === "object") return "object";
  return "unknown";
}

// ── Type for function caller ─────────────────────────────────

type FnCaller = (fn: unknown, args: unknown[]) => unknown;

// ── Standard library registry ────────────────────────────────

export interface StdLibEntry {
  fn: (args: unknown[], callFn?: FnCaller) => unknown;
  needsCallFn?: boolean;
}

export const STD_LIB: Record<string, StdLibEntry> = {
  upper: { fn: stdUpper },
  lower: { fn: stdLower },
  trim: { fn: stdTrim },
  split: { fn: stdSplit },
  replace: { fn: stdReplace },
  len: { fn: stdLen },
  at: { fn: stdAt },
  first: { fn: stdFirst },
  last: { fn: stdLast },
  map: { fn: (args, callFn) => stdMap(args, callFn!), needsCallFn: true },
  filter: { fn: (args, callFn) => stdFilter(args, callFn!), needsCallFn: true },
  reduce: { fn: (args, callFn) => stdReduce(args, callFn!), needsCallFn: true },
  concat: { fn: stdConcat },
  merge: { fn: stdMerge },
  keys: { fn: stdKeys },
  values: { fn: stdValues },
  to_string: { fn: stdToString },
  to_number: { fn: stdToNumber },
  type_of: { fn: stdTypeOf },
};
