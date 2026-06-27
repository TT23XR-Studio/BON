/**
 * Comprehensive tests for BON TypeScript implementation.
 */
/// <reference types="node" />

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect } from "vitest";
import { Lexer, LexerError, TokenType } from "../src/lexer.js";
import { Parser, ParseError, parse } from "../src/parser.js";
import { Evaluator, EvalError, evaluate, load } from "../src/evaluator.js";

// ── Lexer Tests ──────────────────────────────────────────────

describe("Lexer", () => {
  it("empty input", () => {
    const tokens = new Lexer("").tokens();
    expect(tokens.at(-1)!.type).toBe("EOF");
  });

  it("string", () => {
    const tokens = new Lexer('"hello"').tokens();
    expect(tokens[0].type).toBe("STRING");
    expect(tokens[0].value).toBe("hello");
  });

  it("string escape", () => {
    const tokens = new Lexer('"line\\n1"').tokens();
    expect(tokens[0].value).toBe("line\n1");
  });

  it("string unicode", () => {
    const tokens = new Lexer('"\\u0041"').tokens();
    expect(tokens[0].value).toBe("A");
  });

  it("number int", () => {
    const tokens = new Lexer("42").tokens();
    expect(tokens[0].type).toBe("NUMBER");
    expect(tokens[0].value).toBe(42);
  });

  it("number float", () => {
    const tokens = new Lexer("3.14").tokens();
    expect(tokens[0].type).toBe("NUMBER");
    expect(tokens[0].value).toBe(3.14);
  });

  it("number negative", () => {
    const tokens = new Lexer("-5").tokens();
    expect(tokens[0].type).toBe("NUMBER");
    expect(tokens[0].value).toBe(-5);
  });

  it("number scientific", () => {
    const tokens = new Lexer("1e3").tokens();
    expect(tokens[0].type).toBe("NUMBER");
    expect(tokens[0].value).toBe(1000);
  });

  it("true/false/null", () => {
    const tokens = new Lexer("true false null").tokens();
    expect(tokens[0].type).toBe("TRUE");
    expect(tokens[1].type).toBe("FALSE");
    expect(tokens[2].type).toBe("NULL");
  });

  it("identifiers", () => {
    const tokens = new Lexer("foo _bar baz123").tokens();
    expect(tokens[0].type).toBe("IDENT");
    expect(tokens[0].value).toBe("foo");
    expect(tokens[1].type).toBe("IDENT");
    expect(tokens[2].type).toBe("IDENT");
  });

  it("keywords", () => {
    const tokens = new Lexer("class extends fn return import as").tokens();
    expect(tokens[0].type).toBe("CLASS");
    expect(tokens[1].type).toBe("EXTENDS");
    expect(tokens[2].type).toBe("FN");
    expect(tokens[3].type).toBe("RETURN");
    expect(tokens[4].type).toBe("IMPORT");
    expect(tokens[5].type).toBe("AS");
  });

  it("punctuation", () => {
    const tokens = new Lexer("{ } [ ] : , . ( ) = + - * / %").tokens();
    const types = tokens.slice(0, -1).map((t) => t.type);
    expect(types).toEqual([
      "LBRACE", "RBRACE", "LBRACKET", "RBRACKET",
      "COLON", "COMMA", "DOT", "LPAREN", "RPAREN",
      "EQUALS", "PLUS", "DASH", "STAR", "SLASH", "PERCENT",
    ]);
  });

  it("comments", () => {
    const src = '# line comment\n"hello" // inline';
    const tokens = new Lexer(src).tokens();
    expect(tokens[0].type).toBe("STRING");
    expect(tokens[0].value).toBe("hello");
  });

  it("template ref", () => {
    const tokens = new Lexer("{my_template}").tokens();
    expect(tokens[0].type).toBe("TEMPLATE_OPEN");
    expect(tokens[0].value).toBe("my_template");
  });

  it("invalid char", () => {
    expect(() => new Lexer("~").tokens()).toThrow(LexerError);
  });
});

