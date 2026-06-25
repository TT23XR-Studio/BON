/**
 * BON Parser - Parses token stream into AST.
 */

import { Lexer } from "./lexer.js";
import type { Token, TokenType } from "./lexer.js";
import type {
  ArrayLit,
  BinaryOp,
  ClassDef,
  ClassInstance,
  Expression,
  FuncCall,
  FuncDef,
  Identifier,
  ImportStmt,
  Literal,
  MethodCall,
  MethodDef,
  ObjectLit,
  Position,
  Program,
  PropertyAccess,
  ReturnStmt,
  TemplateDef,
  TemplateRef,
  UnaryOp,
  VariableAssign,
} from "./ast.js";

export class ParseError extends Error {
  constructor(
    message: string,
    public token: Token,
  ) {
    super(`Parse error at line ${token.line}, column ${token.column}: ${message}`);
    this.name = "ParseError";
  }
}

export class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private current(): Token {
    return this.tokens[this.pos];
  }

  private peek(offset = 0): Token {
    const idx = this.pos + offset;
    return idx < this.tokens.length ? this.tokens[idx] : this.tokens[this.tokens.length - 1];
  }

  private advance(): Token {
    const tok = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) {
      this.pos++;
    }
    return tok;
  }

  private expect(type: TokenType): Token {
    const tok = this.current();
    if (tok.type !== type) {
      throw new ParseError(`Expected ${type}, got ${tok.type} (${JSON.stringify(tok.value)})`, tok);
    }
    return this.advance();
  }

  private match(...types: TokenType[]): Token | null {
    if (types.includes(this.current().type)) {
      return this.advance();
    }
    return null;
  }

  private pos_(): Position {
    const tok = this.current();
    return { line: tok.line, column: tok.column };
  }

  // ── Top-level ────────────────────────────────────────────

  parse(): Program {
    const imports: ImportStmt[] = [];
    const templates: Record<string, TemplateDef> = {};
    const classes: Record<string, ClassDef> = {};
    const variables: Record<string, VariableAssign> = {};
    const body: Expression[] = [];

    // Parse imports
    while (this.current().type === "IMPORT") {
      imports.push(this.parseImport());
    }

    // Parse top-level definitions
    while (this.current().type !== "EOF") {
      const tok = this.current();

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

  private parseImport(): ImportStmt {
    const pos = this.pos_();
    this.expect("IMPORT");
    const pathTok = this.expect("STRING");
    let alias: string | null = null;
    if (this.match("AS")) {
      alias = this.expect("IDENT").value as string;
    }
    return { kind: "ImportStmt", path: pathTok.value as string, alias, pos };
  }

  // ── Template ─────────────────────────────────────────────

  private parseTemplateDef(): TemplateDef {
    const pos = this.pos_();
    const name = this.expect("IDENT").value as string;
    this.expect("DASH");
    // The body is an expression (can be object literal, array, etc.)
    // No {} delimiters - just parse the expression directly
    const body = this.parseExpression();
    return { kind: "TemplateDef", name, body, pos };
  }

  // ── Class ────────────────────────────────────────────────

  private parseClassDef(): ClassDef {
    const pos = this.pos_();
    this.expect("CLASS");
    const name = this.expect("IDENT").value as string;

    let parent: string | null = null;
    if (this.match("EXTENDS")) {
      parent = this.expect("IDENT").value as string;
    }

    this.expect("LBRACE");
    const members: Record<string, Expression> = {};
    const methods: Record<string, MethodDef> = {};

    while (this.current().type !== "RBRACE") {
      if (this.current().type === "FN") {
        const md = this.parseMethodDef();
        methods[md.name] = md;
      } else {
        const key = this.parseObjectKey();
        this.expect("COLON");
        const val = this.parseExpression();
        members[key] = val;
      }
      this.match("COMMA");
    }

    this.expect("RBRACE");
    return { kind: "ClassDef", name, parent, members, methods, pos };
  }

  private parseMethodDef(): MethodDef {
    const pos = this.pos_();
    this.expect("FN");
    const name = this.expect("IDENT").value as string;

    this.expect("LPAREN");
    const params: string[] = [];
    if (this.current().type !== "RPAREN") {
      params.push(this.expect("IDENT").value as string);
      while (this.match("COMMA")) {
        params.push(this.expect("IDENT").value as string);
      }
    }
    this.expect("RPAREN");

    this.expect("LBRACE");
    const body = this.parseReturnStmt();
    this.expect("RBRACE");

    return { kind: "MethodDef", name, params, body, pos };
  }

  private parseReturnStmt(): ReturnStmt {
    const pos = this.pos_();
    this.expect("RETURN");
    const value = this.parseExpression();
    return { kind: "ReturnStmt", value, pos };
  }

  // ── Variable assignment ──────────────────────────────────

  private parseVariableAssign(): VariableAssign {
    const pos = this.pos_();
    const name = this.expect("IDENT").value as string;
    this.expect("EQUALS");
    const value = this.parseExpression();
    return { kind: "VariableAssign", name, value, pos };
  }

  // ── Expressions ──────────────────────────────────────────

  private parseExpression(): Expression {
    return this.parseComparison();
  }

  private parseComparison(): Expression {
    let left = this.parseAdditive();
    while (
      this.current().type === "GT" || this.current().type === "LT" ||
      this.current().type === "GTE" || this.current().type === "LTE" ||
      this.current().type === "EQ_EQ" || this.current().type === "BANG_EQ"
    ) {
      const op = this.advance().value as string;
      const right = this.parseAdditive();
      left = { kind: "BinaryOp", op, left, right, pos: left.pos };
    }
    return left;
  }

  private parseAdditive(): Expression {
    let left = this.parseMultiplicative();
    while (this.current().type === "PLUS" || this.current().type === "DASH") {
      const op = this.advance().value as string;
      const right = this.parseMultiplicative();
      left = { kind: "BinaryOp", op, left, right, pos: left.pos };
    }
    return left;
  }

  private parseMultiplicative(): Expression {
    let left = this.parseUnary();
    while (
      this.current().type === "STAR" ||
      this.current().type === "SLASH" ||
      this.current().type === "PERCENT"
    ) {
      const op = this.advance().value as string;
      const right = this.parseUnary();
      left = { kind: "BinaryOp", op, left, right, pos: left.pos };
    }
    return left;
  }

  private parseUnary(): Expression {
    if (this.current().type === "MINUS") {
      const pos = this.pos_();
      this.advance();
      const operand = this.parseUnary();
      return { kind: "UnaryOp", op: "-", operand, pos };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expression {
    let expr = this.parsePrimary();

    while (true) {
      if (this.current().type === "DOT") {
        this.advance();
        const prop = this.expect("IDENT").value as string;

        // Method call: obj.method(args)
        if (this.current().type === "LPAREN") {
          this.advance();
          const args: Expression[] = [];
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

  private parsePrimary(): Expression {
    const tok = this.current();
    const pos = this.pos_();

    // Template reference
    if (tok.type === "TEMPLATE_OPEN") {
      this.advance();
      return { kind: "TemplateRef", name: tok.value as string, pos };
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
    if (tok.type === "TRUE") { this.advance(); return { kind: "Literal", value: true, pos }; }
    if (tok.type === "FALSE") { this.advance(); return { kind: "Literal", value: false, pos }; }
    if (tok.type === "NULL") { this.advance(); return { kind: "Literal", value: null, pos }; }

    // Anonymous function: fn(params) { body }
    if (tok.type === "FN") {
      return this.parseAnonymousFn();
    }

    // Identifier or class instantiation
    if (tok.type === "IDENT") {
      this.advance();

      // Class instantiation: ClassName { ... }
      if (this.current().type === "LBRACE") {
        return this.parseClassInstantiation(tok.value as string, pos);
      }

      return { kind: "Identifier", name: tok.value as string, pos };
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

  private parseAnonymousFn(): FuncDef {
    const pos = this.pos_();
    this.expect("FN");

    this.expect("LPAREN");
    const params: string[] = [];
    if (this.current().type !== "RPAREN") {
      params.push(this.expect("IDENT").value as string);
      while (this.match("COMMA")) {
        params.push(this.expect("IDENT").value as string);
      }
    }
    this.expect("RPAREN");

    this.expect("LBRACE");
    const body = this.parseReturnStmt();
    this.expect("RBRACE");

    return { kind: "FuncDef", params, body, pos };
  }

  private parseClassInstantiation(className: string, pos: Position): ClassInstance {
    this.expect("LBRACE");
    const overrides: Record<string, Expression> = {};

    while (this.current().type !== "RBRACE") {
      const key = this.parseObjectKey();
      this.expect("COLON");
      const val = this.parseExpression();
      overrides[key] = val;
      this.match("COMMA");
    }

    this.expect("RBRACE");
    return { kind: "ClassInstance", className, overrides, pos };
  }

  private parseArrayLiteral(): ArrayLit {
    const pos = this.pos_();
    this.expect("LBRACKET");
    const elements: Expression[] = [];

    if (this.current().type !== "RBRACKET") {
      elements.push(this.parseExpression());
      while (this.match("COMMA")) {
        if (this.current().type === "RBRACKET") break;
        elements.push(this.parseExpression());
      }
    }

    this.expect("RBRACKET");
    return { kind: "ArrayLit", elements, pos };
  }

  private parseObjectKey(): string {
    if (this.current().type === "STRING") {
      const val = this.current().value as string;
      this.advance();
      return val;
    }
    return this.expect("IDENT").value as string;
  }

  private parseObjectLiteral(): ObjectLit {
    const pos = this.pos_();
    this.expect("LBRACE");
    const pairs: Record<string, Expression> = {};

    while (this.current().type !== "RBRACE") {
      // Bare template reference as value
      if (this.current().type === "TEMPLATE_OPEN") {
        const val = this.parseExpression();
        if (val.kind === "TemplateRef") {
          pairs[val.name] = val;
        } else {
          pairs["_"] = val;
        }
      } else if (this.current().type === "IDENT" && this.peek(1).type !== "COLON") {
        // Bare identifier (not followed by colon) - could be template ref
        const val = this.parseExpression();
        if (val.kind === "TemplateRef") {
          pairs[val.name] = val;
        } else {
          pairs["_"] = val;
        }
      } else {
        const key = this.parseObjectKey();
        this.expect("COLON");
        const val = this.parseExpression();
        pairs[key] = val;
      }
      this.match("COMMA");
    }

    this.expect("RBRACE");
    return { kind: "ObjectLit", pairs, pos };
  }
}

export function parse(source: string, _filename = "<stdin>"): Program {
  const lexer = new Lexer(source, _filename);
  const tokens = lexer.tokens();
  const parser = new Parser(tokens);
  return parser.parse();
}
