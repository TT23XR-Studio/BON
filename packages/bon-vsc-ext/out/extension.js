var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/extension.ts
import * as vscode from "vscode";

// ../bon-ts/dist/lexer.js
var KEYWORDS = {
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
  in: "IN"
};
var LexerError = class extends Error {
  static {
    __name(this, "LexerError");
  }
  line;
  column;
  constructor(message, line, column) {
    super(`Lexer error at line ${line}, column ${column}: ${message}`);
    this.line = line;
    this.column = column;
    this.name = "LexerError";
  }
};
var Lexer = class {
  static {
    __name(this, "Lexer");
  }
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
    } else {
      this.column++;
    }
    return ch;
  }
  skipWhitespace() {
    while (this.pos < this.source.length && " 	\r\n".includes(this.source[this.pos])) {
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
    const quote = this.advance();
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
          n: "\n",
          t: "	",
          r: "\r",
          "\\": "\\",
          '"': '"',
          "'": "'",
          "/": "/",
          "0": "\0"
        };
        if (esc in escapeMap) {
          result.push(escapeMap[esc]);
        } else if (esc === "u") {
          let hexStr = "";
          for (let i = 0; i < 4 && this.pos < this.source.length; i++) {
            if ("0123456789abcdefABCDEF".includes(this.source[this.pos])) {
              hexStr += this.advance();
            }
          }
          result.push(String.fromCharCode(parseInt(hexStr, 16)));
        } else {
          result.push(esc);
        }
      } else {
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
      if (this.pos + 1 < this.source.length && this.source[this.pos + 1] === ".") {
      } else {
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
    const value = hasDot || numStr.toLowerCase().includes("e") ? parseFloat(numStr) : parseInt(numStr, 10);
    return { type: "NUMBER", value, line: startLine, column: startCol };
  }
  readIdentifier() {
    const startLine = this.line;
    const startCol = this.column;
    let ident = "";
    while (this.pos < this.source.length && this.source[this.pos].match(/[a-zA-Z0-9_]/)) {
      ident += this.advance();
    }
    const type = KEYWORDS[ident] ?? "IDENT";
    return { type, value: ident, line: startLine, column: startCol };
  }
  readParam() {
    const startLine = this.line;
    const startCol = this.column;
    this.advance();
    let ident = "";
    while (this.pos < this.source.length && this.source[this.pos].match(/[a-zA-Z0-9_]/)) {
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
    this.advance();
    if (this.pos < this.source.length && this.source[this.pos].match(/[a-zA-Z_]/)) {
      let ident = "";
      while (this.pos < this.source.length && this.source[this.pos].match(/[a-zA-Z0-9_]/)) {
        ident += this.advance();
      }
      if (this.pos < this.source.length && this.source[this.pos] === "}") {
        this.advance();
        return { type: "TEMPLATE_OPEN", value: ident, line: savedLine, column: savedCol };
      }
    }
    this.pos = savedPos;
    this.line = savedLine;
    this.column = savedCol;
    return null;
  }
  tokens() {
    const result = [];
    const singleCharTokens = {
      "{": "LBRACE",
      "}": "RBRACE",
      "[": "LBRACKET",
      "]": "RBRACKET",
      ":": "COLON",
      ",": "COMMA",
      ".": "DOT",
      "(": "LPAREN",
      ")": "RPAREN",
      "=": "EQUALS",
      "+": "PLUS",
      "*": "STAR",
      "/": "SLASH",
      "%": "PERCENT"
    };
    while (this.pos < this.source.length) {
      this.skipWhitespace();
      if (this.pos >= this.source.length)
        break;
      if (this.skipComment())
        continue;
      const ch = this.source[this.pos];
      if (ch === "{") {
        const tmpl = this.checkTemplateRef();
        if (tmpl) {
          result.push(tmpl);
          continue;
        }
      }
      if (ch === '"') {
        result.push(this.readString());
        continue;
      }
      if (ch >= "0" && ch <= "9" || ch === "-" && this.pos + 1 < this.source.length && this.source[this.pos + 1] >= "0" && this.source[this.pos + 1] <= "9") {
        result.push(this.readNumber());
        continue;
      }
      if (ch >= "a" && ch <= "z" || ch >= "A" && ch <= "Z" || ch === "_") {
        result.push(this.readIdentifier());
        continue;
      }
      if (ch === "$") {
        result.push(this.readParam());
        continue;
      }
      if (ch === "-") {
        this.advance();
        result.push({ type: "DASH", value: "-", line: this.line, column: this.column - 1 });
        continue;
      }
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
      if (ch in singleCharTokens && ch !== ".") {
        const line = this.line;
        const col = this.column;
        this.advance();
        result.push({ type: singleCharTokens[ch], value: ch, line, column: col });
        continue;
      }
      if (ch === ".") {
        this.advance();
        result.push({ type: "DOT", value: ".", line: this.line, column: this.column - 1 });
        continue;
      }
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
};

// ../bon-ts/dist/parser.js
var ParseError = class extends Error {
  static {
    __name(this, "ParseError");
  }
  token;
  constructor(message, token) {
    super(`Parse error at line ${token.line}, column ${token.column}: ${message}`);
    this.token = token;
    this.name = "ParseError";
  }
};
var Parser = class {
  static {
    __name(this, "Parser");
  }
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
    while (this.current().type === "IMPORT") {
      imports.push(this.parseImport());
    }
    while (this.current().type !== "EOF") {
      const tok = this.current();
      if (tok.type === "PARAM") {
        if (this.peek(1).type === "EQUALS") {
          throw new ParseError(`Cannot assign to parameter '$${tok.value}'. Parameters are read-only and must be passed at compile time.`, tok);
        }
        body.push(this.parseExpression());
        continue;
      }
      if (tok.type === "IDENT") {
        if (this.peek(1).type === "DASH" && this.peek(2).type === "LBRACE") {
          const td = this.parseTemplateDef();
          templates[td.name] = td;
          continue;
        }
        if (this.peek(1).type === "EQUALS") {
          const va = this.parseVariableAssign();
          variables[va.name] = va;
          continue;
        }
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
      } else {
        const keyTok = this.current();
        let key;
        if (keyTok.type === "STRING") {
          this.advance();
          key = keyTok.value;
        } else if (keyTok.type === "PARAM") {
          const paramName = keyTok.value;
          this.advance();
          key = `__param_key__${paramName}`;
        } else {
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
    while (this.current().type === "GT" || this.current().type === "LT" || this.current().type === "GTE" || this.current().type === "LTE" || this.current().type === "EQ_EQ" || this.current().type === "BANG_EQ") {
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
    while (this.current().type === "STAR" || this.current().type === "SLASH" || this.current().type === "PERCENT") {
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
        } else {
          expr = { kind: "PropertyAccess", obj: expr, prop, pos: expr.pos };
        }
      } else {
        break;
      }
    }
    return expr;
  }
  parsePrimary() {
    const tok = this.current();
    const pos = this.pos_();
    if (tok.type === "TEMPLATE_OPEN") {
      this.advance();
      return { kind: "TemplateRef", name: tok.value, pos };
    }
    if (tok.type === "PARAM") {
      this.advance();
      return { kind: "Param", name: tok.value, pos };
    }
    if (tok.type === "STRING") {
      this.advance();
      return { kind: "Literal", value: tok.value, pos };
    }
    if (tok.type === "NUMBER") {
      this.advance();
      return { kind: "Literal", value: tok.value, pos };
    }
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
    if (tok.type === "FN") {
      return this.parseAnonymousFn();
    }
    if (tok.type === "FOR") {
      return this.parseForLoop();
    }
    if (tok.type === "IDENT") {
      this.advance();
      if (this.current().type === "LBRACE") {
        return this.parseClassInstantiation(tok.value, pos);
      }
      if (this.current().type === "LPAREN") {
        return this.parseFuncCallName(tok.value, pos);
      }
      return { kind: "Identifier", name: tok.value, pos };
    }
    if (tok.type === "LBRACKET") {
      return this.parseArrayLiteral();
    }
    if (tok.type === "LBRACE") {
      return this.parseObjectLiteral();
    }
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
        elseExpr = this.parseIfExpr();
      } else {
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
      } else if (keyTok.type === "PARAM") {
        key = { kind: "Param", name: this.advance().value, pos: this.pos_() };
      } else {
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
        } else if (keyTok.type === "PARAM") {
          key = { kind: "Param", name: this.advance().value, pos: this.pos_() };
        } else {
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
    const body = this.parseExpression();
    return { kind: "ForLoop", varName, varName2, iterable, body, pos };
  }
  parseRangeOrExpression() {
    if (this.current().type === "NUMBER" && this.peek(1).type === "DOT_DOT") {
      const pos = this.pos_();
      const startTok = this.advance();
      const start = startTok.value;
      this.advance();
      const endTok = this.expect("NUMBER");
      const end = endTok.value;
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
      } else {
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
      } else {
        const savedPos = this.pos;
        const key = this.parseExpression();
        if (this.current().type === "COLON") {
          this.expect("COLON");
          const val = this.parseExpression();
          pairs.push({ key, value: val });
        } else {
          this.pos = savedPos;
          const val = this.parseExpression();
          if (val.kind === "TemplateRef") {
            pairs.push({ key: val, value: { kind: "Literal", value: true, pos: val.pos } });
          } else {
            pairs.push({ key: { kind: "Literal", value: "_", pos }, value: val });
          }
        }
      }
      this.match("COMMA");
    }
    this.expect("RBRACE");
    return { kind: "ObjectLit", pairs, conditions: conditions.length > 0 ? conditions : void 0, pos };
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
};

// ../bon-ts/dist/evaluator.js
import * as fs from "node:fs";
import * as path from "node:path";

// ../bon-ts/dist/stdlib.js
var BONRuntimeError = class extends Error {
  static {
    __name(this, "BONRuntimeError");
  }
  code;
  constructor(message, code = "E999") {
    super(message);
    this.code = code;
    this.name = "BONRuntimeError";
  }
};
function typeCheck(value, expectedType, funcName, argIdx) {
  const actual = Array.isArray(value) ? "array" : typeof value;
  if (expectedType === "array") {
    if (!Array.isArray(value)) {
      throw new BONRuntimeError(`${funcName}() argument ${argIdx + 1}: expected array, got ${actual}`, "E007");
    }
  } else if (actual !== expectedType) {
    throw new BONRuntimeError(`${funcName}() argument ${argIdx + 1}: expected ${expectedType}, got ${actual}`, "E007");
  }
}
__name(typeCheck, "typeCheck");
function stdUpper(args) {
  typeCheck(args[0], "string", "std.upper", 0);
  return args[0].toUpperCase();
}
__name(stdUpper, "stdUpper");
function stdLower(args) {
  typeCheck(args[0], "string", "std.lower", 0);
  return args[0].toLowerCase();
}
__name(stdLower, "stdLower");
function stdTrim(args) {
  typeCheck(args[0], "string", "std.trim", 0);
  return args[0].trim();
}
__name(stdTrim, "stdTrim");
function stdSplit(args) {
  typeCheck(args[0], "string", "std.split", 0);
  typeCheck(args[1], "string", "std.split", 1);
  return args[0].split(args[1]);
}
__name(stdSplit, "stdSplit");
function stdReplace(args) {
  typeCheck(args[0], "string", "std.replace", 0);
  typeCheck(args[1], "string", "std.replace", 1);
  typeCheck(args[2], "string", "std.replace", 2);
  return args[0].replaceAll(args[1], args[2]);
}
__name(stdReplace, "stdReplace");
function stdLen(args) {
  const val = args[0];
  if (typeof val === "string" || Array.isArray(val) || typeof val === "object" && val !== null) {
    return Array.isArray(val) ? val.length : typeof val === "string" ? val.length : Object.keys(val).length;
  }
  throw new BONRuntimeError("std.len() argument 1: expected string, array, or object", "E007");
}
__name(stdLen, "stdLen");
function stdAt(args) {
  typeCheck(args[0], "array", "std.at", 0);
  typeCheck(args[1], "number", "std.at", 1);
  const arr = args[0];
  let idx = args[1];
  if (idx < 0)
    idx += arr.length;
  if (idx < 0 || idx >= arr.length) {
    throw new BONRuntimeError(`std.at() index ${args[1]} out of bounds for array of length ${arr.length}`, "E006");
  }
  return arr[idx];
}
__name(stdAt, "stdAt");
function stdFirst(args) {
  return stdAt([args[0], 0]);
}
__name(stdFirst, "stdFirst");
function stdLast(args) {
  return stdAt([args[0], -1]);
}
__name(stdLast, "stdLast");
function stdMap(args, callFn) {
  typeCheck(args[0], "array", "std.map", 0);
  const arr = args[0];
  const fn = args[1];
  return arr.map((item, i) => callFn(fn, [item, i]));
}
__name(stdMap, "stdMap");
function stdFilter(args, callFn) {
  typeCheck(args[0], "array", "std.filter", 0);
  const arr = args[0];
  const fn = args[1];
  return arr.filter((item) => callFn(fn, [item]));
}
__name(stdFilter, "stdFilter");
function stdReduce(args, callFn) {
  typeCheck(args[0], "array", "std.reduce", 0);
  const arr = args[0];
  const init = args[1];
  const fn = args[2];
  return arr.reduce((acc, item) => callFn(fn, [acc, item]), init);
}
__name(stdReduce, "stdReduce");
function stdConcat(args) {
  typeCheck(args[0], "array", "std.concat", 0);
  typeCheck(args[1], "array", "std.concat", 1);
  return [...args[0], ...args[1]];
}
__name(stdConcat, "stdConcat");
function stdMerge(args) {
  typeCheck(args[0], "object", "std.merge", 0);
  typeCheck(args[1], "object", "std.merge", 1);
  return { ...args[0], ...args[1] };
}
__name(stdMerge, "stdMerge");
function stdKeys(args) {
  typeCheck(args[0], "object", "std.keys", 0);
  return Object.keys(args[0]);
}
__name(stdKeys, "stdKeys");
function stdValues(args) {
  typeCheck(args[0], "object", "std.values", 0);
  return Object.values(args[0]);
}
__name(stdValues, "stdValues");
function stdToString(args) {
  const val = args[0];
  if (typeof val === "boolean")
    return val ? "true" : "false";
  if (val === null || val === void 0)
    return "null";
  return String(val);
}
__name(stdToString, "stdToString");
function stdToNumber(args) {
  const val = args[0];
  if (typeof val === "number")
    return val;
  if (typeof val === "string") {
    const num = Number(val);
    return isNaN(num) ? null : num;
  }
  return null;
}
__name(stdToNumber, "stdToNumber");
function stdTypeOf(args) {
  const val = args[0];
  if (val === null || val === void 0)
    return "null";
  if (typeof val === "boolean")
    return "boolean";
  if (typeof val === "number")
    return "number";
  if (typeof val === "string")
    return "string";
  if (Array.isArray(val))
    return "array";
  if (typeof val === "object")
    return "object";
  return "unknown";
}
__name(stdTypeOf, "stdTypeOf");
var STD_LIB = {
  upper: { fn: stdUpper },
  lower: { fn: stdLower },
  trim: { fn: stdTrim },
  split: { fn: stdSplit },
  replace: { fn: stdReplace },
  len: { fn: stdLen },
  at: { fn: stdAt },
  first: { fn: stdFirst },
  last: { fn: stdLast },
  map: { fn: /* @__PURE__ */ __name((args, callFn) => stdMap(args, callFn), "fn"), needsCallFn: true },
  filter: { fn: /* @__PURE__ */ __name((args, callFn) => stdFilter(args, callFn), "fn"), needsCallFn: true },
  reduce: { fn: /* @__PURE__ */ __name((args, callFn) => stdReduce(args, callFn), "fn"), needsCallFn: true },
  concat: { fn: stdConcat },
  merge: { fn: stdMerge },
  keys: { fn: stdKeys },
  values: { fn: stdValues },
  to_string: { fn: stdToString },
  to_number: { fn: stdToNumber },
  type_of: { fn: stdTypeOf }
};

// ../bon-ts/dist/evaluator.js
var EvalError = class extends Error {
  static {
    __name(this, "EvalError");
  }
  code;
  pos;
  constructor(message, code = "E999", pos) {
    const loc = pos ? ` at line ${pos.line}, column ${pos.column}` : "";
    super(`${code}: ${message}${loc}`);
    this.code = code;
    this.pos = pos;
    this.name = "EvalError";
  }
};
var PRUNED = /* @__PURE__ */ Symbol("PRUNED");
var Evaluator = class _Evaluator {
  static {
    __name(this, "Evaluator");
  }
  baseDir;
  params;
  templates = {};
  classes = {};
  variables = {};
  importStack = [];
  callFn;
  MAX_ITERATIONS = 1e4;
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
    for (const imp of program.imports) {
      this.resolveImport(imp);
    }
    for (const [name, td] of Object.entries(program.templates)) {
      this.templates[name] = td;
    }
    for (const [name, cd] of Object.entries(program.classes)) {
      this.classes[name] = cd;
    }
    for (const [name, va] of Object.entries(program.variables)) {
      this.variables[name] = this.eval(va.value);
    }
    this.inExprContext = [true];
    const results = [];
    for (const expr of program.body) {
      results.push(this.eval(expr));
    }
    return results.length === 1 ? results[0] : results;
  }
  eval(node) {
    if (node === null || node === void 0)
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
        return node;
      // stored, not evaluated directly
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
          if (objNode.conditions) {
            for (const block of objNode.conditions) {
              this.evalConditionalBlockInto(block, obj);
            }
          }
          for (const pair of objNode.pairs) {
            if (pair.key.kind === "TemplateRef") {
              const tmplKey = pair.key.name;
              const evaluated2 = this.expandTemplate(tmplKey, pair.key.pos);
              if (evaluated2 !== PRUNED) {
                obj[tmplKey] = evaluated2;
              }
              continue;
            }
            const keyStr = this.evalObjKey(pair.key);
            if (keyStr === null)
              continue;
            const evaluated = this.eval(pair.value);
            if (evaluated !== PRUNED) {
              obj[keyStr] = evaluated;
            }
          }
        } finally {
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
    for (const [key, val] of Object.entries(overrides)) {
      resolvedMembers[key] = val;
    }
    const instance = {};
    for (const [key, val] of Object.entries(resolvedMembers)) {
      instance[key] = val;
    }
    for (const [key, val] of Object.entries(instance)) {
      if (val && typeof val === "object" && "kind" in val) {
        instance[key] = this.evalWithSelf(val, instance);
      }
    }
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
    const seen = /* @__PURE__ */ new Set();
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
    } finally {
      this.variables = oldVars;
    }
  }
  evalMethodCall(node) {
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
    if (obj && typeof obj === "object" && !Array.isArray(obj) && node.method in obj) {
      const methodVal = obj[node.method];
      if (methodVal && typeof methodVal === "object" && "__bonMethod__" in methodVal) {
        const m = methodVal;
        const args = node.args.map((a) => this.eval(a));
        const oldVars = { ...this.variables };
        this.variables["self"] = obj;
        try {
          return this.evalFuncDef(m.def, args, {});
        } finally {
          this.variables = oldVars;
        }
      }
    }
    throw new EvalError(`Cannot call method on non-object: ${typeof obj}`, "E007", node.pos);
  }
  evalFuncCall(node) {
    const args = node.args.map((a) => this.eval(a));
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
    } finally {
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
    } else if (node.elseExpr !== null) {
      return this.eval(node.elseExpr);
    }
    if (this.inExprContext[this.inExprContext.length - 1]) {
      throw new EvalError("if expression without else must be inside an object block, got expression context", "E011", node.pos);
    }
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
    if (Array.isArray(iterable)) {
      if (iterable.length > this.MAX_ITERATIONS) {
        throw new EvalError(`For loop iteration count exceeds maximum (${iterable.length} > ${this.MAX_ITERATIONS}). Consider using a smaller range or std.map.`, "E010", node.pos);
      }
      if (node.varName2 !== null) {
        throw new EvalError(`For loop with two variables can only iterate over objects, got array`, "E011", node.pos);
      }
      const results2 = [];
      for (const item of iterable) {
        const oldVars = { ...this.variables };
        this.variables[node.varName] = item;
        try {
          let result = this.eval(node.body);
          if (result === PRUNED)
            continue;
          if (result && typeof result === "object" && "_" in result && Object.keys(result).length === 1) {
            result = result["_"];
          }
          results2.push(result);
        } finally {
          this.variables = oldVars;
        }
      }
      return results2;
    }
    if (iterable === null || typeof iterable !== "object") {
      throw new EvalError(`for loop requires iterable (array, object, or range), got ${typeLabel(iterable)}`, "E011", node.pos);
    }
    const iterableObj = iterable;
    if (Object.keys(iterableObj).length > this.MAX_ITERATIONS) {
      throw new EvalError(`For loop iteration count exceeds maximum (${Object.keys(iterableObj).length} > ${this.MAX_ITERATIONS}). Consider using a smaller iterable or std.map.`, "E010", node.pos);
    }
    if (node.varName2 !== null) {
      const resultObj = {};
      for (const [key, value] of Object.entries(iterableObj)) {
        const oldVars = { ...this.variables };
        this.variables[node.varName] = key;
        this.variables[node.varName2] = value;
        try {
          let result = this.eval(node.body);
          if (result === PRUNED)
            continue;
          if (result && typeof result === "object" && "_" in result && Object.keys(result).length === 1) {
            result = result["_"];
          }
          if (result && typeof result === "object" && !Array.isArray(result)) {
            Object.assign(resultObj, result);
          }
        } finally {
          this.variables = oldVars;
        }
      }
      return resultObj;
    }
    const results = [];
    for (const [key, value] of Object.entries(iterableObj)) {
      const oldVars = { ...this.variables };
      this.variables[node.varName] = value;
      try {
        const result = this.eval(node.body);
        if (result === PRUNED)
          continue;
        if (result && typeof result === "object" && "_" in result && Object.keys(result).length === 1) {
          results.push(result["_"]);
        } else {
          results.push(result);
        }
      } finally {
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
      const imported = new _Evaluator(path.dirname(filepath), this.params);
      imported.templates = { ...this.templates };
      imported.classes = { ...this.classes };
      imported.variables = { ...this.variables };
      imported.importStack = [...this.importStack];
      const program = parse(source, filepath);
      imported.evaluate(program);
      this.templates = { ...imported.templates };
      this.classes = { ...imported.classes };
      this.variables = { ...imported.variables };
    } finally {
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
};
function typeLabel(val) {
  if (val === null || val === void 0)
    return "null";
  if (Array.isArray(val))
    return "array";
  return typeof val;
}
__name(typeLabel, "typeLabel");
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
__name(deepCopy, "deepCopy");
function parse(source, filename = "<stdin>") {
  const lexer = new Lexer(source, filename);
  const tokens = lexer.tokens();
  const parser = new Parser(tokens);
  return parser.parse();
}
__name(parse, "parse");
function evaluate(source, baseDir = ".", params = {}) {
  const program = parse(source);
  const evaluator = new Evaluator(baseDir, params);
  const result = evaluator.evaluate(program);
  return evaluator.sanitize(result);
}
__name(evaluate, "evaluate");

// src/extension.ts
var diagnosticCollection;
function activate(context) {
  diagnosticCollection = vscode.languages.createDiagnosticCollection("bon");
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    "bon",
    new BonCompletionProvider(),
    ".",
    '"',
    "{"
  );
  const hoverProvider = vscode.languages.registerHoverProvider(
    "bon",
    new BonHoverProvider()
  );
  const definitionProvider = vscode.languages.registerDefinitionProvider(
    "bon",
    new BonDefinitionProvider()
  );
  const openListener = vscode.workspace.onDidOpenTextDocument(triggerDiagnostics);
  const changeListener = vscode.workspace.onDidChangeTextDocument(triggerChange);
  const closeListener = vscode.workspace.onDidCloseTextDocument((doc) => {
    if (doc.languageId === "bon") {
      diagnosticCollection.delete(doc.uri);
    }
  });
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId === "bon") {
      updateDiagnostics(doc);
    }
  }
  context.subscriptions.push(
    completionProvider,
    hoverProvider,
    definitionProvider,
    openListener,
    changeListener,
    closeListener,
    diagnosticCollection
  );
}
__name(activate, "activate");
function deactivate() {
}
__name(deactivate, "deactivate");
var debounceTimers = /* @__PURE__ */ new Map();
function triggerDiagnostics(document) {
  if (document.languageId !== "bon") return;
  updateDiagnostics(document);
}
__name(triggerDiagnostics, "triggerDiagnostics");
function triggerChange(event) {
  if (event.document.languageId !== "bon") return;
  const key = event.document.uri.toString();
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key);
      updateDiagnostics(event.document);
    }, 500)
  );
}
__name(triggerChange, "triggerChange");
function updateDiagnostics(document) {
  const config = vscode.workspace.getConfiguration("bon");
  if (!config.get("enableDiagnostics", true)) {
    diagnosticCollection.delete(document.uri);
    return;
  }
  const text = document.getText();
  const diagnostics = [];
  const params = config.get("params", {});
  try {
    const lexer = new Lexer(text);
    const tokens = lexer.tokens();
    const parser = new Parser(tokens);
    parser.parse();
  } catch (e) {
    if (e instanceof ParseError) {
      const diag = errorToDiagnostic(e.message, e.token);
      if (diag) diagnostics.push(diag);
    } else if (e instanceof Error) {
      const diag = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 10),
        e.message,
        vscode.DiagnosticSeverity.Error
      );
      diagnostics.push(diag);
    }
  }
  if (diagnostics.length === 0) {
    try {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      const baseDir = workspaceFolder ? workspaceFolder.uri.fsPath : document.uri.fsPath;
      evaluate(text, baseDir, params);
    } catch (e) {
      if (e instanceof EvalError) {
        const diag = errorToDiagnostic(e.message, e.pos);
        if (diag) diagnostics.push(diag);
      } else if (e instanceof Error) {
        const diag = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10),
          e.message,
          vscode.DiagnosticSeverity.Error
        );
        diagnostics.push(diag);
      }
    }
  }
  diagnosticCollection.set(document.uri, diagnostics);
}
__name(updateDiagnostics, "updateDiagnostics");
function errorToDiagnostic(message, pos) {
  if (!pos) return null;
  const line = Math.max(0, pos.line - 1);
  const col = Math.max(0, pos.column - 1);
  const range = new vscode.Range(line, col, line, col + 10);
  const diagnostic = new vscode.Diagnostic(
    range,
    message,
    vscode.DiagnosticSeverity.Error
  );
  diagnostic.source = "bon";
  return diagnostic;
}
__name(errorToDiagnostic, "errorToDiagnostic");
var BonCompletionProvider = class {
  static {
    __name(this, "BonCompletionProvider");
  }
  provideCompletionItems(document, position, _token, _context) {
    const items = [];
    const lineText = document.lineAt(position).text;
    const textBefore = lineText.substring(0, position.character);
    if (textBefore.endsWith(".")) {
      const stdCompletions = this.getStdCompletions();
      items.push(...stdCompletions);
      return items;
    }
    const templateMatch = textBefore.match(/\{([a-zA-Z_][a-zA-Z0-9_]*)?$/);
    if (templateMatch) {
      items.push(...this.getTemplateCompletions(document, position));
      return items;
    }
    items.push(...this.getKeywordCompletions());
    items.push(...this.getSnippetCompletions());
    return items;
  }
  getStdCompletions() {
    const stdFunctions = [
      // String operations
      { name: "upper", sig: "std.upper(s: string): string", doc: "Convert string to uppercase" },
      { name: "lower", sig: "std.lower(s: string): string", doc: "Convert string to lowercase" },
      { name: "trim", sig: "std.trim(s: string): string", doc: "Remove leading/trailing whitespace" },
      { name: "split", sig: "std.split(s: string, sep: string): array", doc: "Split string by separator" },
      { name: "replace", sig: "std.replace(s: string, old: string, new: string): string", doc: "Replace substring" },
      { name: "len", sig: "std.len(s: string | array | object): number", doc: "Get length of string, array, or object" },
      // Array operations
      { name: "at", sig: "std.at(array: array, index: number): any", doc: "Get element at index (supports negative)" },
      { name: "first", sig: "std.first(array: array): any", doc: "Get first element" },
      { name: "last", sig: "std.last(array: array): any", doc: "Get last element" },
      { name: "map", sig: "std.map(array: array, fn: function): array", doc: "Map transform" },
      { name: "filter", sig: "std.filter(array: array, fn: function): array", doc: "Filter elements" },
      { name: "reduce", sig: "std.reduce(array: array, init: any, fn: function): any", doc: "Reduce/fold array" },
      { name: "concat", sig: "std.concat(a1: array, a2: array): array", doc: "Concatenate two arrays" },
      // Object operations
      { name: "merge", sig: "std.merge(obj1: object, obj2: object): object", doc: "Shallow merge objects" },
      { name: "keys", sig: "std.keys(obj: object): array", doc: "Get object keys" },
      { name: "values", sig: "std.values(obj: object): array", doc: "Get object values" },
      // Type conversion
      { name: "to_string", sig: "std.to_string(value: any): string", doc: "Convert value to string" },
      { name: "to_number", sig: "std.to_number(s: string): number | null", doc: "Convert string to number" },
      { name: "type_of", sig: "std.type_of(value: any): string", doc: "Get type name" }
    ];
    return stdFunctions.map((fn) => {
      const item = new vscode.CompletionItem(fn.name, vscode.CompletionItemKind.Function);
      item.detail = fn.sig;
      item.documentation = new vscode.MarkdownString(fn.doc);
      item.insertText = fn.name;
      return item;
    });
  }
  getKeywordCompletions() {
    const keywords = [
      { name: "class", doc: "Define a class" },
      { name: "extends", doc: "Extend a parent class" },
      { name: "fn", doc: "Define a function" },
      { name: "return", doc: "Return a value" },
      { name: "import", doc: "Import from another file" },
      { name: "as", doc: "Alias an import" },
      { name: "true", doc: "Boolean true" },
      { name: "false", doc: "Boolean false" },
      { name: "null", doc: "Null value" },
      { name: "if", doc: "Conditional expression" },
      { name: "else", doc: "Alternative branch for if" },
      { name: "for", doc: "Loop expression" },
      { name: "in", doc: "Part of for loop syntax" }
    ];
    return keywords.map((kw) => {
      const item = new vscode.CompletionItem(kw.name, vscode.CompletionItemKind.Keyword);
      item.documentation = new vscode.MarkdownString(kw.doc);
      return item;
    });
  }
  getSnippetCompletions() {
    const snippets = [
      {
        label: "template",
        snippet: "${1:name}-{${2:value}}",
        doc: "Template definition"
      },
      {
        label: "class",
        snippet: 'class ${1:Name} {\n	"${2:key}": ${3:value},\n\n	fn ${4:method}(${5:params}) {\n		return ${6:expr}\n	}\n}',
        doc: "Class definition"
      },
      {
        label: "fn",
        snippet: "fn(${1:args}) { return ${2:expr} }",
        doc: "Anonymous function"
      },
      {
        label: "import",
        snippet: 'import "${1:path}" as ${2:Alias}',
        doc: "Import statement"
      },
      {
        label: "if",
        snippet: "if (${1:cond}) { ${2:then} } else { ${3:else} }",
        doc: "Conditional expression"
      },
      {
        label: "for",
        snippet: "for ${1:item} in ${2:iterable} { ${3:body} }",
        doc: "Loop expression"
      },
      {
        label: "param",
        snippet: "${1:name}",
        doc: "Insert compile-time parameter reference"
      }
    ];
    return snippets.map((s) => {
      const item = new vscode.CompletionItem(s.label, vscode.CompletionItemKind.Snippet);
      item.insertText = new vscode.SnippetString(s.snippet);
      item.documentation = new vscode.MarkdownString(s.doc);
      return item;
    });
  }
  getTemplateCompletions(_document, _position) {
    return [];
  }
};
var BonHoverProvider = class {
  static {
    __name(this, "BonHoverProvider");
  }
  provideHover(document, position) {
    const word = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);
    if (!word) return null;
    const text = document.getText(word);
    const lineText = document.lineAt(position).text;
    const stdMatch = lineText.match(/std\.([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (stdMatch) {
      const funcName = stdMatch[1];
      return this.getStdHover(funcName);
    }
    const keywords = {
      class: "**class** - Define a reusable data structure with properties and methods",
      extends: "**extends** - Inherit from a parent class",
      fn: "**fn** - Define a function (anonymous or named method)",
      return: "**return** - Return a value from a function",
      import: "**import** - Import definitions from another BON file",
      as: "**as** - Create an alias for an imported module",
      true: "**true** - Boolean true literal",
      false: "**false** - Boolean false literal",
      null: "**null** - Null value literal",
      if: "**if** - Conditional expression (compile-time)\n\n```bon\nif (cond) { then } else { else }\n```",
      else: "**else** - Alternative branch for if/else if",
      for: "**for** - Loop expression (compile-time)\n\n```bon\nfor x in [1,2,3] { x * 2 }\n```",
      in: "**in** - Part of for loop syntax"
    };
    if (text in keywords) {
      return new vscode.Hover(new vscode.MarkdownString(keywords[text]));
    }
    return null;
  }
  getStdHover(funcName) {
    const docs = {
      upper: '**std.upper(s)** - Convert string to uppercase\n\n```bon\nstd.upper("hello") // "HELLO"\n```',
      lower: '**std.lower(s)** - Convert string to lowercase\n\n```bon\nstd.lower("WORLD") // "world"\n```',
      trim: '**std.trim(s)** - Remove leading/trailing whitespace\n\n```bon\nstd.trim("  hi  ") // "hi"\n```',
      split: '**std.split(s, sep)** - Split string by separator\n\n```bon\nstd.split("a,b,c", ",") // ["a","b","c"]\n```',
      replace: '**std.replace(s, old, new)** - Replace substring\n\n```bon\nstd.replace("foo bar", "bar", "baz") // "foo baz"\n```',
      len: '**std.len(x)** - Get length of string, array, or object\n\n```bon\nstd.len("hello") // 5\nstd.len([1,2,3]) // 3\n```',
      at: "**std.at(array, index)** - Get element at index (supports negative)\n\n```bon\nstd.at([10,20,30], -1) // 30\n```",
      first: "**std.first(array)** - Get first element\n\n```bon\nstd.first([5,6]) // 5\n```",
      last: "**std.last(array)** - Get last element\n\n```bon\nstd.last([5,6]) // 6\n```",
      map: "**std.map(array, fn)** - Map transform\n\n```bon\nstd.map([1,2], fn(x) { return x * 2 }) // [2,4]\n```",
      filter: "**std.filter(array, fn)** - Filter elements\n\n```bon\nstd.filter([1,2,3], fn(x) { return x > 1 }) // [2,3]\n```",
      reduce: "**std.reduce(array, init, fn)** - Reduce/fold array\n\n```bon\nstd.reduce([1,2,3], 0, fn(a,b) { return a + b }) // 6\n```",
      concat: "**std.concat(a1, a2)** - Concatenate two arrays\n\n```bon\nstd.concat([1], [2]) // [1,2]\n```",
      merge: '**std.merge(obj1, obj2)** - Shallow merge objects\n\n```bon\nstd.merge({"a":1}, {"b":2}) // {"a":1, "b":2}\n```',
      keys: '**std.keys(obj)** - Get object keys\n\n```bon\nstd.keys({"a":1, "b":2}) // ["a","b"]\n```',
      values: '**std.values(obj)** - Get object values\n\n```bon\nstd.values({"a":1, "b":2}) // [1,2]\n```',
      to_string: '**std.to_string(x)** - Convert value to string\n\n```bon\nstd.to_string(123) // "123"\n```',
      to_number: '**std.to_number(s)** - Convert string to number\n\n```bon\nstd.to_number("42.5") // 42.5\n```',
      type_of: '**std.type_of(x)** - Get type name\n\n```bon\ntype_of([1]) // "array"\ntype_of("hi") // "string"\n```'
    };
    if (funcName in docs) {
      return new vscode.Hover(new vscode.MarkdownString(docs[funcName]));
    }
    return null;
  }
};
var BonDefinitionProvider = class {
  static {
    __name(this, "BonDefinitionProvider");
  }
  provideDefinition(document, position) {
    const word = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);
    if (!word) return null;
    const text = document.getText(word);
    const fullText = document.getText();
    const lines = fullText.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const templateMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*-\s*\{/);
      if (templateMatch && templateMatch[1] === text) {
        return new vscode.Location(document.uri, new vscode.Position(i, 0));
      }
      const classMatch = line.match(/\bclass\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (classMatch && classMatch[1] === text) {
        return new vscode.Location(document.uri, new vscode.Position(i, line.indexOf("class")));
      }
    }
    return null;
  }
};
export {
  activate,
  deactivate
};
//# sourceMappingURL=extension.js.map
