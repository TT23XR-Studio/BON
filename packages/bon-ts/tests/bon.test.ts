import { describe, it, expect } from "vitest";
import { Lexer, TokenType, LexerError } from "../src/lexer.js";
import { Parser, ParseError, parse } from "../src/parser.js";
import { evaluate, EvalError, load } from "../src/evaluator.js";
import type {
  ArrayLit, BinaryOp, ClassDef, FuncDef, Identifier, Literal,
  MethodCall, ObjectLit, TemplateDef, TemplateRef,
} from "../src/ast.js";
import * as path from "node:path";
import * as url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// ── Lexer Tests ──────────────────────────────────────────────

describe("Lexer", () => {
  it("empty", () => {
    const tokens = new Lexer("").tokens();
    expect(tokens[tokens.length - 1].type).toBe("EOF");
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

  it("true false null", () => {
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

  it("range operator ..", () => {
    const tokens = new Lexer("0..3").tokens();
    expect(tokens[0].type).toBe("NUMBER");
    expect(tokens[0].value).toBe(0);
    expect(tokens[1].type).toBe("DOT_DOT");
    expect(tokens[2].type).toBe("NUMBER");
    expect(tokens[2].value).toBe(3);
  });

  it("param $var", () => {
    const tokens = new Lexer("$env").tokens();
    expect(tokens[0].type).toBe("PARAM");
    expect(tokens[0].value).toBe("env");
  });
});

// ── Parser Tests ─────────────────────────────────────────────

describe("Parser", () => {
  it("literal string", () => {
    const prog = parse('"hello"');
    expect(prog.body.length).toBe(1);
  });

  it("literal number", () => {
    const prog = parse("42");
    expect(prog.body[0].kind === "Literal");
  });

  it("array", () => {
    const prog = parse("[1, 2, 3]");
    expect(prog.body[0].kind).toBe("ArrayLit");
    expect((prog.body[0] as ArrayLit).elements.length).toBe(3);
  });

  it("object", () => {
    const prog = parse('{"a": 1, "b": 2}');
    expect(prog.body[0].kind).toBe("ObjectLit");
  });

  it("template def", () => {
    const prog = parse('my_tpl-{"x": 1}');
    expect(prog.templates["my_tpl"]).toBeDefined();
  });

  it("template ref", () => {
    const prog = parse('my_tpl-{"x": 1}\n{"val": {my_tpl}}');
    expect(prog.templates["my_tpl"]).toBeDefined();
  });

  it("class def", () => {
    const src = 'class Foo { "x": 1 }';
    const prog = parse(src);
    expect(prog.classes["Foo"]).toBeDefined();
  });

  it("class with method", () => {
    const src = 'class Foo { fn bar() { return 1 } }';
    const prog = parse(src);
    expect(prog.classes["Foo"].methods["bar"]).toBeDefined();
  });

  it("class inheritance", () => {
    const src = 'class A { "x": 1 }\nclass B extends A { "y": 2 }';
    const prog = parse(src);
    expect(prog.classes["B"].parent).toBe("A");
  });

  it("import", () => {
    const src = 'import "other.bon"\n{"a": 1}';
    const prog = parse(src);
    expect(prog.imports.length).toBe(1);
  });

  it("import alias", () => {
    const src = 'import "other.bon" as X\n{"a": 1}';
    const prog = parse(src);
    expect(prog.imports[0].alias).toBe("X");
  });

  it("variable assign", () => {
    const prog = parse('x = 42\n{"val": x}');
    expect(prog.variables["x"]).toBeDefined();
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

  it("$var assignment prohibition", () => {
    expect(() => parse('$x = 5')).toThrow(ParseError);
  });

  it("range expression", () => {
    const prog = parse("for i in 0..3 { i }");
    expect(prog.body[0].kind).toBe("ForLoop");
  });

  it("for key-value", () => {
    const prog = parse('for k, v in {"a": 1} { k }');
    expect(prog.body[0].kind).toBe("ForLoop");
  });
});

// ── Evaluator Tests ──────────────────────────────────────────

describe("Evaluator", () => {
  it("json passthrough", () => {
    const src = '{"a": 1, "b": [1, 2, 3], "c": null, "d": true}';
    expect(evaluate(src)).toEqual({ a: 1, b: [1, 2, 3], c: null, d: true });
  });

  it("template expansion", () => {
    const src = 'base-{"cpu": "250m"}\n{"res": {base}}';
    const result = evaluate(src) as Record<string, any>;
    expect(result.res.cpu).toBe("250m");
  });

  it("template deep copy", () => {
    const src = 't-{"x": 1}\n{"a": {t}, "b": {t}}';
    const result = evaluate(src) as Record<string, any>;
    result.a.x = 999;
    expect(result.b.x).toBe(1);
  });

  it("class basic", () => {
    const src = 'class Foo { "x": 1, "y": 2 }\n{"obj": Foo {}}';
    const result = evaluate(src) as Record<string, any>;
    expect(result.obj.x).toBe(1);
  });

  it("class override", () => {
    const src = 'class Foo { "x": 1 }\n{"obj": Foo { "x": 10 }}';
    const result = evaluate(src) as Record<string, any>;
    expect(result.obj.x).toBe(10);
  });

  it("class method", () => {
    const src = `
class Math {
  fn add(a, b) { return a + b }
}
{"result": Math {}.add(3, 4)}
`;
    const result = evaluate(src) as Record<string, any>;
    expect(result.result).toBe(7);
  });

  it("class self reference", () => {
    const src = `
class Person {
  "name": "Bob",
  "greeting": "Hello, " + self.name
}
{"p": Person {}}
`;
    const result = evaluate(src) as Record<string, any>;
    expect(result.p.greeting).toBe("Hello, Bob");
  });

  it("class inheritance", () => {
    const src = `
class Animal { "type": "unknown" }
class Dog extends Animal { "type": "canine" }
{"pet": Dog {}}
`;
    const result = evaluate(src) as Record<string, any>;
    expect(result.pet.type).toBe("canine");
  });

  it("class computed property", () => {
    const src = `
class Rect {
  "w": 3,
  "h": 4,
  "area": self.w * self.h
}
{"r": Rect {}}
`;
    const result = evaluate(src) as Record<string, any>;
    expect(result.r.area).toBe(12);
  });

  // ── Std lib tests ──

  it("std upper", () => {
    expect(evaluate('std.upper("hello")')).toBe("HELLO");
  });

  it("std lower", () => {
    expect(evaluate('std.lower("WORLD")')).toBe("world");
  });

  it("std trim", () => {
    expect(evaluate('std.trim("  hi  ")')).toBe("hi");
  });

  it("std split", () => {
    expect(evaluate('std.split("a,b,c", ",")')).toEqual(["a", "b", "c"]);
  });

  it("std replace", () => {
    expect(evaluate('std.replace("foo bar", "bar", "baz")')).toBe("foo baz");
  });

  it("std len string", () => {
    expect(evaluate('std.len("hello")')).toBe(5);
  });

  it("std len array", () => {
    expect(evaluate("std.len([1, 2, 3])")).toBe(3);
  });

  it("std at", () => {
    expect(evaluate("std.at([10, 20, 30], -1)")).toBe(30);
  });

  it("std first", () => {
    expect(evaluate("std.first([5, 6])")).toBe(5);
  });

  it("std last", () => {
    expect(evaluate("std.last([5, 6])")).toBe(6);
  });

  it("std map", () => {
    expect(evaluate("std.map([1, 2], fn(x) { return x * 2 })")).toEqual([2, 4]);
  });

  it("std filter", () => {
    expect(evaluate("std.filter([1, 2, 3], fn(x) { return x > 1 })")).toEqual([2, 3]);
  });

  it("std reduce", () => {
    expect(evaluate("std.reduce([1, 2, 3], 0, fn(a, b) { return a + b })")).toBe(6);
  });

  it("std concat", () => {
    expect(evaluate("std.concat([1], [2])")).toEqual([1, 2]);
  });

  it("std merge", () => {
    expect(evaluate('std.merge({"a": 1}, {"b": 2})')).toEqual({ a: 1, b: 2 });
  });

  it("std keys", () => {
    expect(evaluate('std.keys({"a": 1, "b": 2})')).toEqual(["a", "b"]);
  });

  it("std values", () => {
    const vals = evaluate('std.values({"a": 1, "b": 2})') as string[];
    expect(vals.sort()).toEqual([1, 2]);
  });

  it("std to_string", () => {
    expect(evaluate("std.to_string(123)")).toBe("123");
    expect(evaluate("std.to_string(true)")).toBe("true");
  });

  it("std to_number", () => {
    expect(evaluate('std.to_number("42.5")')).toBe(42.5);
  });

  it("std type_of", () => {
    expect(evaluate("std.type_of([1])")).toBe("array");
    expect(evaluate('std.type_of("hi")')).toBe("string");
  });

  // ── Operators ──

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
    const result = evaluate('{"a": {"b": {"c": 42}}}') as Record<string, any>;
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
    const result = evaluate('x = 10\n{"val": x}') as Record<string, any>;
    expect(result.val).toBe(10);
  });
});

// ── Params ───────────────────────────────────────────────────

describe("Params", () => {
  it("param basic", () => {
    const result = evaluate('{"env": $env}', ".", { env: "prod" });
    expect(result).toEqual({ env: "prod" });
  });

  it("param number", () => {
    const result = evaluate('{"replicas": $replicas}', ".", { replicas: 5 });
    expect(result).toEqual({ replicas: 5 });
  });

  it("param in expression", () => {
    const result = evaluate("std.to_string($count)", ".", { count: 42 });
    expect(result).toBe("42");
  });

  it("param missing", () => {
    expect(() => evaluate('{"env": $missing}')).toThrow(EvalError);
    expect(() => evaluate('{"env": $missing}')).toThrow(/E009/);
  });
});

// ── If Expression ────────────────────────────────────────────

describe("IfExpr", () => {
  it("if basic", () => {
    expect(evaluate('if (true) { "yes" } else { "no" }')).toBe("yes");
  });

  it("if false", () => {
    expect(evaluate('if (false) { "yes" } else { "no" }')).toBe("no");
  });

  it("if no else in object", () => {
    const result = evaluate('{"val": if (false) { "yes" } }');
    expect(result).toEqual({});
  });

  it("if with comparison", () => {
    expect(evaluate('if (1 > 2) { "big" } else { "small" }')).toBe("small");
  });

  it("if else if", () => {
    expect(evaluate('if (false) { "a" } else if (true) { "b" } else { "c" }')).toBe("b");
  });

  it("if no else in expr context errors", () => {
    expect(() => evaluate('if (false) { "yes" }')).toThrow(EvalError);
    expect(() => evaluate('if (false) { "yes" }')).toThrow(/E011/);
  });
});

// ── Conditional Block ────────────────────────────────────────

describe("ConditionalBlock", () => {
  it("if block true", () => {
    const result = evaluate('{"name": "app", if true { "debug": true }}') as Record<string, any>;
    expect(result).toEqual({ name: "app", debug: true });
  });

  it("if block false", () => {
    const result = evaluate('{"name": "app", if false { "debug": true }}') as Record<string, any>;
    expect(result).toEqual({ name: "app" });
  });

  it("if block true multiple", () => {
    const result = evaluate('{"name": "app", if true { "debug": true, "verbose": false }}') as Record<string, any>;
    expect(result).toEqual({ name: "app", debug: true, verbose: false });
  });

  it("if block false no else", () => {
    const result = evaluate('{"name": "app", if false { "debug": true, "verbose": false }}') as Record<string, any>;
    expect(result).toEqual({ name: "app" });
  });

  it("if block with else", () => {
    const result = evaluate('{"name": "app", if false { "debug": true } else { "debug": false }}') as Record<string, any>;
    expect(result).toEqual({ name: "app", debug: false });
  });

  it("if block else multiple", () => {
    const result = evaluate('{"name": "app", if false { "debug": true, "verbose": false } else { "debug": false, "verbose": true }}') as Record<string, any>;
    expect(result).toEqual({ name: "app", debug: false, verbose: true });
  });

  it("if block with params", () => {
    const result = evaluate('{"name": "app", if ($env == "dev") { "debug": true } else { "debug": false }}', ".", { env: "dev" }) as Record<string, any>;
    expect(result).toEqual({ name: "app", debug: true });
  });

  it("if block with params prod", () => {
    const result = evaluate('{"name": "app", if ($env == "dev") { "debug": true } else { "debug": false }}', ".", { env: "prod" }) as Record<string, any>;
    expect(result).toEqual({ name: "app", debug: false });
  });

  it("multiple conditional blocks", () => {
    const result = evaluate(
      '{ "name": "app", if ($env == "dev") { "debug": true }, if ($feature_x) { "x": "enabled" } }',
      ".", { env: "dev", feature_x: true }
    ) as Record<string, any>;
    expect(result).toEqual({ name: "app", debug: true, x: "enabled" });
  });
});

// ── For Loop ─────────────────────────────────────────────────

describe("ForLoop", () => {
  it("for array", () => {
    const result = evaluate('{"outputs": for x in [1, 2, 3] { x * 2 }}') as Record<string, any>;
    expect(result.outputs).toEqual([2, 4, 6]);
  });

  it("for empty array", () => {
    const result = evaluate('{"outputs": for x in [] { x }}') as Record<string, any>;
    expect(result.outputs).toEqual([]);
  });

  it("for object key-value", () => {
    const result = evaluate('for k, v in {"a": 1} { "result": v }') as Record<string, any>;
    expect(result).toEqual({ result: 1 });
  });

  it("for object key-value computed keys", () => {
    const result = evaluate(
      '{"reports": for name, score in {"alice": 10, "bob": 20} { name + "_report": "Score is " + std.to_string(score) }}'
    ) as Record<string, any>;
    expect(result.reports).toEqual({
      alice_report: "Score is 10",
      bob_report: "Score is 20",
    });
  });

  it("for range", () => {
    const result = evaluate('{"subnets": for i in 0..3 { "10.0." + std.to_string(i) + ".0/24" }}') as Record<string, any>;
    expect(result.subnets).toEqual(["10.0.0.0/24", "10.0.1.0/24", "10.0.2.0/24"]);
  });
});

// ── Error Codes ──────────────────────────────────────────────

describe("ErrorCodes", () => {
  it("E009: missing parameter", () => {
    expect(() => evaluate('{"env": $missing}')).toThrowError(/E009/);
    expect(() => evaluate('{"env": $missing}')).toThrowError(/Missing parameter/);
  });

  it("E010: iteration limit exceeded", () => {
    expect(() => evaluate("for i in 0..15000 { i }")).toThrowError(/E010/);
    expect(() => evaluate("for i in 0..15000 { i }")).toThrowError(/10000/);
  });

  it("truthiness: number zero is false", () => {
    expect(evaluate('if (0) { "yes" } else { "no" }')).toBe("no");
  });

  it("truthiness: number non-zero is true", () => {
    expect(evaluate('if (1) { "yes" } else { "no" }')).toBe("yes");
  });

  it("truthiness: empty string is false", () => {
    expect(evaluate('if ("") { "yes" } else { "no" }')).toBe("no");
  });

  it("truthiness: non-empty string is true", () => {
    expect(evaluate('if ("x") { "yes" } else { "no" }')).toBe("yes");
  });

  it("truthiness: null is false", () => {
    expect(evaluate('if (null) { "yes" } else { "no" }')).toBe("no");
  });

  it("truthiness: empty array is false", () => {
    expect(evaluate('if ([]) { "yes" } else { "no" }')).toBe("no");
  });

  it("truthiness: non-empty array is true", () => {
    expect(evaluate('if ([1]) { "yes" } else { "no" }')).toBe("yes");
  });

  it("truthiness: empty object is false", () => {
    expect(evaluate('if ({}) { "yes" } else { "no" }')).toBe("no");
  });

  it("truthiness: non-empty object is true", () => {
    expect(evaluate('if ({"a": 1}) { "yes" } else { "no" }')).toBe("yes");
  });

  it("E011: if without else in expression context", () => {
    expect(() => evaluate('if (false) { "yes" }')).toThrowError(/E011/);
    expect(() => evaluate('if (false) { "yes" }')).toThrowError(/without else/);
  });

  it("E011: for loop requires iterable", () => {
    expect(() => evaluate('for x in "not iterable" { x }')).toThrowError(/E011/);
  });

  it("E011: $ param as object key must be string", () => {
    expect(() => evaluate("{$bad: 1}", ".", { bad: 42 })).toThrowError(/E011/);
  });
});

// ── End-to-end ───────────────────────────────────────────────

describe("EndToEnd", () => {
  it("complete file", () => {
    const fixturePath = path.resolve(__dirname, "..", "..", "..", "tests", "fixtures", "complete.bon");
    const result = load(fixturePath, { env: "prod", feature: true, version: "v1.0", service_name: "api" });
    const obj = Array.isArray(result) ? result[result.length - 1] : result;
    expect(obj).toBeTypeOf("object");
    expect((obj as Record<string, any>).json_obj.a).toBe(1);
    expect((obj as Record<string, any>).upper).toBe("HELLO");
    expect((obj as Record<string, any>).map).toEqual([2, 4]);
    expect((obj as Record<string, any>).admin_age).toBe(36);
  });
});
