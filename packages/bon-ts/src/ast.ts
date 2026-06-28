/**
 * BON AST - Abstract Syntax Tree type definitions.
 */

export interface Position {
  line: number;
  column: number;
}

// ── Expression types ─────────────────────────────────────────

export interface Literal {
  kind: "Literal";
  value: string | number | boolean | null;
  pos: Position;
}

export interface Identifier {
  kind: "Identifier";
  name: string;
  pos: Position;
}

export interface TemplateRef {
  kind: "TemplateRef";
  name: string;
  pos: Position;
}

export interface TemplateDef {
  kind: "TemplateDef";
  name: string;
  body: Expression;
  pos: Position;
}

export interface ClassDef {
  kind: "ClassDef";
  name: string;
  parent: string | null;
  members: Record<string, Expression>;
  methods: Record<string, MethodDef>;
  pos: Position;
}

export interface MethodDef {
  kind: "MethodDef";
  name: string;
  params: string[];
  body: ReturnStmt;
  pos: Position;
}

export interface ClassInstance {
  kind: "ClassInstance";
  className: string;
  overrides: Record<string, Expression>;
  pos: Position;
}

export interface MethodCall {
  kind: "MethodCall";
  obj: Expression;
  method: string;
  args: Expression[];
  pos: Position;
}

export interface BinaryOp {
  kind: "BinaryOp";
  op: string;
  left: Expression;
  right: Expression;
  pos: Position;
}

export interface UnaryOp {
  kind: "UnaryOp";
  op: string;
  operand: Expression;
  pos: Position;
}

export interface PropertyAccess {
  kind: "PropertyAccess";
  obj: Expression;
  prop: string;
  pos: Position;
}

export interface FuncCall {
  kind: "FuncCall";
  name: string;
  args: Expression[];
  pos: Position;
}

export interface FuncDef {
  kind: "FuncDef";
  params: string[];
  body: ReturnStmt;
  pos: Position;
}

export interface ReturnStmt {
  kind: "ReturnStmt";
  value: Expression;
  pos: Position;
}

export interface ArrayLit {
  kind: "ArrayLit";
  elements: Expression[];
  pos: Position;
}

export interface ObjectLit {
  kind: "ObjectLit";
  pairs: ObjectPair[];
  conditions?: ConditionalBlock[];
  pos: Position;
}

export interface ObjectPair {
  key: Expression;
  value: Expression;
}

export interface ImportStmt {
  kind: "ImportStmt";
  path: string;
  alias: string | null;
  pos: Position;
}

export interface VariableAssign {
  kind: "VariableAssign";
  name: string;
  value: Expression;
  pos: Position;
}

export interface Param {
  kind: "Param";
  name: string;
  pos: Position;
}

export interface IfExpr {
  kind: "IfExpr";
  cond: Expression;
  thenExpr: Expression;
  elseExpr: Expression | null;
  pos: Position;
}

export interface ConditionalBlock {
  kind: "ConditionalBlock";
  cond: Expression;
  thenBody: ObjectPair[];
  elseBody: ObjectPair[] | null;
  pos: Position;
}

export interface ForLoop {
  kind: "ForLoop";
  varName: string;
  varName2: string | null;  // Second variable for key-value pair traversal
  iterable: Expression;
  body: Expression;
  pos: Position;
}

export interface Range {
  kind: "Range";
  start: number;
  end: number;
  pos: Position;
}

// ── Union type ───────────────────────────────────────────────

export type Expression =
  | Literal
  | Identifier
  | TemplateRef
  | ClassInstance
  | MethodCall
  | BinaryOp
  | UnaryOp
  | PropertyAccess
  | FuncCall
  | FuncDef
  | ArrayLit
  | ObjectLit
  | ReturnStmt
  | Param
  | IfExpr
  | ConditionalBlock
  | ForLoop
  | Range;

export interface Program {
  imports: ImportStmt[];
  templates: Record<string, TemplateDef>;
  classes: Record<string, ClassDef>;
  variables: Record<string, VariableAssign>;
  body: Expression[];
}

// ── Helper constructors ──────────────────────────────────────

export function literal(value: string | number | boolean | null, pos: Position = { line: 0, column: 0 }): Literal {
  return { kind: "Literal", value, pos };
}

export function identifier(name: string, pos: Position = { line: 0, column: 0 }): Identifier {
  return { kind: "Identifier", name, pos };
}

export function templateRef(name: string, pos: Position = { line: 0, column: 0 }): TemplateRef {
  return { kind: "TemplateRef", name, pos };
}

export function binaryOp(op: string, left: Expression, right: Expression, pos: Position = { line: 0, column: 0 }): BinaryOp {
  return { kind: "BinaryOp", op, left, right, pos };
}
