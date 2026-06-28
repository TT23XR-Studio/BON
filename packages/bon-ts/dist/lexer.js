/**
 * BON Lexer - Tokenizer for BON source code.
 */
const KEYWORDS = {
    class: "CLASS",
    extends: "EXTENDS",
    fn: "FN",
    return: "RETURN",
    import: "IMPORT",
    as: "AS",
    true: "TRUE",
    false: "FALSE",
    null: "NULL",
    if: "IF",
    else: "ELSE",
    for: "FOR",
    in: "IN",
};
export class LexerError extends Error {
    line;
    column;
    constructor(message, line, column) {
        super(`Lexer error at line ${line}, column ${column}: ${message}`);
        this.line = line;
        this.column = column;
        this.name = "LexerError";
    }
}
export class Lexer {
    filename;
    source;
    pos = 0;
    line = 1;
    column = 1;
    constructor(source, filename = "<stdin>") {
        this.filename = filename;
        this.source = source;
    }
    peek() {
        return this.pos < this.source.length ? this.source[this.pos] : null;
    }
    advance() {
        const ch = this.source[this.pos++];
        if (ch === "\n") {
            this.line++;
            this.column = 1;
        }
        else {
            this.column++;
        }
        return ch;
    }
    skipWhitespace() {
        while (this.pos < this.source.length && " \t\r\n".includes(this.source[this.pos])) {
            this.advance();
        }
    }
    skipComment() {
        if (this.pos >= this.source.length)
            return false;
        const ch = this.source[this.pos];
        if (ch === "#") {
            while (this.pos < this.source.length && this.source[this.pos] !== "\n") {
                this.advance();
            }
            return true;
        }
        if (ch === "/" && this.pos + 1 < this.source.length && this.source[this.pos + 1] === "/") {
            while (this.pos < this.source.length && this.source[this.pos] !== "\n") {
                this.advance();
            }
            return true;
        }
        return false;
    }
    readString() {
        const startLine = this.line;
        const startCol = this.column;
        const quote = this.advance(); // consume opening quote
        const result = [];
        while (this.pos < this.source.length) {
            const ch = this.source[this.pos];
            if (ch === quote) {
                this.advance();
                return { type: "STRING", value: result.join(""), line: startLine, column: startCol };
            }
            if (ch === "\\") {
                this.advance();
                const esc = this.pos < this.source.length ? this.advance() : "";
                const escapeMap = {
                    n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', "'": "'", "/": "/", "0": "\0",
                };
                if (esc in escapeMap) {
                    result.push(escapeMap[esc]);
                }
                else if (esc === "u") {
                    let hexStr = "";
                    for (let i = 0; i < 4 && this.pos < this.source.length; i++) {
                        if ("0123456789abcdefABCDEF".includes(this.source[this.pos])) {
                            hexStr += this.advance();
                        }
                    }
                    result.push(String.fromCharCode(parseInt(hexStr, 16)));
                }
                else {
                    result.push(esc);
                }
            }
            else {
                result.push(this.advance());
            }
        }
        throw new LexerError("Unterminated string", startLine, startCol);
    }
    readNumber() {
        const startLine = this.line;
        const startCol = this.column;
        let numStr = "";
        let hasDot = false;
        if (this.pos < this.source.length && this.source[this.pos] === "-") {
            numStr += this.advance();
        }
        while (this.pos < this.source.length && this.source[this.pos] >= "0" && this.source[this.pos] <= "9") {
            numStr += this.advance();
        }
        if (this.pos < this.source.length && this.source[this.pos] === ".") {
            // Check for .. (range), don't consume the dot
            if (this.pos + 1 < this.source.length && this.source[this.pos + 1] === ".") {
                // This is a range operator, not a decimal point
            }
            else {
                hasDot = true;
                numStr += this.advance();
                while (this.pos < this.source.length && this.source[this.pos] >= "0" && this.source[this.pos] <= "9") {
                    numStr += this.advance();
                }
            }
        }
        if (this.pos < this.source.length && (this.source[this.pos] === "e" || this.source[this.pos] === "E")) {
            numStr += this.advance();
            if (this.pos < this.source.length && (this.source[this.pos] === "+" || this.source[this.pos] === "-")) {
                numStr += this.advance();
            }
            while (this.pos < this.source.length && this.source[this.pos] >= "0" && this.source[this.pos] <= "9") {
                numStr += this.advance();
            }
        }
        const value = hasDot || numStr.toLowerCase().includes("e")
            ? parseFloat(numStr)
            : parseInt(numStr, 10);
        return { type: "NUMBER", value, line: startLine, column: startCol };
    }
    readIdentifier() {
        const startLine = this.line;
        const startCol = this.column;
        let ident = "";
        while (this.pos < this.source.length && (this.source[this.pos].match(/[a-zA-Z0-9_]/))) {
            ident += this.advance();
        }
        const type = KEYWORDS[ident] ?? "IDENT";
        return { type, value: ident, line: startLine, column: startCol };
    }
    readParam() {
        const startLine = this.line;
        const startCol = this.column;
        this.advance(); // consume $
        let ident = "";
        while (this.pos < this.source.length && (this.source[this.pos].match(/[a-zA-Z0-9_]/))) {
            ident += this.advance();
        }
        return { type: "PARAM", value: ident, line: startLine, column: startCol };
    }
    checkTemplateRef() {
        if (this.pos >= this.source.length || this.source[this.pos] !== "{") {
            return null;
        }
        const savedPos = this.pos;
        const savedLine = this.line;
        const savedCol = this.column;
        this.advance(); // consume {
        // Template references are {name} without spaces inside
        if (this.pos < this.source.length && (this.source[this.pos].match(/[a-zA-Z_]/))) {
            let ident = "";
            while (this.pos < this.source.length && (this.source[this.pos].match(/[a-zA-Z0-9_]/))) {
                ident += this.advance();
            }
            // Must be immediately followed by } - no spaces allowed
            if (this.pos < this.source.length && this.source[this.pos] === "}") {
                this.advance();
                return { type: "TEMPLATE_OPEN", value: ident, line: savedLine, column: savedCol };
            }
        }
        // Not a template reference, restore
        this.pos = savedPos;
        this.line = savedLine;
        this.column = savedCol;
        return null;
    }
    tokens() {
        const result = [];
        const singleCharTokens = {
            "{": "LBRACE", "}": "RBRACE", "[": "LBRACKET", "]": "RBRACKET",
            ":": "COLON", ",": "COMMA", ".": "DOT", "(": "LPAREN", ")": "RPAREN",
            "=": "EQUALS", "+": "PLUS", "*": "STAR", "/": "SLASH", "%": "PERCENT",
        };
        while (this.pos < this.source.length) {
            this.skipWhitespace();
            if (this.pos >= this.source.length)
                break;
            if (this.skipComment())
                continue;
            const ch = this.source[this.pos];
            // Template reference
            if (ch === "{") {
                const tmpl = this.checkTemplateRef();
                if (tmpl) {
                    result.push(tmpl);
                    continue;
                }
                // Not a template ref, `{` will be handled below as LBRACE
            }
            // String
            if (ch === '"') {
                result.push(this.readString());
                continue;
            }
            // Number
            if ((ch >= "0" && ch <= "9") || (ch === "-" && this.pos + 1 < this.source.length && this.source[this.pos + 1] >= "0" && this.source[this.pos + 1] <= "9")) {
                result.push(this.readNumber());
                continue;
            }
            // Identifier / keyword
            if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
                result.push(this.readIdentifier());
                continue;
            }
            // Parameter $var
            if (ch === "$") {
                result.push(this.readParam());
                continue;
            }
            // Dash
            if (ch === "-") {
                this.advance();
                result.push({ type: "DASH", value: "-", line: this.line, column: this.column - 1 });
                continue;
            }
            // Two-character operators (must check before single char)
            if (this.pos + 1 < this.source.length) {
                const two = this.source.slice(this.pos, this.pos + 2);
                if (two === "..") {
                    this.advance();
                    this.advance();
                    result.push({ type: "DOT_DOT", value: "..", line: this.line, column: this.column - 2 });
                    continue;
                }
                if (two === ">=") {
                    this.advance();
                    this.advance();
                    result.push({ type: "GTE", value: ">=", line: this.line, column: this.column - 2 });
                    continue;
                }
                if (two === "<=") {
                    this.advance();
                    this.advance();
                    result.push({ type: "LTE", value: "<=", line: this.line, column: this.column - 2 });
                    continue;
                }
                if (two === "==") {
                    this.advance();
                    this.advance();
                    result.push({ type: "EQ_EQ", value: "==", line: this.line, column: this.column - 2 });
                    continue;
                }
                if (two === "!=") {
                    this.advance();
                    this.advance();
                    result.push({ type: "BANG_EQ", value: "!=", line: this.line, column: this.column - 2 });
                    continue;
                }
            }
            // Single char tokens (excluding '.' which is handled below)
            if (ch in singleCharTokens && ch !== ".") {
                const line = this.line;
                const col = this.column;
                this.advance();
                result.push({ type: singleCharTokens[ch], value: ch, line, column: col });
                continue;
            }
            // Single dot (not .. range)
            if (ch === ".") {
                this.advance();
                result.push({ type: "DOT", value: ".", line: this.line, column: this.column - 1 });
                continue;
            }
            // Single-character comparison operators
            if (ch === ">") {
                this.advance();
                result.push({ type: "GT", value: ">", line: this.line, column: this.column - 1 });
                continue;
            }
            if (ch === "<") {
                this.advance();
                result.push({ type: "LT", value: "<", line: this.line, column: this.column - 1 });
                continue;
            }
            throw new LexerError(`Unexpected character: ${ch}`, this.line, this.column);
        }
        result.push({ type: "EOF", value: "", line: this.line, column: this.column });
        return result;
    }
}
//# sourceMappingURL=lexer.js.map