"""BON Evaluator - Evaluates AST to produce pure JSON output."""

from __future__ import annotations

import json
import os
from copy import deepcopy
from typing import Any, Callable

from .ast_nodes import (
    ArrayLit, BinaryOp, ClassDef, ClassInstance, Expression, FuncCall,
    FuncDef, Identifier, ImportStmt, Literal, MethodCall, MethodDef,
    ObjectLit, Position, Program, PropertyAccess, ReturnStmt, TemplateDef,
    TemplateRef, UnaryOp, VariableAssign,
)
from .lexer import Lexer
from .parser import Parser
from .stdlib import BONRuntimeError, STD_LIB, set_call_func


class EvalError(Exception):
    def __init__(self, message: str, code: str = "E999", pos: Position | None = None):
        loc = f" at line {pos.line}, column {pos.column}" if pos else ""
        super().__init__(f"{code}: {message}{loc}")
        self.code = code
        self.pos = pos


class Evaluator:
    """Evaluates a BON AST into pure JSON."""

    def __init__(self, base_dir: str = "."):
        self.base_dir = base_dir
        self.templates: dict[str, TemplateDef] = {}
        self.classes: dict[str, ClassDef] = {}
        self.variables: dict[str, Any] = {}
        self.import_stack: list[str] = []
        self._anon_funcs: list[tuple[FuncDef, dict[str, Any]]] = []

        # Register built-in std library
        self.std_ns = dict(STD_LIB)

        # Wire up anonymous function call helper
        set_call_func(self._call_anon_func)

    def _call_anon_func(self, fn: Any, args: list[Any]) -> Any:
        """Call an anonymous function (FuncDef) with given args."""
        if isinstance(fn, dict) and "__bon_func__" in fn:
            func_def = fn["__bon_func__"]
            closure = fn["__closure__"]
            return self._eval_func_def(func_def, args, closure)
        raise EvalError(f"Cannot call non-function: {type(fn)}", "E007")

    def evaluate(self, program: Program) -> Any:
        """Evaluate a full Program AST and return JSON-serializable output."""
        # Phase 1: Import resolution
        for imp in program.imports:
            self._resolve_import(imp)

        # Merge templates, classes, variables from imports
        for name, td in program.templates.items():
            self.templates[name] = td
        for name, cd in program.classes.items():
            self.classes[name] = cd
        for name, va in program.variables.items():
            self.variables[name] = self._eval(va.value)

        # Phase 2: Template expansion happens during evaluation
        # Phase 3: Class instantiation and constant folding happen during evaluation

        # Evaluate body
        results = []
        for expr in program.body:
            results.append(self._eval(expr))

        if len(results) == 1:
            return self._sanitize(results[0])
        return [self._sanitize(r) for r in results]

    def _sanitize(self, obj: Any) -> Any:
        """Remove internal BON method wrappers so output is JSON-serializable."""
        if isinstance(obj, dict):
            if "__method__" in obj:
                return None  # method reference, not serializable
            return {k: self._sanitize(v) for k, v in obj.items()
                    if not k.startswith("__")}
        if isinstance(obj, list):
            return [self._sanitize(item) for item in obj]
        return obj

    def _eval(self, node: Any) -> Any:
        """Evaluate an expression node."""
        if isinstance(node, Literal):
            return node.value

        if isinstance(node, Identifier):
            return self._resolve_identifier(node.name, node.pos)

        if isinstance(node, TemplateRef):
            return self._expand_template(node.name, node.pos)

        if isinstance(node, TemplateDef):
            return node  # Templates are stored, not evaluated directly

        if isinstance(node, ClassDef):
            return node  # Classes are stored, not evaluated directly

        if isinstance(node, ClassInstance):
            return self._instantiate_class(node)

        if isinstance(node, MethodCall):
            return self._eval_method_call(node)

        if isinstance(node, FuncCall):
            return self._eval_func_call(node)

        if isinstance(node, FuncDef):
            # Anonymous function - capture current scope
            return {"__bon_func__": node, "__closure__": dict(self.variables)}

        if isinstance(node, BinaryOp):
            return self._eval_binary_op(node)

        if isinstance(node, UnaryOp):
            return self._eval_unary_op(node)

        if isinstance(node, PropertyAccess):
            return self._eval_property_access(node)

        if isinstance(node, ArrayLit):
            return [self._eval(elem) for elem in node.elements]

        if isinstance(node, ObjectLit):
            result = {}
            for key, val in node.pairs.items():
                result[key] = self._eval(val)
            return result

        if isinstance(node, ReturnStmt):
            return self._eval(node.value)

        if isinstance(node, VariableAssign):
            val = self._eval(node.value)
            self.variables[node.name] = val
            return val

        if isinstance(node, Program):
            return self.evaluate(node)

        raise EvalError(f"Unknown node type: {type(node).__name__}")

    def _resolve_identifier(self, name: str, pos: Position) -> Any:
        """Resolve an identifier to its value."""
        # Check variables
        if name in self.variables:
            return self.variables[name]

        # Check templates (return the template definition)
        if name in self.templates:
            return self.templates[name]

        # Check classes (return the class definition)
        if name in self.classes:
            return self.classes[name]

        raise EvalError(f"Undefined identifier: {name}", "E001", pos)

    def _expand_template(self, name: str, pos: Position) -> Any:
        """Expand a template reference with deep copy."""
        if name not in self.templates:
            raise EvalError(f"Undefined template: {name}", "E001", pos)

        td = self.templates[name]
        return deepcopy(self._eval(td.body))

    def _instantiate_class(self, node: ClassInstance) -> dict[str, Any]:
        """Instantiate a class with attribute overrides."""
        class_name = node.class_name
        if class_name not in self.classes:
            raise EvalError(f"Undefined class: {class_name}", "E003", node.pos)

        cd = self.classes[class_name]

        # Build resolved members (with inheritance)
        resolved_members, resolved_methods = self._resolve_class_hierarchy(cd)

        # Apply overrides
        for key, val in node.overrides.items():
            resolved_members[key] = val

        # Evaluate members (compute self-referencing values)
        instance: dict[str, Any] = {}
        instance["_class"] = class_name

        # First pass: set raw values (including unevaluated expressions for computed props)
        for key, val in resolved_members.items():
            if isinstance(val, Expression):
                instance[key] = val  # Will be evaluated in second pass
            else:
                instance[key] = val

        # Second pass: evaluate computed properties (those referencing self)
        for key, val in list(instance.items()):
            if isinstance(val, Expression):
                instance[key] = self._eval_with_self(val, instance)

        # Store methods as callable wrappers
        for name, md in resolved_methods.items():
            instance[name] = {"__method__": md, "__class__": cd, "_instance": instance}

        # Remove internal keys
        instance.pop("_class", None)

        return instance

    def _resolve_class_hierarchy(
        self, cd: ClassDef
    ) -> tuple[dict[str, Any], dict[str, MethodDef]]:
        """Resolve full class hierarchy, returning merged members and methods."""
        members: dict[str, Any] = {}
        methods: dict[str, MethodDef] = {}

        # Collect parent chain (DFS)
        chain = self._get_parent_chain(cd)
        for parent_cd in chain:
            for k, v in parent_cd.members.items():
                members[k] = v
            for k, v in parent_cd.methods.items():
                methods[k] = v

        # Apply current class (overrides parents)
        members.update(cd.members)
        methods.update(cd.methods)

        return members, methods

    def _get_parent_chain(self, cd: ClassDef) -> list[ClassDef]:
        """Get ordered list of parent classes (excluding self)."""
        chain: list[ClassDef] = []
        seen: set[str] = set()
        current = cd.parent

        while current:
            if current in seen:
                raise EvalError(f"Circular inheritance detected: {current}", "E004")
            seen.add(current)
            if current not in self.classes:
                raise EvalError(f"Undefined parent class: {current}", "E003")
            parent_cd = self.classes[current]
            chain.append(parent_cd)
            current = parent_cd.parent

        return chain

    def _eval_with_self(self, expr: Expression, self_obj: dict[str, Any]) -> Any:
        """Evaluate an expression with 'self' bound to the given instance."""
        old_vars = dict(self.variables)
        self.variables["self"] = self_obj
        try:
            return self._eval(expr)
        finally:
            self.variables = old_vars

    def _eval_method_call(self, node: MethodCall) -> Any:
        """Evaluate a method call like obj.method(args)."""
        # Handle std.xxx calls as a special case (before evaluating obj)
        if isinstance(node.obj, Identifier) and node.obj.name == "std":
            func_name = node.method
            if func_name in self.std_ns:
                args = [self._eval(arg) for arg in node.args]
                entry = self.std_ns[func_name]
                if isinstance(entry, dict) and entry.get("needsCallFn"):
                    return entry["fn"](args, self._call_anon_func)
                elif callable(entry):
                    return entry(args)
            raise EvalError(f"Undefined std function: {func_name}", "E001", node.pos)

        obj = self._eval(node.obj)

        # If obj is a dict with __method__, call the method directly
        if isinstance(obj, dict) and "__method__" in obj:
            md = obj["__method__"]
            instance = obj["_instance"]
            args = [self._eval(arg) for arg in node.args]

            # Bind self and evaluate method body
            old_vars = dict(self.variables)
            self.variables["self"] = instance
            try:
                return self._eval_func_def(md, args, {})
            finally:
                self.variables = old_vars

        # If obj is a class instance (dict), look up the method on it
        if isinstance(obj, dict) and node.method in obj:
            method_val = obj[node.method]
            if isinstance(method_val, dict) and "__method__" in method_val:
                md = method_val["__method__"]
                instance = obj
                args = [self._eval(arg) for arg in node.args]

                # Bind self and evaluate method body
                old_vars = dict(self.variables)
                self.variables["self"] = instance
                try:
                    return self._eval_func_def(md, args, {})
                finally:
                    self.variables = old_vars

        raise EvalError(f"Cannot call method on non-object: {type(obj)}", "E007", node.pos)

    def _eval_func_call(self, node: FuncCall) -> Any:
        """Evaluate a function call (std.xxx or user function)."""
        args = [self._eval(arg) for arg in node.args]

        # Check std library
        if node.name.startswith("std."):
            parts = node.name.split(".", 1)
            func_name = parts[1]
            if func_name in self.std_ns:
                return self.std_ns[func_name](args)

        # Check user-defined functions
        if node.name in self.variables:
            fn = self.variables[node.name]
            if isinstance(fn, dict) and "__bon_func__" in fn:
                return self._call_anon_func(fn, args)

        raise EvalError(f"Undefined function: {node.name}", "E001", node.pos)

    def _eval_func_def(self, md: MethodDef | FuncDef, args: list[Any], closure: dict[str, Any]) -> Any:
        """Evaluate a function/method definition with given arguments."""
        params = md.params

        if len(args) < len(params):
            raise EvalError(
                f"Function expects {len(params)} arguments, got {len(args)}", "E007"
            )

        old_vars = dict(self.variables)
        self.variables.update(closure)
        for i, param in enumerate(params):
            self.variables[param] = args[i]

        try:
            result = self._eval(md.body)
            return result
        finally:
            self.variables = old_vars

    def _eval_binary_op(self, node: BinaryOp) -> Any:
        left = self._eval(node.left)
        right = self._eval(node.right)

        if node.op == "+":
            if isinstance(left, str) and isinstance(right, str):
                return left + right
            if isinstance(left, list) and isinstance(right, list):
                return left + right
            if isinstance(left, (int, float)) and isinstance(right, (int, float)):
                return left + right
            raise EvalError(f"Cannot apply '+' to {type(left).__name__} and {type(right).__name__}", "E007", node.pos)

        if node.op == "-":
            if isinstance(left, (int, float)) and isinstance(right, (int, float)):
                return left - right
            raise EvalError(f"Cannot apply '-' to {type(left).__name__} and {type(right).__name__}", "E007", node.pos)

        if node.op == "*":
            if isinstance(left, (int, float)) and isinstance(right, (int, float)):
                return left * right
            raise EvalError(f"Cannot apply '*' to {type(left).__name__} and {type(right).__name__}", "E007", node.pos)

        if node.op == "/":
            if isinstance(left, (int, float)) and isinstance(right, (int, float)):
                if right == 0:
                    raise EvalError("Division by zero", "E007", node.pos)
                return left / right
            raise EvalError(f"Cannot apply '/' to {type(left).__name__} and {type(right).__name__}", "E007", node.pos)

        if node.op == "%":
            if isinstance(left, (int, float)) and isinstance(right, (int, float)):
                return left % right
            raise EvalError(f"Cannot apply '%' to {type(left).__name__} and {type(right).__name__}", "E007", node.pos)

        # Comparison operators
        if node.op == ">":
            if isinstance(left, (int, float)) and isinstance(right, (int, float)):
                return left > right
            if isinstance(left, str) and isinstance(right, str):
                return left > right
            raise EvalError(f"Cannot compare {type(left).__name__} and {type(right).__name__}", "E007", node.pos)

        if node.op == "<":
            if isinstance(left, (int, float)) and isinstance(right, (int, float)):
                return left < right
            if isinstance(left, str) and isinstance(right, str):
                return left < right
            raise EvalError(f"Cannot compare {type(left).__name__} and {type(right).__name__}", "E007", node.pos)

        if node.op == ">=":
            if isinstance(left, (int, float)) and isinstance(right, (int, float)):
                return left >= right
            if isinstance(left, str) and isinstance(right, str):
                return left >= right
            raise EvalError(f"Cannot compare {type(left).__name__} and {type(right).__name__}", "E007", node.pos)

        if node.op == "<=":
            if isinstance(left, (int, float)) and isinstance(right, (int, float)):
                return left <= right
            if isinstance(left, str) and isinstance(right, str):
                return left <= right
            raise EvalError(f"Cannot compare {type(left).__name__} and {type(right).__name__}", "E007", node.pos)

        if node.op == "==":
            return left == right

        if node.op == "!=":
            return left != right

        raise EvalError(f"Unknown operator: {node.op}", "E007", node.pos)

    def _eval_unary_op(self, node: UnaryOp) -> Any:
        operand = self._eval(node.operand)
        if node.op == "-":
            if isinstance(operand, (int, float)):
                return -operand
            raise EvalError(f"Cannot negate {type(operand).__name__}", "E007", node.pos)
        raise EvalError(f"Unknown unary operator: {node.op}", "E007", node.pos)

    def _eval_property_access(self, node: PropertyAccess) -> Any:
        obj = self._eval(node.obj)
        if isinstance(obj, dict):
            if node.prop in obj:
                return obj[node.prop]
            raise EvalError(f"Property '{node.prop}' not found on object", "E007", node.pos)
        raise EvalError(f"Cannot access property on {type(obj).__name__}", "E007", node.pos)

    def _resolve_import(self, imp: ImportStmt) -> None:
        """Resolve an import statement."""
        filepath = os.path.join(self.base_dir, imp.path)

        # Check for circular imports
        if filepath in self.import_stack:
            cycle = " -> ".join(self.import_stack + [filepath])
            raise EvalError(f"Circular import detected: {cycle}", "E008")

        if not os.path.exists(filepath):
            raise EvalError(f"Import file not found: {imp.path}", "E008")

        with open(filepath, "r", encoding="utf-8") as f:
            source = f.read()

        self.import_stack.append(filepath)
        try:
            program = parse(source, filepath)
            imported = Evaluator(os.path.dirname(filepath))
            imported.templates = dict(self.templates)
            imported.classes = dict(self.classes)
            imported.variables = dict(self.variables)
            imported.import_stack = list(self.import_stack)
            result = imported.evaluate(program)

            # Merge back
            self.templates = dict(imported.templates)
            self.classes = dict(imported.classes)
            self.variables = dict(imported.variables)
        finally:
            self.import_stack.pop()

        if imp.alias:
            # Create namespace object
            ns = {}
            for name in list(self.templates.keys()) + list(self.classes.keys()):
                if name in self.templates:
                    ns[name] = self.templates[name]
                elif name in self.classes:
                    ns[name] = self.classes[name]
            self.variables[imp.alias] = ns


def parse(source: str, filename: str = "<stdin>") -> Program:
    """Parse BON source code into a Program AST."""
    lexer = Lexer(source, filename)
    tokens = lexer.tokens()
    parser = Parser(tokens)
    return parser.parse()


def evaluate(source: str, base_dir: str = ".") -> Any:
    """Parse and evaluate BON source code, returning pure JSON."""
    program = parse(source)
    evaluator = Evaluator(base_dir)
    return evaluator.evaluate(program)


def loads(source: str, base_dir: str = ".") -> Any:
    """Parse and evaluate BON source code (alias for evaluate)."""
    return evaluate(source, base_dir)


def load(filepath: str) -> Any:
    """Load and evaluate a BON file."""
    with open(filepath, "r", encoding="utf-8") as f:
        source = f.read()
    return evaluate(source, os.path.dirname(filepath))