// ── Parser Tests ─────────────────────────────────────────────

describe("Parser", () => {
  it("literal string", () => {
    const prog = parse('"hello"');
    expect(prog.body).toHaveLength(1);
    expect(prog.body[0].kind).toBe("Literal");
  });

  it("literal number", () => {
    const prog = parse("42");
    expect(prog.body[0].kind).toBe("Literal");
    expect((prog.body[0] as any).value).toBe(42);
  });

  it("array", () => {
    const prog = parse("[1, 2, 3]");
    expect(prog.body[0].kind).toBe("ArrayLit");
    expect((prog.body[0] as any).elements).toHaveLength(3);
  });

  it("object", () => {
    const prog = parse('{"a": 1, "b": 2}');
    expect(prog.body[0].kind).toBe("ObjectLit");
  });

  it("template def", () => {
    const prog = parse('my_tpl-{"x": 1}');
    expect("my_tpl" in prog.templates).toBe(true);
  });

  it("class def", () => {
    const prog = parse('class Foo { "x": 1 }');
    expect("Foo" in prog.classes).toBe(true);
  });

  it("class with method", () => {
    const prog = parse('class Foo { fn bar() { return 1 } }');
    expect("bar" in prog.classes["Foo"].methods).toBe(true);
  });

  it("class inheritance", () => {
    const prog = parse('class A { "x": 1 }\nclass B extends A { "y": 2 }');
    expect(prog.classes["B"].parent).toBe("A");
  });

  it("import", () => {
    const prog = parse('import "other.bon"\n{"a": 1}');
    expect(prog.imports).toHaveLength(1);
  });

  it("import alias", () => {
    const prog = parse('import "other.bon" as X\n{"a": 1}');
    expect(prog.imports[0].alias).toBe("X");
  });

  it("variable assign", () => {
    const prog = parse('x = 42\n{"val": x}');
    expect("x" in prog.variables).toBe(true);
  });

  it("binary op", () => {
    const prog = parse("1 + 2");
    expect(prog.body[0].kind).toBe("BinaryOp");
  });

  it("method call", () => {
    const prog = parse('Foo {"x": 1}.bar()');
    expect(prog.body[0].kind).toBe("MethodCall");
  });

  it("anonymous fn", () => {
    const prog = parse('fn(x) { return x }');
    expect(prog.body[0].kind).toBe("FuncDef");
  });
});

// ── Evaluator Tests ──────────────────────────────────────────

