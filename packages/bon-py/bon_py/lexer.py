"""BON Lexer - Tokenizer for BON source code."""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum, auto
from typing import Iterator


class TokenType(Enum):
    # Literals
    STRING = auto()
    NUMBER = auto()
    TRUE = auto()
    FALSE = auto()
    NULL = auto()

    # Identifiers & keywords
    IDENT = auto()
    CLASS = auto()
    EXTENDS = auto()
    FN = auto()
    RETURN = auto()
    IMPORT = auto()
    AS = auto()

    # Punctuation
    LBRACE = auto()      # {
    RBRACE = auto()      # }
    LBRACKET = auto()    # [
    RBRACKET = auto()    # ]
    COLON = auto()       # :
    COMMA = auto()       # ,
    DOT = auto()         # .
    LPAREN = auto()      # (
    RPAREN = auto()      # )
    DASH = auto()         # - (for template definition name-{})
    EQUALS = auto()       # = (for variable assignment)

    # Operators
    PLUS = auto()
    MINUS = auto()
    STAR = auto()
    SLASH = auto()
    PERCENT = auto()
    GT = auto()       # >
    LT = auto()       # <
    GTE = auto()      # >=
    LTE = auto()      # <=
    EQ_EQ = auto()    # ==
    BANG_EQ = auto()  # !=

    # Special
    TEMPLATE_OPEN = auto()   # {template_name}
    EOF = auto()


KEYWORDS: dict[str, TokenType] = {
    "class": TokenType.CLASS,
    "extends": TokenType.EXTENDS,
    "fn": TokenType.FN,
    "return": TokenType.RETURN,
    "import": TokenType.IMPORT,
    "as": TokenType.AS,
    "true": TokenType.TRUE,
    "false": TokenType.FALSE,
    "null": TokenType.NULL,
}


@dataclass
class Token:
    type: TokenType
    value: str
    line: int
    column: int


class LexerError(Exception):
    def __init__(self, message: str, line: int, column: int):
        super().__init__(f"Lexer error at line {line}, column {column}: {message}")
        self.line = line
        self.column = column


