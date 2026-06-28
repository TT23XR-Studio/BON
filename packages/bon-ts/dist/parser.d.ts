/**
 * BON Parser - Parses token stream into AST.
 */
import type { Token } from "./lexer.js";
import type { Program } from "./ast.js";
export declare class ParseError extends Error {
    token: Token;
    constructor(message: string, token: Token);
}
export declare class Parser {
    private tokens;
    private pos;
    constructor(tokens: Token[]);
    private current;
    private peek;
    private advance;
    private expect;
    private match;
    private pos_;
    parse(): Program;
    private parseImport;
    private parseTemplateDef;
    private parseClassDef;
    private parseMethodDef;
    private parseReturnStmt;
    private parseVariableAssign;
    private parseExpression;
    private parseComparison;
    private parseAdditive;
    private parseMultiplicative;
    private parseUnary;
    private parsePostfix;
    private parsePrimary;
    private parseIfExpr;
    private parseConditionalBlock;
    private parseForLoop;
    private parseRangeOrExpression;
    private parseAnonymousFn;
    private parseClassInstantiation;
    private parseArrayLiteral;
    private parseObjectLiteral;
    private parseFuncCallName;
}
export declare function parse(source: string, filename?: string): Program;
//# sourceMappingURL=parser.d.ts.map