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
    private templates;
    private classes;
    private variables;
    private importStack;
    private callFn;
    constructor(baseDir?: string);
    private createFnCaller;
    private callAnonymousFunc;
    evaluate(program: Program): unknown;
    eval(node: unknown): unknown;
    private resolveIdentifier;
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
    private resolveImport;
}
export declare function parse(source: string, filename?: string): Program;
export declare function evaluate(source: string, baseDir?: string): unknown;
export declare function loads(source: string, baseDir?: string): unknown;
export declare function load(filepath: string): unknown;
//# sourceMappingURL=evaluator.d.ts.map