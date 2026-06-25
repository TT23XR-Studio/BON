/**
 * BON Standard Library - Built-in functions for BON evaluator.
 */
export declare class BONRuntimeError extends Error {
    code: string;
    constructor(message: string, code?: string);
}
type FnCaller = (fn: unknown, args: unknown[]) => unknown;
export interface StdLibEntry {
    fn: (args: unknown[], callFn?: FnCaller) => unknown;
    needsCallFn?: boolean;
}
export declare const STD_LIB: Record<string, StdLibEntry>;
export {};
//# sourceMappingURL=stdlib.d.ts.map