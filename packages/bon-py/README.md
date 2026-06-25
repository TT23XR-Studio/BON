# bon-py

BON (Better Object Notation) 的 Python 实现。

## 安装

```bash
pip install -e .
```

## CLI

```bash
# 解析文件
python -m bon_py.cli file.bon

# 解析表达式
python -m bon_py.cli -e '{ "name": "BON" }'

# 紧凑输出
python -m bon_py.cli -c file.bon

# 自定义缩进
python -m bon_py.cli --indent 4 file.bon

# 管道输入
echo '{ "key": "value" }' | python -m bon_py.cli
```

### 参数

| 参数 | 说明 |
|------|------|
| `file` | 要解析的 .bon 文件 |
| `-e, --eval` | 直接解析 BON 表达式字符串 |
| `-p, --pretty` | 美化输出（默认） |
| `-c, --compact` | 紧凑输出 |
| `--indent N` | 缩进级别（默认 2） |

## 库使用

```python
from bon_py.evaluator import evaluate, load, EvalError

# 解析字符串
result = evaluate('{ "name": "Alice" }')

# 从文件加载
config = load("config.bon")

# 错误处理
try:
    result = evaluate("undefined_var")
except EvalError as e:
    print(f"错误: {e.code} - {e}")
```

### API

| 函数 | 说明 |
|------|------|
| `evaluate(source, base_dir=".")` | 解析并执行 BON 源码字符串 |
| `load(filepath)` | 从文件加载并执行 |
| `loads(source, base_dir=".")` | `evaluate` 的别名 |
| `parse(source, filename)` | 解析为 AST，不做求值 |
| `Evaluator(base_dir)` | 底层求值器 |

详见 [完整文档](../../docs/how-to-use/py.md)。

## 测试

```bash
python -m pytest
```
