"""Comprehensive tests for BON Python implementation."""

import json
import os
import sys

import pytest

# Add parent dir to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from bon_py.evaluator import EvalError, evaluate, load
from bon_py.lexer import Lexer, LexerError, TokenType
from bon_py.parser import Parser, ParseError, parse
from bon_py.ast_nodes import (
    ArrayLit, BinaryOp, ClassDef, ClassInstance, FuncCall, FuncDef,
    Identifier, Literal, MethodCall, ObjectLit, TemplateDef, TemplateRef,
)


# ── Lexer Tests ──────────────────────────────────────────────

class TestLexer:
    def test_empty(self):
        tokens = Lexer("").tokens()
        assert tokens[-1].type == TokenType.EOF

    def test_string(self):
        tokens = Lexer('"hello"').tokens()
        assert tokens[0].type == TokenType.STRING
        assert tokens[0].value == "hello"

    def test_string_escape(self):
        tokens = Lexer(r'"line\n1"').tokens()
        assert tokens[0].value == "line\n1"

    def test_string_unicode(self):
        tokens = Lexer(r'"\u0041"').tokens()
        assert tokens[0].value == "A"

    def test_number_int(self):
        tokens = Lexer("42").tokens()
        assert tokens[0].type == TokenType.NUMBER
        assert tokens[0].value == 42

    def test_number_float(self):
        tokens = Lexer("3.14").tokens()
        assert tokens[0].type == TokenType.NUMBER
        assert tokens[0].value == 3.14

    def test_number_negative(self):
        tokens = Lexer("-5").tokens()
        assert tokens[0].type == TokenType.NUMBER
        assert tokens[0].value == -5

    def test_number_scientific(self):
        tokens = Lexer("1e3").tokens()
        assert tokens[0].type == TokenType.NUMBER
        assert tokens[0].value == 1000.0

    def test_true_false_null(self):
        tokens = Lexer("true false null").tokens()
        assert tokens[0].type == TokenType.TRUE
        assert tokens[1].type == TokenType.FALSE
        assert tokens[2].type == TokenType.NULL

    def test_identifiers(self):
        tokens = Lexer("foo _bar baz123").tokens()
        assert tokens[0].type == TokenType.IDENT
        assert tokens[0].value == "foo"
        assert tokens[1].type == TokenType.IDENT
        assert tokens[2].type == TokenType.IDENT

    def test_keywords(self):
        tokens = Lexer("class extends fn return import as").tokens()
        assert tokens[0].type == TokenType.CLASS
        assert tokens[1].type == TokenType.EXTENDS
        assert tokens[2].type == TokenType.FN
        assert tokens[3].type == TokenType.RETURN
        assert tokens[4].type == TokenType.IMPORT
        assert tokens[5].type == TokenType.AS

    def test_punctuation(self):
        tokens = Lexer("{ } [ ] : , . ( ) = + - * / %").tokens()
        types = [t.type for t in tokens[:-1]]
        assert types == [
            TokenType.LBRACE, TokenType.RBRACE, TokenType.LBRACKET, TokenType.RBRACKET,
            TokenType.COLON, TokenType.COMMA, TokenType.DOT, TokenType.LPAREN, TokenType.RPAREN,
            TokenType.EQUALS, TokenType.PLUS, TokenType.DASH, TokenType.STAR, TokenType.SLASH, TokenType.PERCENT,
        ]

    def test_comments(self):
        src = '# line comment\n"hello" // inline'
        tokens = Lexer(src).tokens()
        assert tokens[0].type == TokenType.STRING
        assert tokens[0].value == "hello"

    def test_template_ref(self):
        tokens = Lexer("{my_template}").tokens()
        assert tokens[0].type == TokenType.TEMPLATE_OPEN
        assert tokens[0].value == "my_template"

    def test_invalid_char(self):
        with pytest.raises(LexerError):
            Lexer("~").tokens()


# ── Parser Tests ─────────────────────────────────────────────

