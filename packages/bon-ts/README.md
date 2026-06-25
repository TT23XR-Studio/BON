# bon-ts

BON (Better Object Notation) 的 TypeScript 实现。

## 安装

```bash
npm install
npm run build
```

## CLI

```bash
# 解析文件
node dist/cli.js file.bon

# 解析表达式
node dist/cli.js -e '{ "name": "BON" }'

# 紧凑输出
node dist/cli.js -c file.bon

# 管道输入
echo '{ "key": "value" }' | node dist/cli.js
```

### 参数

| 参数 | 说明 |
|------|------|
| `file` | 要解析的 .bon 文件 |
| `-e, --eval` | 直接解析 BON 表达式字符串 |
| `-p, --pretty` | 美化输出（默认） |
| `-c, --compact` | 紧凑输出 |

## 库使用

```typescript
import { evaluate, load, EvalError } from "bon-ts";

// 解析字符串
const result = evaluate('{ "name": "Alice" }');

// 从文件加载
const config = load("config.bon");

// 错误处理
try {
  const result = evaluate("undefined_var");
} catch (e) {
  if (e instanceof EvalError) {
    console.log(`错误: ${e.code} - ${e.message}`);
  }
}
```

### API

| 函数 | 说明 |
|------|------|
| `evaluate(source, baseDir?)` | 解析并执行 BON 源码字符串 |
| `load(filepath)` | 从文件加载并执行 |
| `loads(source, baseDir?)` | `evaluate` 的别名 |
| `parse(source, filename?)` | 解析为 AST，不做求值 |
| `Evaluator(baseDir?)` | 底层求值器 |

还导出：`Lexer`, `ast`, `stdlib`

详见 [完整文档](../../docs/how-to-use/ts.md)。

## 测试

```bash
npm test
```
