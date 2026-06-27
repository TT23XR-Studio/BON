"""BON CLI - Command-line interface for BON parser/evaluator."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .evaluator import EvalError, evaluate, load


def parse_params(params: list[str] | None) -> dict[str, Any]:
    """Parse --param key=value arguments."""
    result = {}
    if not params:
        return result
    for p in params:
        if "=" not in p:
            raise ValueError(f"Invalid param format: {p} (expected key=value)")
        key, val = p.split("=", 1)
        # Try to parse as JSON value
        try:
            result[key] = json.loads(val)
        except json.JSONDecodeError:
            # Treat as string
            result[key] = val
    return result


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="bon",
        description="BON (Better Object Notation) - JSON's superset",
    )
    parser.add_argument("file", nargs="?", help="BON file to evaluate")
    parser.add_argument("-e", "--eval", help="Evaluate BON expression from string")
    parser.add_argument("-p", "--pretty", action="store_true", help="Pretty-print JSON output")
    parser.add_argument("-c", "--compact", action="store_true", help="Compact JSON output")
    parser.add_argument("--indent", type=int, default=2, help="Indentation level (default: 2)")
    parser.add_argument("--param", dest="params", action="append", help="Compile-time parameters (key=value, can repeat)")

    args = parser.parse_args()

    try:
        params = parse_params(args.params)

        if args.eval:
            result = evaluate(args.eval, params=params)
        elif args.file:
            result = load(args.file, params=params)
        else:
            # Read from stdin
            source = sys.stdin.read()
            result = evaluate(source, params=params)

        # Output
        indent = None if args.compact else args.indent
        print(json.dumps(result, indent=indent, ensure_ascii=False))
        return 0

    except EvalError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Internal error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())