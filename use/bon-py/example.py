#!/usr/bin/env python3
"""bon-py CLI 使用示例"""

import json
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).parent.parent.parent

# ── 1. 直接调用库函数 ────────────────────────────────────
from bon_py.evaluator import evaluate, load, EvalError


print("=== 1. evaluate() 解析字符串 ===")
result = evaluate('{"name": "BON", "version": "1.0"}')
print(json.dumps(result, indent=2, ensure_ascii=False))

# ── 2. load() 加载文件 ────────────────────────────────────
print("\n=== 2. load() 加载文件 ===")
bon_file = PROJECT_ROOT / "tests" / "fixtures" / "hello.bon"
result = load(str(bon_file))
print(json.dumps(result, indent=2, ensure_ascii=False))

# ── 3. 模板 ───────────────────────────────────────────────
print("\n=== 3. 模板展开 ===")
result = evaluate('''
base-{"host": "localhost", "port": 8080}
{"server": {base}}
''')
print(json.dumps(result, indent=2, ensure_ascii=False))

# ── 4. 类与方法 ──────────────────────────────────────────
print("\n=== 4. 类与方法调用 ===")
result = evaluate('''
class Calc {
    "value": 0,
    fn add(n) { return self.value + n },
    fn mul(n) { return self.value * n }
}
{
    "add_result": Calc { "value": 10 }.add(5),
    "mul_result": Calc { "value": 3 }.mul(7)
}
''')
print(json.dumps(result, indent=2, ensure_ascii=False))

# ── 5. 标准库 ────────────────────────────────────────────
print("\n=== 5. 标准库函数 ===")
result = evaluate('''
{
    "upper": std.upper("hello"),
    "split": std.split("a,b,c", ","),
    "map": std.map([1, 2, 3], fn(x) { return x * 2 }),
    "filter": std.filter([1, 2, 3, 4], fn(x) { return x > 2 }),
    "reduce": std.reduce([1, 2, 3], 0, fn(a, b) { return a + b }),
    "len": std.len("hello"),
    "keys": std.keys({"a": 1, "b": 2}),
    "type_of": std.type_of(42)
}
''')
print(json.dumps(result, indent=2, ensure_ascii=False))

# ── 6. 错误处理 ──────────────────────────────────────────
print("\n=== 6. 错误处理 ===")
try:
    evaluate("undefined_var")
except EvalError as e:
    print(f"捕获错误: {e.code} - {e}")

# ── 7. 批量处理 ──────────────────────────────────────────
print("\n=== 7. 批量处理多个文件 ===")

for bon_file in PROJECT_ROOT.glob("tests/fixtures/*.bon"):
    try:
        is_if_var = bon_file.name == "if-var.bon"
        if is_if_var:
            r1 = load(str(bon_file), params={"env": "test", "debug": True})
            r2 = load(str(bon_file), params={"env": "test", "debug": False})
            print(f"  {bon_file.name} 1: {json.dumps(r1, ensure_ascii=False)}")
            print(f"  {bon_file.name} 2: {json.dumps(r2, ensure_ascii=False)}")
        else:
            result = load(str(bon_file))
            preview = json.dumps(result, ensure_ascii=False)
            print(f"  {bon_file.name}: {preview}")
    except Exception as e:
        print(f"  {bon_file.name}: 失败 - {e}")