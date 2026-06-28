/**
 * BON Parser - Parses token stream into AST.
 */
import { Lexer } from "./lexer.js";
export class ParseError extends Error {
    token;
    constructor(message, token) {
        super(`Parse error at line ${token.line}, column ${token.column}: ${message}`);
        this.token = token;
        this.name = "ParseError";
    }
}
export class Parser {
    tokens;
    pos = 0;
    constructor(tokens) {
        this.tokens = tokens;
    }
    current() {
        return this.tokens[this.pos];
    }
    peek(offset = 0) {
        const idx = this.pos + offset;
        return idx < this.tokens.length ? this.tokens[idx] : this.tokens[this.tokens.length - 1];
    }
    advance() {
        const tok = this.tokens[this.pos];
        if (this.pos < this.tokens.length - 1) {
            this.pos++;
        }
        return tok;
    }
    expect(type) {
        const tok = this.current();
        if (tok.type !== type) {
            throw new ParseError(`Expected ${type}, got ${tok.type} (${JSON.stringify(tok.value)})`, tok);
        }
        return this.advance();
    }
    match(...types) {
        if (types.includes(this.current().type)) {
            return this.advance();
        }
        return null;
    }
    pos_() {
        const tok = this.current();
        return { line: tok.line, column: tok.column };
    }
    // ── Top-level ────────────────────────────────────────────
    parse() {
        const imports = [];
        const templates = {};
        const classes = {};
        const variables = {};
        const body = [];
        // Parse imports
        while (this.current().type === "IMPORT") {
            imports.push(this.parseImport());
        }
        // Parse top-level definitions
        while (this.current().type !== "EOF") {
            const tok = this.current();
            if (tok.type === "PARAM") {
                // $var = value is not allowed - $ prefix is read-only
                if (this.peek(1).type === "EQUALS") {
                    throw new ParseError(`Cannot assign to parameter '$${tok.value}'. Parameters are read-only and must be passed at compile time.`, tok);
                }
                // Expression context - $var as expression
                body.push(this.parseExpression());
                continue;
            }
            if (tok.type === "IDENT") {
                // Template def: name-{ ... }
                if (this.peek(1).type === "DASH" && this.peek(2).type === "LBRACE") {
                    const td = this.parseTemplateDef();
                    templates[td.name] = td;
                    continue;
                }
                // Variable assignment: name = expr
                if (this.peek(1).type === "EQUALS") {
                    const va = this.parseVariableAssign();
                    variables[va.name] = va;
                    continue;
                }
                // Expression
                body.push(this.parseExpression());
                continue;
            }
            if (tok.type === "CLASS") {
                const cd = this.parseClassDef();
                classes[cd.name] = cd;
                continue;
            }
            body.push(this.parseExpression());
        }
        return { imports, templates, classes, variables, body };
    }
    // ── Import ───────────────────────────────────────────────
    parseImport() {
        const pos = this.pos_();
        this.expect("IMPORT");
        const pathTok = this.expect("STRING");
        let alias = null;
        if (this.match("AS")) {
            alias = this.expect("IDENT").value;
        }
        return { kind: "ImportStmt", path: pathTok.value, alias, pos };
    }
    // ── Template ─────────────────────────────────────────────
    parseTemplateDef() {
        const pos = this.pos_();
        const name = this.expect("IDENT").value;
        this.expect("DASH");
        // The body is an expression (can be object literal, array, etc.)
        // No {} delimiters - just parse the expression directly
        const body = this.parseExpression();
        return { kind: "TemplateDef", name, body, pos };
    }
    // ── Class ────────────────────────────────────────────────
    parseClassDef() {
        const pos = this.pos_();
        this.expect("CLASS");
        const name = this.expect("IDENT").value;
        let parent = null;
        if (this.match("EXTENDS")) {
            parent = this.expect("IDENT").value;
        }
        this.expect("LBRACE");
        const members = {};
        const methods = {};
        while (this.current().type !== "RBRACE") {
            if (this.current().type === "FN") {
                const md = this.parseMethodDef();
                methods[md.name] = md;
            }
            else {
                const keyTok = this.current();
                let key;
                // Static keys for class members (no expressions)
                if (keyTok.type === "STRING") {
                    this.advance();
                    key = keyTok.value;
                }
                else if (keyTok.type === "PARAM") {
                    const paramName = keyTok.value;
                    this.advance();
                    key = `__param_key__${paramName}`;
                }
                else {
                    key = this.expect("IDENT").value;
                }
                this.expect("COLON");
                const val = this.parseExpression();
                members[key] = val;
            }
            this.match("COMMA");
        }
        this.expect("RBRACE");
        return { kind: "ClassDef", name, parent, members, methods, pos };
    }
    parseMethodDef() {
        const pos = this.pos_();
        this.expect("FN");
        const name = this.expect("IDENT").value;
        this.expect("LPAREN");
        const params = [];
        if (this.current().type !== "RPAREN") {
            params.push(this.expect("IDENT").value);
            while (this.match("COMMA")) {
                params.push(this.expect("IDENT").value);
            }
        }
        this.expect("RPAREN");
        this.expect("LBRACE");
        const body = this.parseReturnStmt();
        this.expect("RBRACE");
        return { kind: "MethodDef", name, params, body, pos };
    }
    parseReturnStmt() {
        const pos = this.pos_();
        this.expect("RETURN");
        const value = this.parseExpression();
        return { kind: "ReturnStmt", value, pos };
    }
    // ── Variable assignment ──────────────────────────────────
    parseVariableAssign() {
        const pos = this.pos_();
        const name = this.expect("IDENT").value;
        this.expect("EQUALS");
        const value = this.parseExpression();
        return { kind: "VariableAssign", name, value, pos };
    }
    // ── Expressions ──────────────────────────────────────────
    parseExpression() {
        return this.parseComparison();
    }
    parseComparison() {
        let left = this.parseAdditive();
        while (this.current().type === "GT" || this.current().type === "LT" ||
            this.current().type === "GTE" || this.current().type === "LTE" ||
            this.current().type === "EQ_EQ" || this.current().type === "BANG_EQ") {
            const op = this.advance().value;
            const right = this.parseAdditive();
            left = { kind: "BinaryOp", op, left, right, pos: left.pos };
        }
        return left;
    }
    parseAdditive() {
        let left = this.parseMultiplicative();
        while (this.current().type === "PLUS" || this.current().type === "DASH") {
            const op = this.advance().value;
            const right = this.parseMultiplicative();
            left = { kind: "BinaryOp", op, left, right, pos: left.pos };
        }
        return left;
    }
    parseMultiplicative() {
        let left = this.parseUnary();
        while (this.current().type === "STAR" ||
            this.current().type === "SLASH" ||
            this.current().type === "PERCENT") {
            const op = this.advance().value;
            const right = this.parseUnary();
            left = { kind: "BinaryOp", op, left, right, pos: left.pos };
        }
        return left;
    }
    parseUnary() {
        if (this.current().type === "MINUS") {
            const pos = this.pos_();
            this.advance();
            const operand = this.parseUnary();
            return { kind: "UnaryOp", op: "-", operand, pos };
        }
        // if expression has lower precedence than unary
        if (this.current().type === "IF") {
            return this.parseIfExpr();
        }
        return this.parsePostfix();
    }
    parsePostfix() {
        let expr = this.parsePrimary();
        while (true) {
            if (this.current().type === "DOT") {
                this.advance();
                const prop = this.expect("IDENT").value;
                // Method call: obj.method(args)
                if (this.current().type === "LPAREN") {
                    this.advance();
                    const args = [];
                    if (this.current().type !== "RPAREN") {
                        args.push(this.parseExpression());
                        while (this.match("COMMA")) {
                            args.push(this.parseExpression());
                        }
                    }
                    this.expect("RPAREN");
                    expr = { kind: "MethodCall", obj: expr, method: prop, args, pos: expr.pos };
                }
                else {
                    expr = { kind: "PropertyAccess", obj: expr, prop, pos: expr.pos };
                }
            }
            else {
                break;
            }
        }
        return expr;
    }
    parsePrimary() {
        const tok = this.current();
        const pos = this.pos_();
        // Template reference
        if (tok.type === "TEMPLATE_OPEN") {
            this.advance();
            return { kind: "TemplateRef", name: tok.value, pos };
        }
        // Parameter reference
        if (tok.type === "PARAM") {
            this.advance();
            return { kind: "Param", name: tok.value, pos };
        }
        // String literal
        if (tok.type === "STRING") {
            this.advance();
            return { kind: "Literal", value: tok.value, pos };
        }
        // Number literal
        if (tok.type === "NUMBER") {
            this.advance();
            return { kind: "Literal", value: tok.value, pos };
        }
        // Boolean literals
        if (tok.type === "TRUE") {
            this.advance();
            return { kind: "Literal", value: true, pos };
        }
        if (tok.type === "FALSE") {
            this.advance();
            return { kind: "Literal", value: false, pos };
        }
        if (tok.type === "NULL") {
            this.advance();
            return { kind: "Literal", value: null, pos };
        }
        // Anonymous function: fn(params) { body }
        if (tok.type === "FN") {
            return this.parseAnonymousFn();
        }
        // for expression
        if (tok.type === "FOR") {
            return this.parseForLoop();
        }
        // Identifier or class instantiation
        if (tok.type === "IDENT") {
            this.advance();
            // Class instantiation: ClassName { ... }
            if (this.current().type === "LBRACE") {
                return this.parseClassInstantiation(tok.value, pos);
            }
            // Function call: name(args)
            if (this.current().type === "LPAREN") {
                return this.parseFuncCallName(tok.value, pos);
            }
            return { kind: "Identifier", name: tok.value, pos };
        }
        // Array literal
        if (tok.type === "LBRACKET") {
            return this.parseArrayLiteral();
        }
        // Object literal
        if (tok.type === "LBRACE") {
            return this.parseObjectLiteral();
        }
        // Parenthesized expression
        if (tok.type === "LPAREN") {
            this.advance();
            const expr = this.parseExpression();
            this.expect("RPAREN");
            return expr;
        }
        throw new ParseError(`Unexpected token: ${tok.type} (${JSON.stringify(tok.value)})`, tok);
    }
    parseIfExpr() {
        const pos = this.pos_();
        this.expect("IF");
        const cond = this.parseExpression();
        this.expect("LBRACE");
        const thenExpr = this.parseExpression();
        this.expect("RBRACE");
        let elseExpr = null;
        const elseTok = this.match("ELSE");
        if (elseTok) {
            if (this.current().type === "IF") {
                // else if chain
                elseExpr = this.parseIfExpr();
            }
            else {
                this.expect("LBRACE");
                elseExpr = this.parseExpression();
                this.expect("RBRACE");
            }
        }
        return { kind: "IfExpr", cond, thenExpr, elseExpr, pos };
    }
    parseConditionalBlock() {
        const pos = this.pos_();
        this.expect("IF");
        const cond = this.parseExpression();
        this.expect("LBRACE");
        const thenBody = [];
        while (this.current().type !== "RBRACE") {
            const keyTok = this.current();
            let key;
            if (keyTok.type === "STRING") {
                key = { kind: "Literal", value: this.advance().value, pos: this.pos_() };
            }
            else if (keyTok.type === "PARAM") {
                key = { kind: "Param", name: this.advance().value, pos: this.pos_() };
            }
            else {
                key = { kind: "Identifier", name: this.expect("IDENT").value, pos: this.pos_() };
            }
            this.expect("COLON");
            const val = this.parseExpression();
            thenBody.push({ key, value: val });
            this.match("COMMA");
        }
        this.expect("RBRACE");
        let elseBody = null;
        if (this.current().type === "ELSE") {
            this.advance();
            this.expect("LBRACE");
            elseBody = [];
            while (this.current().type !== "RBRACE") {
                const keyTok = this.current();
                let key;
                if (keyTok.type === "STRING") {
                    key = { kind: "Literal", value: this.advance().value, pos: this.pos_() };
                }
                else if (keyTok.type === "PARAM") {
                    key = { kind: "Param", name: this.advance().value, pos: this.pos_() };
                }
                else {
                    key = { kind: "Identifier", name: this.expect("IDENT").value, pos: this.pos_() };
                }
                this.expect("COLON");
                const val = this.parseExpression();
                elseBody.push({ key, value: val });
                this.match("COMMA");
            }
            this.expect("RBRACE");
        }
        return { kind: "ConditionalBlock", cond, thenBody, elseBody, pos };
    }
    parseForLoop() {
        const pos = this.pos_();
        this.expect("FOR");
        const varName = this.expect("IDENT").value;
        let varName2 = null;
        if (this.match("COMMA")) {
            varName2 = this.expect("IDENT").value;
        }
        this.expect("IN");
        const iterable = this.parseRangeOrExpression();
        // Body is a single expression (may be object literal or just expression)
        const body = this.parseExpression();
        return { kind: "ForLoop", varName, varName2, iterable, body, pos };
    }
    parseRangeOrExpression() {
        // Check for range: NUMBER DOT_DOT NUMBER
        if (this.current().type === "NUMBER" && this.peek(1).type === "DOT_DOT") {
            const pos = this.pos_();
            const startTok = this.advance();
            const start = startTok.value;
            this.advance(); // consume DOT_DOT
            const endTok = this.expect("NUMBER");
            const end = endTok.value;
            // Validate non-negative
            if (start < 0 || end < 0) {
                throw new ParseError("Range bounds must be non-negative", endTok);
            }
            if (start > end) {
                throw new ParseError("Range start must not exceed end", endTok);
            }
            return { kind: "Range", start, end, pos };
        }
        return this.parseExpression();
    }
    parseAnonymousFn() {
        const pos = this.pos_();
        this.expect("FN");
        this.expect("LPAREN");
        const params = [];
        if (this.current().type !== "RPAREN") {
            params.push(this.expect("IDENT").value);
            while (this.match("COMMA")) {
                params.push(this.expect("IDENT").value);
            }
        }
        this.expect("RPAREN");
        this.expect("LBRACE");
        const body = this.parseReturnStmt();
        this.expect("RBRACE");
        return { kind: "FuncDef", params, body, pos };
    }
    parseClassInstantiation(className, pos) {
        this.expect("LBRACE");
        const overrides = {};
        while (this.current().type !== "RBRACE") {
            const keyTok = this.current();
            let key;
            if (keyTok.type === "STRING") {
                this.advance();
                key = keyTok.value;
            }
            else {
                key = this.expect("IDENT").value;
            }
            this.expect("COLON");
            const val = this.parseExpression();
            overrides[key] = val;
            this.match("COMMA");
        }
        this.expect("RBRACE");
        return { kind: "ClassInstance", className, overrides, pos };
    }
    parseArrayLiteral() {
        const pos = this.pos_();
        this.expect("LBRACKET");
        const elements = [];
        if (this.current().type !== "RBRACKET") {
            elements.push(this.parseExpression());
            while (this.match("COMMA")) {
                if (this.current().type === "RBRACKET")
                    break;
                elements.push(this.parseExpression());
            }
        }
        this.expect("RBRACKET");
        return { kind: "ArrayLit", elements, pos };
    }
    parseObjectLiteral() {
        const pos = this.pos_();
        this.expect("LBRACE");
        const pairs = [];
        const conditions = [];
        while (this.current().type !== "RBRACE") {
            if (this.current().type === "IF") {
                conditions.push(this.parseConditionalBlock());
            }
            else {
                // Check if this looks like an expression key (followed by colon)
                const savedPos = this.pos;
                const key = this.parseExpression();
                // If followed by COLON, this was a key - parse the value
                if (this.current().type === "COLON") {
                    this.expect("COLON");
                    const val = this.parseExpression();
                    pairs.push({ key, value: val });
                }
                else {
                    // This was a value (bare expression) - backtrack and parse as value
                    this.pos = savedPos;
                    const val = this.parseExpression();
                    if (val.kind === "TemplateRef") {
                        pairs.push({ key: val, value: { kind: "Literal", value: true, pos: val.pos } });
                    }
                    else {
                        pairs.push({ key: { kind: "Literal", value: "_", pos }, value: val });
                    }
                }
            }
            this.match("COMMA");
        }
        this.expect("RBRACE");
        return { kind: "ObjectLit", pairs, conditions: conditions.length > 0 ? conditions : undefined, pos };
    }
    parseFuncCallName(name, pos) {
        this.expect("LPAREN");
        const args = [];
        if (this.current().type !== "RPAREN") {
            args.push(this.parseExpression());
            while (this.match("COMMA")) {
                if (this.current().type === "RPAREN")
                    break;
                args.push(this.parseExpression());
            }
        }
        this.expect("RPAREN");
        return { kind: "FuncCall", name, args, pos };
    }
}
export function parse(source, filename = "<stdin>") {
    const lexer = new Lexer(source, filename);
    const tokens = lexer.tokens();
    const parser = new Parser(tokens);
    return parser.parse();
}
//# sourceMappingURL=parser.js.map