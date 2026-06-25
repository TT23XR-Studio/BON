# BON (Better Object Notation)

> JSON 的超集，配置界的编译器。

BON 是一门**编译期执行的、声明式的数据转换语言**。写的时候像代码，用的时候是数据。

```bon
# 模板复用
cpu-{"cpu": "250m", "memory": "256Mi"}

# 类与继承
class WebService {
    "replicas": 1,
    "resources": {cpu}
}

# 标准库转换
std.map([1, 2, 3], fn(x) { return x * 2 })
```

```json
// 输出永远是纯 JSON
{ "service": { "name": "api", "replicas": 1, "resources": {"cpu":"250m","memory":"256Mi"} } }
```

## 核心特性

- **完全兼容 JSON** — 所有合法 JSON 都是合法 BON
- **编译期求值** — 所有逻辑在解析时完成，输出纯 JSON，零运行时
- **确定性** — 图灵不完备，相同源码输出一致
- **模板系统** — 消除重复配置
- **类与继承** — 可复用的数据结构
- **标准库** — 字符串、数组、对象操作
- **导入系统** — 多文件拆分

## 项目结构

```
BON/
├── packages/
│   ├── bon-py/          # Python 实现（解析器 + 求值器 + CLI）
│   ├── bon-ts/          # TypeScript 实现（解析器 + 求值器 + CLI）
│   └── bon-vsc-ext/     # VS Code 扩展（语法高亮 + 图标）
├── tests/               # 共享测试
├── docs/                # 文档
└── use/                 # 使用示例
    ├── bon-py/          # Python 示例
    └── bon-ts/          # TypeScript 示例
```

## 快速开始

### 安装

```bash
# Python
pip install -e packages/bon-py

# TypeScript
cd packages/bon-ts && npm install && npm run build

# VS Code 扩展
code --install-extension packages/bon-vsc-ext/bon-language-1.0.0.vsix
```

### 使用

```bash
# CLI
python -m bon_py.cli file.bon
node packages/bon-ts/dist/cli.js file.bon

# Python 库
from bon_py.evaluator import evaluate
result = evaluate('{ "name": "BON" }')

# TypeScript 库
import { evaluate } from "bon-ts";
const result = evaluate('{ "name": "BON" }');
```

## 文档

| 文档 | 说明 |
|------|------|
| [docs/introduction.md](docs/introduction.md) | BON 是什么、解决了什么 |
| [docs/getting-started.md](docs/getting-started.md) | 快速开始 |
| [docs/spec.md](docs/spec.md) | 语言规范 |
| [docs/stdlib.md](docs/stdlib.md) | 标准库参考 |
| [docs/how-to-use/py.md](docs/how-to-use/py.md) | Python 库 API |
| [docs/how-to-use/ts.md](docs/how-to-use/ts.md) | TypeScript 库 API |
| [docs/how-to-use/pycli.md](docs/how-to-use/pycli.md) | Python CLI |
| [docs/how-to-use/tscli.md](docs/how-to-use/tscli.md) | TypeScript CLI |

## 运行测试

```bash
# Python
cd packages/bon-py && python -m pytest

# TypeScript
cd packages/bon-ts && npm test
```

## License

MIT
