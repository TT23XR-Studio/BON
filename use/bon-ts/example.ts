/** bon-ts CLI 使用示例 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import { evaluate, load } from "../../packages/bon-ts/src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../");

// ── 1. 直接调用库函数 ────────────────────────────────────
console.log("=== 1. evaluate() 解析字符串 ===");
const r1 = evaluate('{"name": "BON", "version": "1.0"}');
console.log(JSON.stringify(r1, null, 2));

// ── 2. load() 加载文件 ────────────────────────────────────
console.log("\n=== 2. load() 加载文件 ===");
const r2 = load(path.join(PROJECT_ROOT, "tests", "fixtures", "hello.bon"));
console.log(JSON.stringify(r2, null, 2));

// ── 3. 模板 ───────────────────────────────────────────────
console.log("\n=== 3. 模板展开 ===");
const r3 = evaluate(`
base-{"host": "localhost", "port": 8080}
{"server": {base}}
`);
console.log(JSON.stringify(r3, null, 2));

// ── 4. 类与方法 ──────────────────────────────────────────
console.log("\n=== 4. 类与方法调用 ===");
const r4 = evaluate(`
class Calc {
    "value": 0,
    fn add(n) { return self.value + n },
    fn mul(n) { return self.value * n }
}
{
    "add_result": Calc { "value": 10 }.add(5),
    "mul_result": Calc { "value": 3 }.mul(7)
}
`);
console.log(JSON.stringify(r4, null, 2));

// ── 5. 标准库 ────────────────────────────────────────────
console.log("\n=== 5. 标准库函数 ===");
const r5 = evaluate(`
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
`);
console.log(JSON.stringify(r5, null, 2));

// ── 6. 错误处理 ──────────────────────────────────────────
console.log("\n=== 6. 错误处理 ===");
try {
  evaluate("undefined_var");
} catch (e: any) {
  console.log(`捕获错误: ${e.code ?? "????"} - ${e.message}`);
}

// ── 7. 类型安全 ──────────────────────────────────────────
console.log("\n=== 7. TypeScript 类型断言 ===");
interface Config {
  name: string;
  items: number[];
}
const config = evaluate('{"name": "test", "items": [1, 2, 3]}') as Config;
console.log(`name: ${config.name}, items: ${config.items.join(", ")}`);

// ── 8. 批量处理 ──────────────────────────────────────────
console.log("\n=== 8. 批量处理多个文件 ===")

for (const bon_file of fs.readdirSync(path.join(PROJECT_ROOT, "tests", "fixtures"))) {
    try {
        if (!bon_file.endsWith(".bon")) continue;
        // Run if-var.bon twice with different params
        if (bon_file === "if-var.bon") {
            const r1 = load(String(path.join(PROJECT_ROOT, "tests", "fixtures", bon_file)), { env: "test", debug: true });
            const r2 = load(String(path.join(PROJECT_ROOT, "tests", "fixtures", bon_file)), { env: "test", debug: false });
            console.log(`  ${bon_file} 1: ${JSON.stringify(r1, null, 2)}`);
            console.log(`  ${bon_file} 2: ${JSON.stringify(r2, null, 2)}`);
        } else {
            const result = load(String(path.join(PROJECT_ROOT, "tests", "fixtures", bon_file)));
            const preview = JSON.stringify(result, null, 2)
            console.log(`  ${bon_file}: ${preview}`);
        }
    } catch (e: any) {
        console.log(`  ${bon_file}: 失败 - ${e.message}`);
    }
}
