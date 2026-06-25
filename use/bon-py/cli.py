"""BON CLI - Command-line interface for BON parser/evaluator."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "packages" / "bon-py"))

from bon_py.evaluator import EvalError, evaluate, load 


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

    args = parser.parse_args()

    try:
        if args.eval:
            result = evaluate(args.eval)
        elif args.file:
            result = load(args.file)
        else:
            source = sys.stdin.read()
            result = evaluate(source)

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
