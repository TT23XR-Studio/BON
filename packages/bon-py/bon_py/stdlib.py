"""BON Standard Library - Built-in functions for BON evaluator."""

from __future__ import annotations

from typing import Any


class BONRuntimeError(Exception):
    def __init__(self, message: str, code: str = "E999"):
        super().__init__(message)
        self.code = code


def _type_check(value: Any, expected_type: type, func_name: str, arg_idx: int) -> None:
    if not isinstance(value, expected_type):
        raise BONRuntimeError(
            f"{func_name}() argument {arg_idx + 1}: expected {expected_type.__name__}, got {type(value).__name__}",
            "E007",
        )


# ── String operations ────────────────────────────────────────

def std_upper(args: list[Any]) -> str:
    _type_check(args[0], str, "std.upper", 0)
    return args[0].upper()


def std_lower(args: list[Any]) -> str:
    _type_check(args[0], str, "std.lower", 0)
    return args[0].lower()


def std_trim(args: list[Any]) -> str:
    _type_check(args[0], str, "std.trim", 0)
    return args[0].strip()


def std_split(args: list[Any]) -> list[Any]:
    _type_check(args[0], str, "std.split", 0)
    _type_check(args[1], str, "std.split", 1)
    return args[0].split(args[1])


def std_replace(args: list[Any]) -> str:
    _type_check(args[0], str, "std.replace", 0)
    _type_check(args[1], str, "std.replace", 1)
    _type_check(args[2], str, "std.replace", 2)
    return args[0].replace(args[1], args[2])


def std_len(args: list[Any]) -> int:
    _type_check(args[0], (str, list, dict), "std.len", 0)
    return len(args[0])


# ── Array operations ─────────────────────────────────────────

def std_at(args: list[Any]) -> Any:
    _type_check(args[0], list, "std.at", 0)
    _type_check(args[1], int, "std.at", 1)
    arr = args[0]
    idx = args[1]
    if idx < 0:
        idx += len(arr)
    if idx < 0 or idx >= len(arr):
        raise BONRuntimeError(f"std.at() index {args[1]} out of bounds for array of length {len(arr)}", "E006")
    return arr[idx]


def std_first(args: list[Any]) -> Any:
    return std_at([args[0], 0])


def std_last(args: list[Any]) -> Any:
    return std_at([args[0], -1])


def std_map(args: list[Any], call_fn=None) -> list[Any]:
    _type_check(args[0], list, "std.map", 0)
    fn = args[1]
    result = []
    for i, item in enumerate(args[0]):
        result.append(call_fn(fn, [item, i]))
    return result


def std_filter(args: list[Any], call_fn=None) -> list[Any]:
    _type_check(args[0], list, "std.filter", 0)
    fn = args[1]
    result = []
    for item in args[0]:
        cond = call_fn(fn, [item])
        if cond:
            result.append(item)
    return result


def std_reduce(args: list[Any], call_fn=None) -> Any:
    _type_check(args[0], list, "std.reduce", 0)
    init = args[1]
    fn = args[2]
    acc = init
    for item in args[0]:
        acc = call_fn(fn, [acc, item])
    return acc


def std_concat(args: list[Any]) -> list[Any]:
    _type_check(args[0], list, "std.concat", 0)
    _type_check(args[1], list, "std.concat", 1)
    return args[0] + args[1]


# ── Object operations ────────────────────────────────────────

def std_merge(args: list[Any]) -> dict[str, Any]:
    _type_check(args[0], dict, "std.merge", 0)
    _type_check(args[1], dict, "std.merge", 1)
    result = dict(args[0])
    result.update(args[1])
    return result


def std_keys(args: list[Any]) -> list[Any]:
    _type_check(args[0], dict, "std.keys", 0)
    return list(args[0].keys())


def std_values(args: list[Any]) -> list[Any]:
    _type_check(args[0], dict, "std.values", 0)
    return list(args[0].values())


# ── Type conversion ──────────────────────────────────────────

def std_to_string(args: list[Any]) -> str:
    val = args[0]
    if isinstance(val, bool):
        return "true" if val else "false"
    if val is None:
        return "null"
    return str(val)


def std_to_number(args: list[Any]) -> float | int | None:
    val = args[0]
    if isinstance(val, (int, float)):
        return val
    _type_check(val, str, "std.to_number", 0)
    try:
        if "." in val or "e" in val.lower():
            return float(val)
        return int(val)
    except ValueError:
        return None


def std_type_of(args: list[Any]) -> str:
    val = args[0]
    if val is None:
        return "null"
    if isinstance(val, bool):
        return "boolean"
    if isinstance(val, int):
        return "number"
    if isinstance(val, float):
        return "number"
    if isinstance(val, str):
        return "string"
    if isinstance(val, list):
        return "array"
    if isinstance(val, dict):
        return "object"
    return "unknown"


# ── Internal function call helper ────────────────────────────

# This will be set by the evaluator to handle anonymous fn calls
_call_func = None  # type: ignore


def set_call_func(fn):
    global _call_func
    _call_func = fn


# ── Standard library registry ────────────────────────────────

STD_LIB: dict[str, Any] = {
    "upper": std_upper,
    "lower": std_lower,
    "trim": std_trim,
    "split": std_split,
    "replace": std_replace,
    "len": std_len,
    "at": std_at,
    "first": std_first,
    "last": std_last,
    "map": {"fn": std_map, "needsCallFn": True},
    "filter": {"fn": std_filter, "needsCallFn": True},
    "reduce": {"fn": std_reduce, "needsCallFn": True},
    "concat": std_concat,
    "merge": std_merge,
    "keys": std_keys,
    "values": std_values,
    "to_string": std_to_string,
    "to_number": std_to_number,
    "type_of": std_type_of,
}