describe("Evaluator", () => {
  it("json passthrough", () => {
    const result = evaluate('{"a": 1, "b": [1, 2, 3], "c": null, "d": true}');
    expect(result).toEqual({ a: 1, b: [1, 2, 3], c: null, d: true });
  });

  it("template expansion", () => {
    const result = evaluate('base-{"cpu": "250m"}\n{"res": {base}}') as any;
    expect(result.res.cpu).toBe("250m");
  });

  it("template deep copy", () => {
    const result = evaluate('t-{"x": 1}\n{"a": {t}, "b": {t}}') as any;
    result.a.x = 999;
    expect(result.b.x).toBe(1);
  });

  it("class basic", () => {
    const result = evaluate('class Foo { "x": 1, "y": 2 }\n{"obj": Foo {}}') as any;
    expect(result.obj.x).toBe(1);
  });

  it("class override", () => {
    const result = evaluate('class Foo { "x": 1 }\n{"obj": Foo { "x": 10 }}') as any;
    expect(result.obj.x).toBe(10);
  });

  it("class method", () => {
    const result = evaluate(`
class Math {
    fn add(a, b) { return a + b }
}
{"result": Math {}.add(3, 4)}
`) as any;
    expect(result.result).toBe(7);
  });

  it("class self reference", () => {
    const result = evaluate(`
class Person {
    "name": "Bob",
    "greeting": "Hello, " + self.name
}
{"p": Person {}}
`) as any;
    expect(result.p.greeting).toBe("Hello, Bob");
  });

  it("class inheritance", () => {
    const result = evaluate(`
class Animal { "type": "unknown" }
class Dog extends Animal { "type": "canine" }
{"pet": Dog {}}
`) as any;
    expect(result.pet.type).toBe("canine");
  });

  it("class computed property", () => {
    const result = evaluate(`
class Rect {
    "w": 3,
    "h": 4,
    "area": self.w * self.h
}
{"r": Rect {}}
`) as any;
    expect(result.r.area).toBe(12);
  });

  it("std.upper", () => {
    expect(evaluate('std.upper("hello")')).toBe("HELLO");
  });

  it("std.lower", () => {
    expect(evaluate('std.lower("WORLD")')).toBe("world");
  });

  it("std.trim", () => {
    expect(evaluate('std.trim("  hi  ")')).toBe("hi");
  });

  it("std.split", () => {
    expect(evaluate('std.split("a,b,c", ",")')).toEqual(["a", "b", "c"]);
  });

  it("std.replace", () => {
    expect(evaluate('std.replace("foo bar", "bar", "baz")')).toBe("foo baz");
  });

  it("std.len string", () => {
    expect(evaluate('std.len("hello")')).toBe(5);
  });

  it("std.len array", () => {
    expect(evaluate('std.len([1, 2, 3])')).toBe(3);
  });

  it("std.at", () => {
    expect(evaluate('std.at([10, 20, 30], -1)')).toBe(30);
  });

  it("std.first", () => {
    expect(evaluate('std.first([5, 6])')).toBe(5);
  });

  it("std.last", () => {
    expect(evaluate('std.last([5, 6])')).toBe(6);
  });

  it("std.map", () => {
    expect(evaluate('std.map([1, 2], fn(x) { return x * 2 })')).toEqual([2, 4]);
  });

  it("std.filter", () => {
    expect(evaluate('std.filter([1, 2, 3], fn(x) { return x > 1 })')).toEqual([2, 3]);
  });

  it("std.reduce", () => {
    expect(evaluate('std.reduce([1, 2, 3], 0, fn(a, b) { return a + b })')).toBe(6);
  });

  it("std.concat", () => {
    expect(evaluate('std.concat([1], [2])')).toEqual([1, 2]);
  });

  it("std.merge", () => {
    expect(evaluate('std.merge({"a": 1}, {"b": 2})')).toEqual({ a: 1, b: 2 });
  });

  it("std.keys", () => {
    expect(evaluate('std.keys({"a": 1, "b": 2})')).toEqual(["a", "b"]);
  });

  it("std.values", () => {
    const vals = evaluate('std.values({"a": 1, "b": 2})') as number[];
    expect(vals.sort()).toEqual([1, 2]);
  });

  it("std.to_string", () => {
    expect(evaluate('std.to_string(123)')).toBe("123");
    expect(evaluate('std.to_string(true)')).toBe("true");
  });

  it("std.to_number", () => {
    expect(evaluate('std.to_number("42.5")')).toBe(42.5);
  });

  it("std.type_of", () => {
    expect(evaluate('std.type_of([1])')).toBe("array");
    expect(evaluate('std.type_of("hi")')).toBe("string");
  });

  it("binary add", () => {
    expect(evaluate("1 + 2")).toBe(3);
  });

  it("binary sub", () => {
    expect(evaluate("10 - 3")).toBe(7);
  });

  it("binary mul", () => {
    expect(evaluate("4 * 5")).toBe(20);
  });

  it("binary div", () => {
    expect(evaluate("10 / 2")).toBe(5);
  });

  it("binary mod", () => {
    expect(evaluate("10 % 3")).toBe(1);
  });

  it("string concat", () => {
    expect(evaluate('"hello" + " " + "world"')).toBe("hello world");
  });

  it("unary neg", () => {
    expect(evaluate("-5")).toBe(-5);
  });

  it("nested object", () => {
    const result = evaluate('{"a": {"b": {"c": 42}}}') as any;
    expect(result.a.b.c).toBe(42);
  });

  it("division by zero", () => {
    expect(() => evaluate("1 / 0")).toThrow(EvalError);
  });

  it("undefined template", () => {
    expect(() => evaluate("{nope}")).toThrow(EvalError);
  });

  it("undefined class", () => {
    expect(() => evaluate("Nope {}")).toThrow(EvalError);
  });

  it("type error", () => {
    expect(() => evaluate('"a" - "b"')).toThrow(EvalError);
  });

  it("variable assign", () => {
    const result = evaluate('x = 10\n{"val": x}') as any;
    expect(result.val).toBe(10);
  });
});

