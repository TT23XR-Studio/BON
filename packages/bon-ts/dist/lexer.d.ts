/**
 * BON Lexer - Tokenizer for BON source code.
 */
export type TokenType = "STRING" | "NUMBER" | "TRUE" | "FALSE" | "NULL" | "IDENT" | "CLASS" | "EXTENDS" | "FN" | "RETURN" | "IMPORT" | "AS" | "LBRACE" | "RBRACE" | "LBRACKET" | "RBRACKET" | "COLON" | "COMMA" | "DOT" | "LPAREN" | "RPAREN" | "DASH" | "EQUALS" | "PLUS" | "MINUS" | "STAR" | "SLASH" | "PERCENT" | "GT" | "LT" | "GTE" | "LTE" | "EQ_EQ" | "BANG_EQ" | "TEMPLATE_OPEN" | "EOF";
export interface Token {
    type: TokenType;
    value: string | number | boolean | null;
    line: number;
    column: number;
}
export declare class LexerError extends Error {
    line: number;
    column: number;
    constructor(message: string, line: number, column: number);
}
export declare class Lexer {
    private filename;
    private source;
    private pos;
    private line;
    private column;
    constructor(source: string, filename?: string);
    private peek;
    private advance;
    private skipWhitespace;
    private skipComment;
    private readString;
    private readNumber;
    private readIdentifier;
    private checkTemplateRef;
    tokens(): Token[];
}
//# sourceMappingURL=lexer.d.ts.map