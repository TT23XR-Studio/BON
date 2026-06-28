"""BON Parser - Parses token stream into AST."""

from __future__ import annotations

from .ast_nodes import (
    ArrayLit, BinaryOp, ClassDef, ClassInstance, ConditionalBlock, Expression, FuncCall,
    FuncDef, Identifier, ImportStmt, Literal, MethodCall, MethodDef,
    ObjectLit, Param, Position, Program, PropertyAccess, ReturnStmt, TemplateDef,
    TemplateRef, UnaryOp, VariableAssign, IfExpr, ForLoop, Range,
)
from .lexer import Lexer, Token, TokenType


class ParseError(Exception):
    def __init__(self, message: str, token: Token):
        super().__init__(f"Parse error at line {token.line}, column {token.column}: {message}")
        self.token = token


class Parser:
    """Parses BON tokens into an AST."""

    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.pos = 0

    def _current(self) -> Token:
        return self.tokens[self.pos]

    def _peek(self, offset: int = 0) -> Token:
        idx = self.pos + offset
        if idx < len(self.tokens):
            return self.tokens[idx]
        return self.tokens[-1]  # EOF

    def _advance(self) -> Token:
        tok = self.tokens[self.pos]
        if self.pos < len(self.tokens) - 1:
            self.pos += 1
        return tok

    def _expect(self, tt: TokenType) -> Token:
        tok = self._current()
        if tok.type != tt:
            raise ParseError(f"Expected {tt.name}, got {tok.type.name} ({tok.value!r})", tok)
        return self._advance()

    def _match(self, *types: TokenType) -> Token | None:
        if self._current().type in types:
            return self._advance()
        return None

    def _pos(self) -> Position:
        tok = self._current()
        return Position(tok.line, tok.column)

    def _parse_obj_key(self) -> str:
        """Parse an object key as string (ident, string, or $param)."""
        tok = self._current()
        if tok.type == TokenType.STRING:
            self._advance()
            return str(tok.value)
        if tok.type == TokenType.PARAM:
            # $param as object key - return marker for later resolution
            param_name = str(tok.value)
            self._advance()
            return f"__param_key__{param_name}"
        return self._expect(TokenType.IDENT).value

    def _parse_obj_key_expr(self) -> Any:
        """Parse an object key as expression node (string, param, ident, or computed)."""
        tok = self._current()
        if tok.type == TokenType.STRING:
            pos = self._pos()
            self._advance()
            return Literal(str(tok.value), pos)
        if tok.type == TokenType.PARAM:
            pos = self._pos()
            self._advance()
            return Param(tok.value, pos)
        return Identifier(self._expect(TokenType.IDENT).value, self._pos())

    # ── Top-level ────────────────────────────────────────────

    def parse(self) -> Program:
        imports: list[ImportStmt] = []
        templates: dict[str, TemplateDef] = {}
        classes: dict[str, ClassDef] = {}
        variables: dict[str, VariableAssign] = {}
        body: list[Expression] = []

        # Parse imports first
        while self._current().type == TokenType.IMPORT:
            imports.append(self._parse_import())

        # Parse top-level definitions
        while self._current().type != TokenType.EOF:
            tok = self._current()

            if tok.type == TokenType.IDENT:
                # Check for template def: name-{ ... }
                if self._peek(1).type == TokenType.DASH and self._peek(2).type == TokenType.LBRACE:
                    td = self._parse_template_def_no_braces()
                    templates[td.name] = td
                    continue

                # Check for variable assignment: name = expr
                if self._peek(1).type == TokenType.EQUALS:
                    va = self._parse_variable_assign()
                    variables[va.name] = va
                    continue

                # Otherwise it's an expression
                body.append(self._parse_expression())
                continue

            if tok.type == TokenType.CLASS:
                cd = self._parse_class_def()
                classes[cd.name] = cd
                continue

            # Top-level expression (e.g., object literal)
            body.append(self._parse_expression())

        return Program(imports, templates, classes, variables, body)

    # ── Import ───────────────────────────────────────────────

    def _parse_import(self) -> ImportStmt:
        pos = self._pos()
        self._expect(TokenType.IMPORT)
        path_tok = self._expect(TokenType.STRING)
        alias: str | None = None
        if self._match(TokenType.AS):
            alias = self._expect(TokenType.IDENT).value
        return ImportStmt(str(path_tok.value), alias, pos)

    # ── Template ─────────────────────────────────────────────

    def _parse_template_def(self) -> TemplateDef:
        pos = self._pos()
        name = self._expect(TokenType.IDENT).value
        self._expect(TokenType.DASH)
        # The body is an expression (can be object literal, array, etc.)
        # Syntax: name-{ body }
        # The {} are part of the template syntax, but body can also contain {}
        # So we parse: IDENT - LBRACE <expr> RBRACE
        # The <expr> is the body, which can be an object literal like {"x": 1}
        self._expect(TokenType.LBRACE)
        body = self._parse_expression()
        self._expect(TokenType.RBRACE)
        return TemplateDef(name, body, pos)

    def _parse_template_def_no_braces(self) -> TemplateDef:
        """Parse template definition without consuming {} delimiters."""
        pos = self._pos()
        name = self._expect(TokenType.IDENT).value
        self._expect(TokenType.DASH)
        # The body is an expression (can be object literal, array, etc.)
        # No {} delimiters - just parse the expression directly
        body = self._parse_expression()
        return TemplateDef(name, body, pos)

    # ── Class ────────────────────────────────────────────────

    def _parse_class_def(self) -> ClassDef:
        pos = self._pos()
        self._expect(TokenType.CLASS)
        name = self._expect(TokenType.IDENT).value

        parent: str | None = None
        if self._match(TokenType.EXTENDS):
            parent = self._expect(TokenType.IDENT).value

        self._expect(TokenType.LBRACE)
        members: dict[str, Expression] = {}
        methods: dict[str, MethodDef] = {}

        while self._current().type != TokenType.RBRACE:
            if self._current().type == TokenType.FN:
                md = self._parse_method_def()
                methods[md.name] = md
            else:
                key = self._parse_obj_key()
                self._expect(TokenType.COLON)
                val = self._parse_expression()
                members[key] = val

            # Handle trailing comma
            self._match(TokenType.COMMA)

        self._expect(TokenType.RBRACE)
        return ClassDef(name, parent, members, methods, pos)

    def _parse_method_def(self) -> MethodDef:
        pos = self._pos()
        self._expect(TokenType.FN)
        name = self._expect(TokenType.IDENT).value

        self._expect(TokenType.LPAREN)
        params: list[str] = []
        if self._current().type != TokenType.RPAREN:
            params.append(self._expect(TokenType.IDENT).value)
            while self._match(TokenType.COMMA):
                params.append(self._expect(TokenType.IDENT).value)
        self._expect(TokenType.RPAREN)

        self._expect(TokenType.LBRACE)
        body = self._parse_return_stmt()
        self._expect(TokenType.RBRACE)

        return MethodDef(name, params, body, pos)

    def _parse_return_stmt(self) -> ReturnStmt:
        pos = self._pos()
        self._expect(TokenType.RETURN)
        value = self._parse_expression()
        return ReturnStmt(value, pos)

    # ── Variable assignment ──────────────────────────────────

    def _parse_variable_assign(self) -> VariableAssign:
        pos = self._pos()
        name = self._expect(TokenType.IDENT).value
        self._expect(TokenType.EQUALS)
        value = self._parse_expression()
        return VariableAssign(name, value, pos)

    # ── Expressions ─────────────────────────────────────────────

    def _parse_expression(self) -> Expression:
        return self._parse_comparison()

    def _parse_comparison(self) -> Expression:
        left = self._parse_additive()
        while self._current().type in (
            TokenType.GT, TokenType.LT, TokenType.GTE, TokenType.LTE,
            TokenType.EQ_EQ, TokenType.BANG_EQ,
        ):
            op = self._advance().value
            right = self._parse_additive()
            left = BinaryOp(op, left, right, left.pos)
        return left

    def _parse_additive(self) -> Expression:
        left = self._parse_multiplicative()
        while self._current().type in (TokenType.PLUS, TokenType.DASH):
            op = self._advance().value
            right = self._parse_multiplicative()
            left = BinaryOp(op, left, right, left.pos)
        return left

    def _parse_multiplicative(self) -> Expression:
        left = self._parse_unary()
        while self._current().type in (TokenType.STAR, TokenType.SLASH, TokenType.PERCENT):
            op = self._advance().value
            right = self._parse_unary()
            left = BinaryOp(op, left, right, left.pos)
        return left

    def _parse_unary(self) -> Expression:
        if self._current().type == TokenType.MINUS:
            pos = self._pos()
            self._advance()
            operand = self._parse_unary()
            return UnaryOp("-", operand, pos)
        # if expression has lower precedence than unary
        if self._current().type == TokenType.IF:
            return self._parse_if_expr()
        return self._parse_postfix()

    def _parse_postfix(self) -> Expression:
        expr = self._parse_primary()

        while True:
            if self._current().type == TokenType.DOT:
                self._advance()
                prop = self._expect(TokenType.IDENT).value

                # Check for method call: obj.method(args)
                if self._current().type == TokenType.LPAREN:
                    self._advance()
                    args: list[Expression] = []
                    if self._current().type != TokenType.RPAREN:
                        args.append(self._parse_expression())
                        while self._match(TokenType.COMMA):
                            args.append(self._parse_expression())
                    self._expect(TokenType.RPAREN)
                    expr = MethodCall(expr, prop, args, expr.pos)
                else:
                    expr = PropertyAccess(expr, prop, expr.pos)
            else:
                break

        return expr

    def _parse_primary(self) -> Expression:
        tok = self._current()
        pos = self._pos()

        # Template reference
        if tok.type == TokenType.TEMPLATE_OPEN:
            self._advance()
            return TemplateRef(tok.value, pos)

        # Parameter reference
        if tok.type == TokenType.PARAM:
            self._advance()
            return Param(tok.value, pos)

        # String literal
        if tok.type == TokenType.STRING:
            self._advance()
            return Literal(str(tok.value), pos)

        # Number literal
        if tok.type == TokenType.NUMBER:
            self._advance()
            return Literal(tok.value, pos)

        # Boolean literals
        if tok.type == TokenType.TRUE:
            self._advance()
            return Literal(True, pos)
        if tok.type == TokenType.FALSE:
            self._advance()
            return Literal(False, pos)
        if tok.type == TokenType.NULL:
            self._advance()
            return Literal(None, pos)

        # Anonymous function: fn(params) { body }
        if tok.type == TokenType.FN:
            return self._parse_anonymous_fn()

        # for expression
        if tok.type == TokenType.FOR:
            return self._parse_for_loop()

        # Identifier or class instantiation
        if tok.type == TokenType.IDENT:
            self._advance()

            # Class instantiation: ClassName { ... }
            if self._current().type == TokenType.LBRACE:
                return self._parse_class_instantiation(tok.value, pos)

            # Function call: name(args)
            if self._current().type == TokenType.LPAREN:
                return self._parse_func_call_name(tok.value, pos)

            return Identifier(tok.value, pos)

        # Array literal
        if tok.type == TokenType.LBRACKET:
            return self._parse_array_literal()

        # Object literal
        if tok.type == TokenType.LBRACE:
            return self._parse_object_literal()

        # Parenthesized expression
        if tok.type == TokenType.LPAREN:
            self._advance()
            expr = self._parse_expression()
            self._expect(TokenType.RPAREN)
            return expr

        raise ParseError(f"Unexpected token: {tok.type.name} ({tok.value!r})", tok)

    def _parse_if_expr(self) -> IfExpr:
        pos = self._pos()
        self._expect(TokenType.IF)
        cond = self._parse_expression()
        self._expect(TokenType.LBRACE)
        then_expr = self._parse_expression()
        self._expect(TokenType.RBRACE)

        else_expr = None
        if self._peek().type == TokenType.ELSE:
            self._advance()  # consume ELSE
            if self._peek().type == TokenType.IF:
                self._advance()  # consume IF
                # else if chain - parse inline since we already consumed IF
                cond2 = self._parse_expression()
                self._expect(TokenType.LBRACE)
                then_expr2 = self._parse_expression()
                self._expect(TokenType.RBRACE)

                else_expr2 = None
                if self._peek().type == TokenType.ELSE:
                    self._advance()  # consume ELSE
                    self._expect(TokenType.LBRACE)
                    else_expr2 = self._parse_expression()
                    self._expect(TokenType.RBRACE)

                else_expr = IfExpr(cond2, then_expr2, else_expr2, pos)
            else:
                self._expect(TokenType.LBRACE)
                else_expr = self._parse_expression()
                self._expect(TokenType.RBRACE)

        return IfExpr(cond, then_expr, else_expr, pos)

    def _parse_conditional_block(self) -> ConditionalBlock:
        """Parse conditional block in object context: if (cond) { key: val, ... } else { ... }"""
        pos = self._pos()
        self._expect(TokenType.IF)
        cond = self._parse_expression()
        self._expect(TokenType.LBRACE)
        then_body: list[tuple[Any, Any]] = []
        while self._current().type != TokenType.RBRACE:
            key = self._parse_obj_key_expr()
            self._expect(TokenType.COLON)
            val = self._parse_expression()
            then_body.append((key, val))
            self._match(TokenType.COMMA)
        self._expect(TokenType.RBRACE)

        else_body = None
        if self._current().type == TokenType.ELSE:
            self._advance()
            self._expect(TokenType.LBRACE)
            else_body = []
            while self._current().type != TokenType.RBRACE:
                key = self._parse_obj_key_expr()
                self._expect(TokenType.COLON)
                val = self._parse_expression()
                else_body.append((key, val))
                self._match(TokenType.COMMA)
            self._expect(TokenType.RBRACE)

        return ConditionalBlock(cond, then_body, else_body, pos)

    def _parse_for_loop(self) -> ForLoop:
        pos = self._pos()
        self._expect(TokenType.FOR)
        var_name = self._expect(TokenType.IDENT).value
        var_name2 = None
        if self._match(TokenType.COMMA):
            var_name2 = self._expect(TokenType.IDENT).value
        self._expect(TokenType.IN)
        iterable = self._parse_range_or_expression()
        # Body is a single expression (may be object literal or just expression)
        body = self._parse_expression()
        return ForLoop(var_name, iterable, body, var_name2, pos)

    def _parse_range_or_expression(self) -> Expression:
        """Parse either a range (num..num) or a regular expression."""
        if self._current().type == TokenType.NUMBER and self._peek(1).type == TokenType.DOT_DOT:
            start_tok = self._advance()
            self._advance()
            end_tok = self._expect(TokenType.NUMBER)
            return Range(int(start_tok.value), int(end_tok.value), Position(start_tok.line, start_tok.column))
        return self._parse_expression()

    def _parse_anonymous_fn(self) -> FuncDef:
        pos = self._pos()
        self._expect(TokenType.FN)

        self._expect(TokenType.LPAREN)
        params: list[str] = []
        if self._current().type != TokenType.RPAREN:
            params.append(self._expect(TokenType.IDENT).value)
            while self._match(TokenType.COMMA):
                params.append(self._expect(TokenType.IDENT).value)
        self._expect(TokenType.RPAREN)

        self._expect(TokenType.LBRACE)
        body = self._parse_return_stmt()
        self._expect(TokenType.RBRACE)

        return FuncDef(params, body, pos)

    def _parse_class_instantiation(self, class_name: str, pos: Position) -> ClassInstance:
        self._expect(TokenType.LBRACE)
        overrides: dict[str, Expression] = {}

        while self._current().type != TokenType.RBRACE:
            key = self._parse_obj_key()
            self._expect(TokenType.COLON)
            val = self._parse_expression()
            overrides[key] = val
            self._match(TokenType.COMMA)

        self._expect(TokenType.RBRACE)
        return ClassInstance(class_name, overrides, pos)

    def _parse_array_literal(self) -> ArrayLit:
        pos = self._pos()
        self._expect(TokenType.LBRACKET)
        elements: list[Expression] = []

        if self._current().type != TokenType.RBRACKET:
            elements.append(self._parse_expression())
            while self._match(TokenType.COMMA):
                if self._current().type == TokenType.RBRACKET:
                    break
                elements.append(self._parse_expression())

        self._expect(TokenType.RBRACKET)
        return ArrayLit(elements, pos)

    def _parse_object_literal(self) -> ObjectLit:
        pos = self._pos()
        self._expect(TokenType.LBRACE)
        pairs: list[tuple[Any, Any]] = []
        conditions: list[ConditionalBlock] | None = None

        while self._current().type != TokenType.RBRACE:
            if self._current().type == TokenType.IF:
                block = self._parse_conditional_block()
                if conditions is None:
                    conditions = []
                conditions.append(block)
            else:
                # Try parsing as a key-value pair (expression followed by colon)
                saved_pos = self.pos
                key = self._parse_expression()
                if self._current().type == TokenType.COLON:
                    self._advance()
                    val = self._parse_expression()
                    pairs.append((key, val))
                else:
                    # Not followed by colon, backtrack and treat as bare value
                    self.pos = saved_pos
                    val = self._parse_expression()
                    if isinstance(val, TemplateRef):
                        pairs.append((Literal(val.name, val.pos), Literal(True, val.pos)))
                    else:
                        pairs.append((Literal("_", pos), val))

            self._match(TokenType.COMMA)

        self._expect(TokenType.RBRACE)
        return ObjectLit(pairs, conditions, pos)

    def _parse_func_call_name(self, name: str, pos: Position) -> FuncCall:
        """Parse a function call when name is already consumed."""
        self._expect(TokenType.LPAREN)
        args: list[Expression] = []

        if self._current().type != TokenType.RPAREN:
            args.append(self._parse_expression())
            while self._match(TokenType.COMMA):
                if self._current().type == TokenType.RPAREN:
                    break
                args.append(self._parse_expression())

        self._expect(TokenType.RPAREN)
        return FuncCall(name, args, pos)

    def _parse_func_call(self) -> FuncCall:
        pos = self._pos()
        name = self._expect(TokenType.IDENT).value
        return self._parse_func_call_name(name, pos)


def parse(source: str, filename: str = "<stdin>") -> Program:
    """Parse BON source code into a Program AST."""
    lexer = Lexer(source, filename)
    tokens = lexer.tokens()
    parser = Parser(tokens)
    return parser.parse()