# bon-vsc-ext

BON 语言的 VS Code 扩展。

## 功能

- 语法高亮（`.bon` 文件）
- 语言图标
- 代码片段
- 括号匹配与自动闭合
- 注释切换（`Ctrl+/`）
- 自动缩进

## 安装

```bash
code --install-extension bon-language-1.0.0.vsix
```

## 构建

```bash
npm install
npm run compile
vsce package --allow-missing-repository
```

## 语法高亮

支持的 token 类型：

| Token | Scope | 效果 |
|-------|-------|------|
| `return` | `keyword.control.return.bon` | 紫色关键字 |
| `class`, `extends`, `fn` | `keyword.control.*.bon` | 紫色关键字 |
| `import`, `as` | `keyword.control.*.bon` | 紫色关键字 |
| `self` | `variable.language.self.bon` | 特殊变量色 |
| `std` | `variable.language.bon` | 特殊变量色 |
| `true`, `false`, `null` | `constant.language.*.bon` | 常量色 |
| 变量名 | `variable.other.bon` | 变量色 |
| 类名 | `entity.name.type.class.bon` | 类型色 |
| 函数名 | `entity.name.function.bon` | 函数色 |
| 属性键 | `support.type.property-name.bon` | 属性色 |
| 字符串 | `string.quoted.double.bon` | 字符串色 |
| 数字 | `constant.numeric.*.bon` | 数字色 |
| 注释 | `comment.line.*.bon` | 注释色 |
