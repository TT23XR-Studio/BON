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
export class Evaluator {
    baseDir;
    templates = {};
    classes = {};
    variables = {};
    importStack = [];
    callFn;
    constructor(baseDir = ".") {
        this.baseDir = baseDir;
        this.callFn = this.createFnCaller();
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
        // Evaluate body
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
                for (const [key, val] of Object.entries(n.pairs)) {
                    obj[key] = this.eval(val);
                }
                return obj;
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
        // Store methods
        for (const [name, md] of Object.entries(resolvedMethods)) {
            instance[name] = { __method__: true, def: md, classDef: cd, instance };
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
        // If obj is a dict with __method__, call the method directly
        if (obj && typeof obj === "object" && "__method__" in obj) {
            const m = obj;
            const args = node.args.map((a) => this.eval(a));
            const oldVars = { ...this.variables };
            this.variables["self"] = m.instance;
            try {
                return this.evalFuncDef(m.def, args, {});
            }
            finally {
                this.variables = oldVars;
            }
        }
        // If obj is a class instance (dict), look up the method on it
        if (obj && typeof obj === "object" && !Array.isArray(obj) && node.method in obj) {
            const methodVal = obj[node.method];
            if (methodVal && typeof methodVal === "object" && "__method__" in methodVal) {
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
            const imported = new Evaluator(path.dirname(filepath));
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
export function evaluate(source, baseDir = ".") {
    const program = parse(source);
    const evaluator = new Evaluator(baseDir);
    return evaluator.evaluate(program);
}
export function loads(source, baseDir = ".") {
    return evaluate(source, baseDir);
}
export function load(filepath) {
    const source = fs.readFileSync(filepath, "utf-8");
    return evaluate(source, path.dirname(filepath));
}
//# sourceMappingURL=evaluator.js.map