class Lexer:
    """Tokenizes BON source code."""

    def __init__(self, source: str, filename: str = "<stdin>"):
        self.source = source
        self.filename = filename
        self.pos = 0
        self.line = 1
        self.column = 1

    def _peek(self) -> str | None:
        if self.pos < len(self.source):
            return self.source[self.pos]
        return None

    def _advance(self) -> str:
        ch = self.source[self.pos]
        self.pos += 1
        if ch == "\n":
            self.line += 1
            self.column = 1
        else:
            self.column += 1
        return ch

    def _skip_whitespace(self) -> None:
        while self.pos < len(self.source) and self.source[self.pos] in " \t\r\n":
            self._advance()

    def _skip_comment(self) -> bool:
        if self.pos >= len(self.source):
            return False
        ch = self.source[self.pos]
        if ch == "#":
            while self.pos < len(self.source) and self.source[self.pos] != "\n":
                self._advance()
            return True
        if ch == "/" and self.pos + 1 < len(self.source) and self.source[self.pos + 1] == "/":
            while self.pos < len(self.source) and self.source[self.pos] != "\n":
                self._advance()
            return True
        return False

    def _read_string(self) -> Token:
        start_line, start_col = self.line, self.column
        quote = self._advance()  # consume opening quote
        result: list[str] = []

        while self.pos < len(self.source):
            ch = self.source[self.pos]
            if ch == quote:
                self._advance()
                return Token(TokenType.STRING, "".join(result), start_line, start_col)
            if ch == "\\":
                self._advance()
                esc = self._advance() if self.pos < len(self.source) else ""
                escape_map = {
                    "n": "\n",
                    "t": "\t",
                    "r": "\r",
                    "\\": "\\",
                    '"': '"',
                    "'": "'",
                    "/": "/",
                    "0": "\0",
                }
                if esc in escape_map:
                    result.append(escape_map[esc])
                elif esc == "u":
                    hex_str = ""
                    for _ in range(4):
                        if self.pos < len(self.source) and self.source[self.pos] in "0123456789abcdefABCDEF":
                            hex_str += self._advance()
                    result.append(chr(int(hex_str, 16)))
                else:
                    result.append(esc)
            else:
                self._advance()
                result.append(ch)

        raise LexerError("Unterminated string", start_line, start_col)

    def _read_number(self) -> Token:
        start_line, start_col = self.line, self.column
        num_str = ""
        has_dot = False

        if self.pos < len(self.source) and self.source[self.pos] == "-":
            num_str += self._advance()

        while self.pos < len(self.source) and self.source[self.pos].isdigit():
            num_str += self._advance()

        if self.pos < len(self.source) and self.source[self.pos] == ".":
            has_dot = True
            num_str += self._advance()
            while self.pos < len(self.source) and self.source[self.pos].isdigit():
                num_str += self._advance()

        if self.pos < len(self.source) and self.source[self.pos] in "eE":
            num_str += self._advance()
            if self.pos < len(self.source) and self.source[self.pos] in "+-":
                num_str += self._advance()
            while self.pos < len(self.source) and self.source[self.pos].isdigit():
                num_str += self._advance()

        value = float(num_str) if has_dot or "e" in num_str.lower() else int(num_str)
        return Token(TokenType.NUMBER, value, start_line, start_col)

    def _read_identifier(self) -> Token:
        start_line, start_col = self.line, self.column
        ident = ""
        while self.pos < len(self.source) and (self.source[self.pos].isalnum() or self.source[self.pos] == "_"):
            ident += self._advance()

        token_type = KEYWORDS.get(ident, TokenType.IDENT)
        return Token(token_type, ident, start_line, start_col)

    def _check_template_ref(self) -> Token | None:
        """Check if current position starts a template reference {name}."""
        if self.pos >= len(self.source) or self.source[self.pos] != "{":
            return None

        # Check if this is a template reference (not a JSON object)
        # A template reference is: {identifier} where identifier is a bare name
        saved_pos = self.pos
        saved_line = self.line
        saved_col = self.column

        self._advance()  # consume {
        self._skip_whitespace()

        if self.pos < len(self.source) and (self.source[self.pos].isalpha() or self.source[self.pos] == "_"):
            ident_start = self.pos
            ident = ""
            while self.pos < len(self.source) and (self.source[self.pos].isalnum() or self.source[self.pos] == "_"):
                ident += self._advance()

            self._skip_whitespace()

            if self.pos < len(self.source) and self.source[self.pos] == "}":
                self._advance()
                return Token(TokenType.TEMPLATE_OPEN, ident, saved_line, saved_col)

        # Not a template reference, restore position
        self.pos = saved_pos
        self.line = saved_line
        self.column = saved_col
        return None

    def tokens(self) -> list[Token]:
        result: list[Token] = []

        while self.pos < len(self.source):
            self._skip_whitespace()
            if self.pos >= len(self.source):
                break

            if self._skip_comment():
                continue

            ch = self.source[self.pos]

            # Template reference {name}
            if ch == "{":
                tmpl = self._check_template_ref()
                if tmpl:
                    result.append(tmpl)
                    continue

            # String
            if ch == '"':
                result.append(self._read_string())
                continue

            # Number
            if ch.isdigit() or (ch == "-" and self.pos + 1 < len(self.source) and self.source[self.pos + 1].isdigit()):
                result.append(self._read_number())
                continue

            # Identifier / keyword
            if ch.isalpha() or ch == "_":
                result.append(self._read_identifier())
                continue

            # Punctuation and operators
            start_line, start_col = self.line, self.column
            single_char_tokens = {
                "{": TokenType.LBRACE,
                "}": TokenType.RBRACE,
                "[": TokenType.LBRACKET,
                "]": TokenType.RBRACKET,
                ":": TokenType.COLON,
                ",": TokenType.COMMA,
                ".": TokenType.DOT,
                "(": TokenType.LPAREN,
                ")": TokenType.RPAREN,
                "=": TokenType.EQUALS,
                "+": TokenType.PLUS,
                "*": TokenType.STAR,
                "/": TokenType.SLASH,
                "%": TokenType.PERCENT,
            }

            if ch == "-":
                self._advance()
                result.append(Token(TokenType.DASH, "-", start_line, start_col))
                continue

            # Two-character operators
            if self.pos + 1 < len(self.source):
                two = self.source[self.pos : self.pos + 2]
                if two == ">=":
                    self._advance()
                    self._advance()
                    result.append(Token(TokenType.GTE, ">=", start_line, start_col))
                    continue
                if two == "<=":
                    self._advance()
                    self._advance()
                    result.append(Token(TokenType.LTE, "<=", start_line, start_col))
                    continue
                if two == "==":
                    self._advance()
                    self._advance()
                    result.append(Token(TokenType.EQ_EQ, "==", start_line, start_col))
                    continue
                if two == "!=":
                    self._advance()
                    self._advance()
                    result.append(Token(TokenType.BANG_EQ, "!=", start_line, start_col))
                    continue

            # Single-character comparison operators
            if ch == ">":
                self._advance()
                result.append(Token(TokenType.GT, ">", start_line, start_col))
                continue
            if ch == "<":
                self._advance()
                result.append(Token(TokenType.LT, "<", start_line, start_col))
                continue

            if ch in single_char_tokens:
                self._advance()
                result.append(Token(single_char_tokens[ch], ch, start_line, start_col))
                continue

            raise LexerError(f"Unexpected character: {ch}", self.line, self.column)

        result.append(Token(TokenType.EOF, "", self.line, self.column))
        return result
