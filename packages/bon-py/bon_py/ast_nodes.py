"""BON AST - Abstract Syntax Tree nodes."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Position:
    line: int
    column: int


# ── Expressions ──────────────────────────────────────────────

@dataclass
class Literal:
    value: Any  # str, int, float, bool, None
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class Identifier:
    name: str
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class TemplateRef:
    name: str
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class TemplateDef:
    name: str
    body: Any  # Expression
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class ClassDef:
    name: str
    parent: str | None
    members: dict[str, Any]  # str -> Expression or MethodDef
    methods: dict[str, MethodDef] = field(default_factory=dict)
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class MethodDef:
    name: str
    params: list[str]
    body: Any  # ReturnStmt or Block
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class ClassInstance:
    class_name: str
    overrides: dict[str, Any]  # str -> Expression
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class MethodCall:
    obj: Any  # Expression
    method: str
    args: list[Any] = field(default_factory=list)
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class BinaryOp:
    op: str
    left: Any
    right: Any
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class UnaryOp:
    op: str
    operand: Any
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class PropertyAccess:
    obj: Any
    prop: str
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class FuncCall:
    name: str
    args: list[Any] = field(default_factory=list)
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class FuncDef:
    params: list[str]
    body: Any  # ReturnStmt
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class ReturnStmt:
    value: Any  # Expression
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class ArrayLit:
    elements: list[Any]
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class ObjectLit:
    pairs: list[tuple[Any, Any]]  # (key_expr, value_expr)
    conditions: list[ConditionalBlock] | None = None
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class ImportStmt:
    path: str
    alias: str | None
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class VariableAssign:
    name: str
    value: Any
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class Param:
    name: str
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class IfExpr:
    cond: Any
    then_expr: Any
    else_expr: Any | None
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class ConditionalBlock:
    cond: Any
    then_body: list[tuple[Any, Any]]  # (key_expr, value_expr)
    else_body: list[tuple[Any, Any]] | None = None
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class ForLoop:
    var_name: str
    iterable: Any
    body: Any
    var_name2: str | None = None  # Second variable for key-value pair traversal
    pos: Position = field(default_factory=lambda: Position(0, 0))


@dataclass
class Range:
    start: int
    end: int
    pos: Position = field(default_factory=lambda: Position(0, 0))


# ── Top-level ────────────────────────────────────────────────

@dataclass
class Program:
    imports: list[ImportStmt]
    templates: dict[str, TemplateDef]
    classes: dict[str, ClassDef]
    variables: dict[str, Any]
    body: list[Any]  # top-level expressions (usually a single ObjectLit)


# Type alias for any expression node
Expression = (
    Literal | Identifier | TemplateRef | ClassInstance | MethodCall |
    BinaryOp | UnaryOp | PropertyAccess | FuncCall | FuncDef |
    ArrayLit | ObjectLit | ReturnStmt | Param | IfExpr | ForLoop | Range |
    ConditionalBlock
)