// ── End-to-end test with complete.bon ───────────────────────

describe("End-to-End", () => {
  it("complete file", () => {
    const fixturePath = path.resolve(__dirname, "..", "..", "..", "tests", "fixtures", "complete.bon");
    if (fs.existsSync(fixturePath)) {
      const result = load(fixturePath) as any;
      // The complete.bon file has multiple top-level expressions
      // The last one is the main object with all test cases
      const mainResult = Array.isArray(result) ? result[result.length - 1] : result;
      expect(typeof mainResult).toBe("object");
      expect(mainResult.json_obj.a).toBe(1);
      expect(mainResult.upper).toBe("HELLO");
      expect(mainResult.map).toEqual([2, 4]);
      expect(mainResult.admin_age).toBe(36);
    }
  });
});

// ── Params Tests ────────────────────────────────────────

describe("Params", () => {
  it("param basic", () => {
    expect(evaluate('{"env": $env}', ".", { env: "test" })).toEqual({ env: "test" });
  });

  it("param number", () => {
    const result = evaluate('{"value": $num}', ".", { num: 42 }) as any;
    expect(result.value).toBe(42);
  });

  it("param in expression", () => {
    const result = evaluate('{"doubled": $x + $x}', ".", { x: 5 }) as any;
    expect(result.doubled).toBe(10);
  });

  it("param missing", () => {
    expect(() => evaluate('{"x": $missing}')).toThrow(EvalError);
  });
});

// ── If Expression Tests ────────────────────────────────────────

describe("If Expression", () => {
  it("if basic", () => {
    const result = evaluate('if (true) { "yes" } else { "no" }');
    expect(result).toBe("yes");
  });

  it("if false", () => {
    const result = evaluate('if (false) { "yes" } else { "no" }');
    expect(result).toBe("no");
  });

  it("if no else", () => {
    const result = evaluate('if (false) { "yes" }');
    expect(result).toBe(null);
  });

  it("if with comparison", () => {
    const result = evaluate('if (5 > 3) { "greater" } else { "not greater" }') as any;
    expect(result).toBe("greater");
  });

  it("if else if", () => {
    const result = evaluate('if (false) { "a" } else { if (true) { "b" } else { "c" } }') as any;
    expect(result).toBe("b");
  });
});

// ── For Loop Tests ────────────────────────────────────────

describe("For Loop", () => {
  it("for array", () => {
    const result = evaluate('for x in [1, 2, 3] { x * 2 }') as any;
    expect(result).toEqual([2, 4, 6]);
  });

  it("for empty array", () => {
    const result = evaluate('for x in [] { x }');
    expect(result).toEqual([]);
  });

  it("for object", () => {
    const result = evaluate('for v in {"a": 1, "b": 2} { v }') as any;
    expect(result.sort()).toEqual([1, 2]);
  });

  it("for in object literal", () => {
    const result = evaluate('{"outputs": for x in [1, 2, 3, 4, 5] { if (x > 3) { x } else { 10 - x } }}') as any;
    expect(result.outputs).toEqual([9, 8, 7, 4, 5]);
  });
});
