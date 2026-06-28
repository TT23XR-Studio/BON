/**
 * BON Evaluator - Evaluates AST to produce pure JSON output.
 */
import type { Position, Program } from "./ast.js";
export declare class EvalError extends Error {
    code: string;
    pos?: Position | undefined;
    constructor(message: string, code?: string, pos?: Position | undefined);
}
export declare class Evaluator {
    private baseDir;
    private params;
    private templates;
    private classes;
    private variables;
    private importStack;
    private callFn;
    MAX_ITERATIONS: number;
    private inExprContext;
    constructor(baseDir?: string, params?: Record<string, unknown>);
    private toBool;
    private createFnCaller;
    private callAnonymousFunc;
    evaluate(program: Program): unknown;
    eval(node: unknown): unknown;
    private resolveIdentifier;
    private resolveParam;
    private expandTemplate;
    private instantiateClass;
    private resolveClassHierarchy;
    private getParentChain;
    private evalWithSelf;
    private evalMethodCall;
    private evalFuncCall;
    private evalFuncDef;
    private evalBinaryOp;
    private evalUnaryOp;
    private evalPropertyAccess;
    private evalIfExpr;
    private evalObjKey;
    private evalConditionalBlockInto;
    private evalForLoop;
    private resolveImport;
    sanitize(obj: unknown): unknown;
}
export declare function parse(source: string, filename?: string): Program;
export declare function evaluate(source: string, baseDir?: string, params?: Record<string, unknown>): unknown;
export declare function loads(source: string, baseDir?: string, params?: Record<string, unknown>): unknown;
export declare function load(filepath: string, params?: Record<string, unknown>): unknown;
//# sourceMappingURL=evaluator.d.ts.map