class TestParser:
    def test_literal_string(self):
        prog = parse('"hello"')
        assert len(prog.body) == 1
        assert isinstance(prog.body[0], Literal)

    def test_literal_number(self):
        prog = parse("42")
        assert isinstance(prog.body[0], Literal)
        assert prog.body[0].value == 42

    def test_array(self):
        prog = parse("[1, 2, 3]")
        assert isinstance(prog.body[0], ArrayLit)
        assert len(prog.body[0].elements) == 3

    def test_object(self):
        prog = parse('{"a": 1, "b": 2}')
        assert isinstance(prog.body[0], ObjectLit)

    def test_template_def(self):
        prog = parse('my_tpl-{"x": 1}')
        assert "my_tpl" in prog.templates

    def test_template_ref(self):
        prog = parse('my_tpl-{"x": 1}\n{"val": {my_tpl}}')
        assert "my_tpl" in prog.templates

    def test_class_def(self):
        src = 'class Foo { "x": 1 }'
        prog = parse(src)
        assert "Foo" in prog.classes

    def test_class_with_method(self):
        src = 'class Foo { fn bar() { return 1 } }'
        prog = parse(src)
        assert "bar" in prog.classes["Foo"].methods

    def test_class_inheritance(self):
        src = 'class A { "x": 1 }\nclass B extends A { "y": 2 }'
        prog = parse(src)
        assert prog.classes["B"].parent == "A"

    def test_import(self):
        src = 'import "other.bon"\n{"a": 1}'
        prog = parse(src)
        assert len(prog.imports) == 1

    def test_import_alias(self):
        src = 'import "other.bon" as X\n{"a": 1}'
        prog = parse(src)
        assert prog.imports[0].alias == "X"

    def test_variable_assign(self):
        prog = parse('x = 42\n{"val": x}')
        assert "x" in prog.variables

    def test_binary_op(self):
        prog = parse("1 + 2")
        assert isinstance(prog.body[0], BinaryOp)

    def test_method_call(self):
        prog = parse('Foo {"x": 1}.bar()')
        assert isinstance(prog.body[0], MethodCall)

    def test_anonymous_fn(self):
        prog = parse('fn(x) { return x }')
        assert isinstance(prog.body[0], FuncDef)


# ── Evaluator Tests ──────────────────────────────────────────

