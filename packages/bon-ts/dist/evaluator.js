/**
 * BON Evaluator - Evaluates AST to produce pure JSON output.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js";
import { STD_LIB } from "./stdlib.js";
export class EvalError extends Error {
    code;
    pos;
    constructor(message, code = "E999", pos) {
        const loc = pos ? ` at line ${pos.line}, column ${pos.column}` : "";
        super(`${code}: ${message}${loc}`);
        this.code = code;
        this.pos = pos;
        this.name = "EvalError";
    }
}
const PRUNED = Symbol("PRUNED"); // Sentinel for pruned if-expressions
export class Evaluator {
    baseDir;
    params;
    templates = {};
    classes = {};
    variables = {};
    importStack = [];
    callFn;
    MAX_ITERATIONS = 10000;
    // Context tracking for if-expression pruning
    // Top = true: expression context (else required), false: object block context (pruning allowed)
    inExprContext = [true];
    constructor(baseDir = ".", params = {}) {
        this.baseDir = baseDir;
        this.params = params;
        this.callFn = this.createFnCaller();
    }
    toBool(value) {
        if (typeof value === "boolean")
            return value;
        if (value === null)
            return false;
        if (typeof value === "number")
            return value !== 0;
        if (typeof value === "string")
            return value.length > 0;
        if (Array.isArray(value))
            return value.length > 0;
        if (typeof value === "object")
            return Object.keys(value).length > 0;
        return true;
    }
    createFnCaller() {
        return (fn, args) => {
            return this.callAnonymousFunc(fn, args);
        };
    }
    callAnonymousFunc(fn, args) {
        if (fn && typeof fn === "object" && "__bonFunc__" in fn) {
            const func = fn;
            return this.evalFuncDef(func.def, args, func.closure);
        }
        throw new EvalError(`Cannot call non-function: ${typeof fn}`, "E007");
    }
    evaluate(program) {
        // Phase 0: Parameter injection (done by constructor params)
        // Phase 1: Import resolution
        for (const imp of program.imports) {
            this.resolveImport(imp);
        }
        // Merge definitions
        for (const [name, td] of Object.entries(program.templates)) {
            this.templates[name] = td;
        }
        for (const [name, cd] of Object.entries(program.classes)) {
            this.classes[name] = cd;
        }
        for (const [name, va] of Object.entries(program.variables)) {
            this.variables[name] = this.eval(va.value);
        }
        // Phase 2: Symbol resolution (E009 handled by resolveParam on demand)
        // Phase 3: Control flow expansion (happens during eval)
        // Phase 4: Template expansion (happens during eval)
        // Phase 5: Constant folding (happens during eval)
        // Evaluate body
        this.inExprContext = [true]; // Top-level is expression context
        const results = [];
        for (const expr of program.body) {
            results.push(this.eval(expr));
        }
        return results.length === 1 ? results[0] : results;
    }
    eval(node) {
        if (node === null || node === undefined)
            return node;
        const n = node;
        switch (n.kind) {
            case "Literal":
                return n.value;
            case "Identifier":
                return this.resolveIdentifier(n.name, n.pos);
            case "Param":
                return this.resolveParam(n.name, n.pos);
            case "TemplateRef":
                return this.expandTemplate(n.name, n.pos);
            case "TemplateDef":
            case "ClassDef":
                return node; // stored, not evaluated directly
            case "ClassInstance":
                return this.instantiateClass(n);
            case "MethodCall":
                return this.evalMethodCall(n);
            case "FuncCall":
                return this.evalFuncCall(n);
            case "FuncDef": {
                const fd = n;
                return { __bonFunc__: true, def: fd, closure: { ...this.variables } };
            }
            case "BinaryOp":
                return this.evalBinaryOp(n);
            case "UnaryOp":
                return this.evalUnaryOp(n);
            case "PropertyAccess":
                return this.evalPropertyAccess(n);
            case "ArrayLit":
                return n.elements.map((el) => this.eval(el));
            case "ObjectLit": {
                const obj = {};
                const objNode = n;
                this.inExprContext.push(false);
                try {
                    // Evaluate conditional blocks first
                    if (objNode.conditions) {
                        for (const block of objNode.conditions) {
                            this.evalConditionalBlockInto(block, obj);
                        }
                    }
                    // Evaluate key-value pairs
                    for (const pair of objNode.pairs) {
                        // Handle TemplateRef key (bare template reference shorthand)
                        if (pair.key.kind === "TemplateRef") {
                            const tmplKey = pair.key.name;
                            const evaluated = this.expandTemplate(tmplKey, pair.key.pos);
                            if (evaluated !== PRUNED) {
                                obj[tmplKey] = evaluated;
                            }
                            continue;
                        }
                        const keyStr = this.evalObjKey(pair.key);
                        if (keyStr === null)
                            continue; // PRUNED
                        const evaluated = this.eval(pair.value);
                        if (evaluated !== PRUNED) {
                            obj[keyStr] = evaluated;
                        }
                    }
                }
                finally {
                    this.inExprContext.pop();
                }
                return obj;
            }
            case "Range": {
                const r = n;
                return Array.from({ length: r.end - r.start }, (_, i) => i + r.start);
            }
            case "IfExpr":
                return this.evalIfExpr(n);
            case "ForLoop":
                return this.evalForLoop(n);
            case "ConditionalBlock": {
                const result = {};
                this.evalConditionalBlockInto(n, result);
                return Object.keys(result).length > 0 ? result : PRUNED;
            }
            case "ReturnStmt":
                return this.eval(n.value);
            case "VariableAssign": {
                const va = n;
                const val = this.eval(va.value);
                this.variables[va.name] = val;
                return val;
            }
        }
        throw new EvalError(`Unknown node kind: ${n.kind}`);
    }
    resolveIdentifier(name, pos) {
        if (name in this.variables)
            return this.variables[name];
        if (name in this.templates)
            return this.templates[name];
        if (name in this.classes)
            return this.classes[name];
        throw new EvalError(`Undefined identifier: ${name}`, "E001", pos);
    }
    resolveParam(name, pos) {
        if (!(name in this.params)) {
            const available = Object.keys(this.params).join(", ");
            throw new EvalError(`Missing parameter: $${name}. Available: $${available}`, "E009", pos);
        }
        return this.params[name];
    }
    expandTemplate(name, pos) {
        if (!(name in this.templates)) {
            throw new EvalError(`Undefined template: ${name}`, "E001", pos);
        }
        return deepCopy(this.eval(this.templates[name].body));
    }
    instantiateClass(node) {
        const { className, overrides, pos } = node;
        if (!(className in this.classes)) {
            throw new EvalError(`Undefined class: ${className}`, "E003", pos);
        }
        const cd = this.classes[className];
        const [resolvedMembers, resolvedMethods] = this.resolveClassHierarchy(cd);
        // Apply overrides
        for (const [key, val] of Object.entries(overrides)) {
            resolvedMembers[key] = val;
        }
        // Build instance
        const instance = {};
        for (const [key, val] of Object.entries(resolvedMembers)) {
            instance[key] = val; // May be Expression, evaluated below
        }
        // Evaluate computed properties (self-referencing)
        for (const [key, val] of Object.entries(instance)) {
            if (val && typeof val === "object" && "kind" in val) {
                instance[key] = this.evalWithSelf(val, instance);
            }
        }
        // Store methods (without instance reference to avoid cycle in JSON output)
        for (const [name, md] of Object.entries(resolvedMethods)) {
            instance[name] = { __bonMethod__: true, def: md, classDef: cd };
        }
        return instance;
    }
    resolveClassHierarchy(cd) {
        const members = {};
        const methods = {};
        const chain = this.getParentChain(cd);
        for (const parentCd of chain) {
            for (const [k, v] of Object.entries(parentCd.members))
                members[k] = v;
            for (const [k, v] of Object.entries(parentCd.methods))
                methods[k] = v;
        }
        for (const [k, v] of Object.entries(cd.members))
            members[k] = v;
        for (const [k, v] of Object.entries(cd.methods))
            methods[k] = v;
        return [members, methods];
    }
    getParentChain(cd) {
        const chain = [];
        const seen = new Set();
        let current = cd.parent;
        while (current) {
            if (seen.has(current)) {
                throw new EvalError(`Circular inheritance detected: ${current}`, "E004");
            }
            seen.add(current);
            if (!(current in this.classes)) {
                throw new EvalError(`Undefined parent class: ${current}`, "E003");
            }
            const parentCd = this.classes[current];
            chain.push(parentCd);
            current = parentCd.parent;
        }
        return chain;
    }
    evalWithSelf(expr, selfObj) {
        const oldVars = { ...this.variables };
        this.variables["self"] = selfObj;
        try {
            return this.eval(expr);
        }
        finally {
            this.variables = oldVars;
        }
    }
    evalMethodCall(node) {
        // Handle std.xxx calls as a special case (before evaluating obj)
        if (node.obj.kind === "Identifier" && node.obj.name === "std") {
            const funcName = node.method;
            if (funcName in STD_LIB) {
                const args = node.args.map((a) => this.eval(a));
                const entry = STD_LIB[funcName];
                if (entry.needsCallFn) {
                    return entry.fn(args, this.callFn);
                }
                return entry.fn(args);
            }
            throw new EvalError(`Undefined std function: ${funcName}`, "E001", node.pos);
        }
        const obj = this.eval(node.obj);
        // If obj is a class instance (dict), look up the method on it
        if (obj && typeof obj === "object" && !Array.isArray(obj) && node.method in obj) {
            const methodVal = obj[node.method];
            if (methodVal && typeof methodVal === "object" && "__bonMethod__" in methodVal) {
                const m = methodVal;
                const args = node.args.map((a) => this.eval(a));
                const oldVars = { ...this.variables };
                this.variables["self"] = obj;
                try {
                    return this.evalFuncDef(m.def, args, {});
                }
                finally {
                    this.variables = oldVars;
                }
            }
        }
        throw new EvalError(`Cannot call method on non-object: ${typeof obj}`, "E007", node.pos);
    }
    evalFuncCall(node) {
        const args = node.args.map((a) => this.eval(a));
        // Check std library
        if (node.name.startsWith("std.")) {
            const funcName = node.name.slice(4);
            if (funcName in STD_LIB) {
                const entry = STD_LIB[funcName];
                if (entry.needsCallFn) {
                    return entry.fn(args, this.callFn);
                }
                return entry.fn(args);
            }
        }
        // Check user-defined functions
        if (node.name in this.variables) {
            const fn = this.variables[node.name];
            if (fn && typeof fn === "object" && "__bonFunc__" in fn) {
                return this.callAnonymousFunc(fn, args);
            }
        }
        throw new EvalError(`Undefined function: ${node.name}`, "E001", node.pos);
    }
    evalFuncDef(def, args, closure) {
        const params = def.params;
        if (args.length < params.length) {
            throw new EvalError(`Function expects ${params.length} arguments, got ${args.length}`, "E007");
        }
        const oldVars = { ...this.variables };
        Object.assign(this.variables, closure);
        for (let i = 0; i < params.length; i++) {
            this.variables[params[i]] = args[i];
        }
        try {
            return this.eval(def.body);
        }
        finally {
            this.variables = oldVars;
        }
    }
    evalBinaryOp(node) {
        const left = this.eval(node.left);
        const right = this.eval(node.right);
        switch (node.op) {
            case "+":
                if (typeof left === "string" && typeof right === "string")
                    return left + right;
                if (Array.isArray(left) && Array.isArray(right))
                    return [...left, ...right];
                if (typeof left === "number" && typeof right === "number")
                    return left + right;
                throw new EvalError(`Cannot apply '+' to ${typeLabel(left)} and ${typeLabel(right)}`, "E007", node.pos);
            case "-":
                if (typeof left === "number" && typeof right === "number")
                    return left - right;
                throw new EvalError(`Cannot apply '-' to ${typeLabel(left)} and ${typeLabel(right)}`, "E007", node.pos);
            case "*":
                if (typeof left === "number" && typeof right === "number")
                    return left * right;
                throw new EvalError(`Cannot apply '*' to ${typeLabel(left)} and ${typeLabel(right)}`, "E007", node.pos);
            case "/":
                if (typeof left === "number" && typeof right === "number") {
                    if (right === 0)
                        throw new EvalError("Division by zero", "E007", node.pos);
                    return left / right;
                }
                throw new EvalError(`Cannot apply '/' to ${typeLabel(left)} and ${typeLabel(right)}`, "E007", node.pos);
            case "%":
                if (typeof left === "number" && typeof right === "number")
                    return left % right;
                throw new EvalError(`Cannot apply '%' to ${typeLabel(left)} and ${typeLabel(right)}`, "E007", node.pos);
            // Comparison operators
            case ">":
                if (typeof left === "number" && typeof right === "number")
                    return left > right;
                if (typeof left === "string" && typeof right === "string")
                    return left > right;
                throw new EvalError(`Cannot compare ${typeLabel(left)} and ${typeLabel(right)}`, "E007", node.pos);
            case "<":
                if (typeof left === "number" && typeof right === "number")
                    return left < right;
                if (typeof left === "string" && typeof right === "string")
                    return left < right;
                throw new EvalError(`Cannot compare ${typeLabel(left)} and ${typeLabel(right)}`, "E007", node.pos);
            case ">=":
                if (typeof left === "number" && typeof right === "number")
                    return left >= right;
                if (typeof left === "string" && typeof right === "string")
                    return left >= right;
                throw new EvalError(`Cannot compare ${typeLabel(left)} and ${typeLabel(right)}`, "E007", node.pos);
            case "<=":
                if (typeof left === "number" && typeof right === "number")
                    return left <= right;
                if (typeof left === "string" && typeof right === "string")
                    return left <= right;
                throw new EvalError(`Cannot compare ${typeLabel(left)} and ${typeLabel(right)}`, "E007", node.pos);
            case "==":
                return left === right;
            case "!=":
                return left !== right;
            default:
                throw new EvalError(`Unknown operator: ${node.op}`, "E007", node.pos);
        }
    }
    evalUnaryOp(node) {
        const operand = this.eval(node.operand);
        if (node.op === "-") {
            if (typeof operand === "number")
                return -operand;
            throw new EvalError(`Cannot negate ${typeLabel(operand)}`, "E007", node.pos);
        }
        throw new EvalError(`Unknown unary operator: ${node.op}`, "E007", node.pos);
    }
    evalPropertyAccess(node) {
        const obj = this.eval(node.obj);
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
            const rec = obj;
            if (node.prop in rec)
                return rec[node.prop];
            throw new EvalError(`Property '${node.prop}' not found on object`, "E007", node.pos);
        }
        throw new EvalError(`Cannot access property on ${typeLabel(obj)}`, "E007", node.pos);
    }
    evalIfExpr(node) {
        const cond = this.toBool(this.eval(node.cond));
        if (cond) {
            return this.eval(node.thenExpr);
        }
        else if (node.elseExpr !== null) {
            return this.eval(node.elseExpr);
        }
        // No else branch and condition is false
        if (this.inExprContext[this.inExprContext.length - 1]) {
            throw new EvalError("if expression without else must be inside an object block, got expression context", "E011", node.pos);
        }
        // Object block context - return pruned sentinel
        return PRUNED;
    }
    evalObjKey(keyExpr) {
        if (keyExpr.kind === "Param") {
            const key = this.resolveParam(keyExpr.name, keyExpr.pos);
            if (typeof key !== "string") {
                throw new EvalError(`Object key from $ variable must be string, got ${typeLabel(key)}`, "E011", keyExpr.pos);
            }
            return key;
        }
        if (keyExpr.kind === "Literal") {
            return String(keyExpr.value);
        }
        if (keyExpr.kind === "Identifier") {
            return keyExpr.name;
        }
        // Computed key: evaluate the expression
        const evaluated = this.eval(keyExpr);
        if (evaluated === PRUNED)
            return null;
        return String(evaluated);
    }
    evalConditionalBlockInto(block, result) {
        const cond = this.toBool(this.eval(block.cond));
        const entries = cond ? block.thenBody : block.elseBody;
        if (!entries)
            return;
        for (const pair of entries) {
            const key = this.evalObjKey(pair.key);
            if (key === null)
                continue;
            const evaluated = this.eval(pair.value);
            if (evaluated !== PRUNED) {
                result[key] = evaluated;
            }
        }
    }
    evalForLoop(node) {
        const iterable = this.eval(node.iterable);
        // Handle range (already expanded to array)
        if (Array.isArray(iterable)) {
            if (iterable.length > this.MAX_ITERATIONS) {
                throw new EvalError(`For loop iteration count exceeds maximum (${iterable.length} > ${this.MAX_ITERATIONS}). ` +
                    `Consider using a smaller range or std.map.`, "E010", node.pos);
            }
            // varName2 is only for object iteration, not arrays
            if (node.varName2 !== null) {
                throw new EvalError(`For loop with two variables can only iterate over objects, got array`, "E011", node.pos);
            }
            const results = [];
            for (const item of iterable) {
                const oldVars = { ...this.variables };
                this.variables[node.varName] = item;
                try {
                    let result = this.eval(node.body);
                    if (result === PRUNED)
                        continue;
                    // If body is an object with single "_" key, extract the value
                    if (result && typeof result === "object" && "_" in result && Object.keys(result).length === 1) {
                        result = result["_"];
                    }
                    results.push(result);
                }
                finally {
                    this.variables = oldVars;
                }
            }
            return results;
        }
        if (iterable === null || typeof iterable !== "object") {
            throw new EvalError(`for loop requires iterable (array, object, or range), got ${typeLabel(iterable)}`, "E011", node.pos);
        }
        const iterableObj = iterable;
        if (Object.keys(iterableObj).length > this.MAX_ITERATIONS) {
            throw new EvalError(`For loop iteration count exceeds maximum (${Object.keys(iterableObj).length} > ${this.MAX_ITERATIONS}). ` +
                `Consider using a smaller iterable or std.map.`, "E010", node.pos);
        }
        if (node.varName2 !== null) {
            // Key-value pair mode: return object (merge body objects)
            const resultObj = {};
            for (const [key, value] of Object.entries(iterableObj)) {
                const oldVars = { ...this.variables };
                this.variables[node.varName] = key;
                this.variables[node.varName2] = value;
                try {
                    let result = this.eval(node.body);
                    if (result === PRUNED)
                        continue;
                    // If body is an object with single "_" key, extract the value
                    if (result && typeof result === "object" && "_" in result && Object.keys(result).length === 1) {
                        result = result["_"];
                    }
                    // Merge into result object (last value wins for duplicate keys)
                    if (result && typeof result === "object" && !Array.isArray(result)) {
                        Object.assign(resultObj, result);
                    }
                }
                finally {
                    this.variables = oldVars;
                }
            }
            return resultObj;
        }
        // Single var over object returns array of values
        const results = [];
        for (const [key, value] of Object.entries(iterableObj)) {
            const oldVars = { ...this.variables };
            this.variables[node.varName] = value;
            try {
                const result = this.eval(node.body);
                if (result === PRUNED)
                    continue;
                // If body is an object with single "_" key, extract the value
                if (result && typeof result === "object" && "_" in result && Object.keys(result).length === 1) {
                    results.push(result["_"]);
                }
                else {
                    // Single value - push to array
                    results.push(result);
                }
            }
            finally {
                this.variables = oldVars;
            }
        }
        return results;
    }
    resolveImport(imp) {
        const filepath = path.resolve(this.baseDir, imp.path);
        if (this.importStack.includes(filepath)) {
            const cycle = [...this.importStack, filepath].join(" -> ");
            throw new EvalError(`Circular import detected: ${cycle}`, "E008");
        }
        if (!fs.existsSync(filepath)) {
            throw new EvalError(`Import file not found: ${imp.path}`, "E008");
        }
        const source = fs.readFileSync(filepath, "utf-8");
        this.importStack.push(filepath);
        try {
            const imported = new Evaluator(path.dirname(filepath), this.params);
            imported.templates = { ...this.templates };
            imported.classes = { ...this.classes };
            imported.variables = { ...this.variables };
            imported.importStack = [...this.importStack];
            const program = parse(source, filepath);
            imported.evaluate(program);
            this.templates = { ...imported.templates };
            this.classes = { ...imported.classes };
            this.variables = { ...imported.variables };
        }
        finally {
            this.importStack.pop();
        }
        if (imp.alias) {
            const ns = {};
            for (const name of [...Object.keys(this.templates), ...Object.keys(this.classes)]) {
                if (name in this.templates)
                    ns[name] = this.templates[name];
                else if (name in this.classes)
                    ns[name] = this.classes[name];
            }
            this.variables[imp.alias] = ns;
        }
    }
    sanitize(obj) {
        // Handle pruned sentinel - return null for standalone context
        if (obj === PRUNED) {
            return null;
        }
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
            const rec = obj;
            if ("__bonMethod__" in rec) {
                return null;
            }
            const result = {};
            for (const [k, v] of Object.entries(rec)) {
                if (!k.startsWith("__")) {
                    result[k] = this.sanitize(v);
                }
            }
            return result;
        }
        if (Array.isArray(obj)) {
            return obj.map((item) => this.sanitize(item));
        }
        return obj;
    }
}
// ── Helpers ──────────────────────────────────────────────────
function typeLabel(val) {
    if (val === null || val === undefined)
        return "null";
    if (Array.isArray(val))
        return "array";
    return typeof val;
}
function deepCopy(obj) {
    if (obj === null || typeof obj !== "object")
        return obj;
    if (Array.isArray(obj))
        return obj.map((x) => deepCopy(x));
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
        result[k] = deepCopy(v);
    }
    return result;
}
// ── Public API ───────────────────────────────────────────────
export function parse(source, filename = "<stdin>") {
    const lexer = new Lexer(source, filename);
    const tokens = lexer.tokens();
    const parser = new Parser(tokens);
    return parser.parse();
}
export function evaluate(source, baseDir = ".", params = {}) {
    const program = parse(source);
    const evaluator = new Evaluator(baseDir, params);
    const result = evaluator.evaluate(program);
    return evaluator.sanitize(result);
}
export function loads(source, baseDir = ".", params = {}) {
    return evaluate(source, baseDir, params);
}
export function load(filepath, params = {}) {
    const source = fs.readFileSync(filepath, "utf-8");
    return evaluate(source, path.dirname(filepath), params);
}
//# sourceMappingURL=evaluator.js.map