class TestEvaluator:
    def test_json_passthrough(self):
        src = '{"a": 1, "b": [1, 2, 3], "c": null, "d": true}'
        result = evaluate(src)
        assert result == {"a": 1, "b": [1, 2, 3], "c": None, "d": True}

    def test_template_expansion(self):
        src = 'base-{"cpu": "250m"}\n{"res": {base}}'
        result = evaluate(src)
        assert result["res"]["cpu"] == "250m"

    def test_template_deep_copy(self):
        src = 't-{"x": 1}\n{"a": {t}, "b": {t}}'
        result = evaluate(src)
        result["a"]["x"] = 999
        assert result["b"]["x"] == 1  # independent copy

    def test_class_basic(self):
        src = 'class Foo { "x": 1, "y": 2 }\n{"obj": Foo {}}'
        result = evaluate(src)
        assert result["obj"]["x"] == 1

    def test_class_override(self):
        src = 'class Foo { "x": 1 }\n{"obj": Foo { "x": 10 }}'
        result = evaluate(src)
        assert result["obj"]["x"] == 10

    def test_class_method(self):
        src = '''
class Math {
    fn add(a, b) { return a + b }
}
{"result": Math {}.add(3, 4)}
'''
        result = evaluate(src)
        assert result["result"] == 7

    def test_class_self_reference(self):
        src = '''
class Person {
    "name": "Bob",
    "greeting": "Hello, " + self.name
}
{"p": Person {}}
'''
        result = evaluate(src)
        assert result["p"]["greeting"] == "Hello, Bob"

    def test_class_inheritance(self):
        src = '''
class Animal { "type": "unknown" }
class Dog extends Animal { "type": "canine" }
{"pet": Dog {}}
'''
        result = evaluate(src)
        assert result["pet"]["type"] == "canine"

    def test_class_computed_property(self):
        src = '''
class Rect {
    "w": 3,
    "h": 4,
    "area": self.w * self.h
}
{"r": Rect {}}
'''
        result = evaluate(src)
        assert result["r"]["area"] == 12

    def test_std_upper(self):
        assert evaluate('std.upper("hello")') == "HELLO"

    def test_std_lower(self):
        assert evaluate('std.lower("WORLD")') == "world"

    def test_std_trim(self):
        assert evaluate('std.trim("  hi  ")') == "hi"

    def test_std_split(self):
        assert evaluate('std.split("a,b,c", ",")') == ["a", "b", "c"]

    def test_std_replace(self):
        assert evaluate('std.replace("foo bar", "bar", "baz")') == "foo baz"

    def test_std_len_string(self):
        assert evaluate('std.len("hello")') == 5

    def test_std_len_array(self):
        assert evaluate('std.len([1, 2, 3])') == 3

    def test_std_at(self):
        assert evaluate('std.at([10, 20, 30], -1)') == 30

    def test_std_first(self):
        assert evaluate('std.first([5, 6])') == 5

    def test_std_last(self):
        assert evaluate('std.last([5, 6])') == 6

    def test_std_map(self):
        assert evaluate('std.map([1, 2], fn(x) { return x * 2 })') == [2, 4]

    def test_std_filter(self):
        assert evaluate('std.filter([1, 2, 3], fn(x) { return x > 1 })') == [2, 3]

    def test_std_reduce(self):
        assert evaluate('std.reduce([1, 2, 3], 0, fn(a, b) { return a + b })') == 6

    def test_std_concat(self):
        assert evaluate('std.concat([1], [2])') == [1, 2]

    def test_std_merge(self):
        assert evaluate('std.merge({"a": 1}, {"b": 2})') == {"a": 1, "b": 2}

    def test_std_keys(self):
        assert evaluate('std.keys({"a": 1, "b": 2})') == ["a", "b"]

    def test_std_values(self):
        vals = evaluate('std.values({"a": 1, "b": 2})')
        assert sorted(vals) == [1, 2]

    def test_std_to_string(self):
        assert evaluate('std.to_string(123)') == "123"
        assert evaluate('std.to_string(true)') == "true"

    def test_std_to_number(self):
        assert evaluate('std.to_number("42.5")') == 42.5

    def test_std_type_of(self):
        assert evaluate('std.type_of([1])') == "array"
        assert evaluate('std.type_of("hi")') == "string"

    def test_binary_add(self):
        assert evaluate("1 + 2") == 3

    def test_binary_sub(self):
        assert evaluate("10 - 3") == 7

    def test_binary_mul(self):
        assert evaluate("4 * 5") == 20

    def test_binary_div(self):
        assert evaluate("10 / 2") == 5

    def test_binary_mod(self):
        assert evaluate("10 % 3") == 1

    def test_string_concat(self):
        assert evaluate('"hello" + " " + "world"') == "hello world"

    def test_unary_neg(self):
        assert evaluate("-5") == -5

    def test_nested_object(self):
        assert evaluate('{"a": {"b": {"c": 42}}}')['a']['b']['c'] == 42

    def test_division_by_zero(self):
        with pytest.raises(EvalError, match="Division by zero"):
            evaluate("1 / 0")

    def test_undefined_template(self):
        with pytest.raises(EvalError, match="Undefined template"):
            evaluate("{nope}")

    def test_undefined_class(self):
        with pytest.raises(EvalError, match="Undefined class"):
            evaluate("Nope {}")

    def test_type_error(self):
        with pytest.raises(EvalError, match="E007"):
            evaluate('"a" - "b"')

    def test_variable_assign(self):
        result = evaluate('x = 10\n{"val": x}')
        assert result["val"] == 10


# ── End-to-end test with complete.bon ───────────────────────

class TestEndToEnd:
    def test_complete_file(self):
        fixture_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "..", "tests", "fixtures", "complete.bon"
        )
        if os.path.exists(fixture_path):
            result = load(fixture_path)
            # The complete.bon file has multiple top-level expressions
            # The last one is the main object with all test cases
            if isinstance(result, list):
                result = result[-1]  # Get the last (main) object
            assert isinstance(result, dict)
            assert result["json_obj"]["a"] == 1
            assert result["upper"] == "HELLO"
            assert result["map"] == [2, 4]
            assert result["admin_age"] == 36
