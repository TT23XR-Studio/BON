/**
 * BON AST - Abstract Syntax Tree type definitions.
 */
export interface Position {
    line: number;
    column: number;
}
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
    pairs: Record<string, Expression>;
    pos: Position;
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
export type Expression = Literal | Identifier | TemplateRef | ClassInstance | MethodCall | BinaryOp | UnaryOp | PropertyAccess | FuncCall | FuncDef | ArrayLit | ObjectLit | ReturnStmt;
export interface Program {
    imports: ImportStmt[];
    templates: Record<string, TemplateDef>;
    classes: Record<string, ClassDef>;
    variables: Record<string, VariableAssign>;
    body: Expression[];
}
export declare function literal(value: string | number | boolean | null, pos?: Position): Literal;
export declare function identifier(name: string, pos?: Position): Identifier;
export declare function templateRef(name: string, pos?: Position): TemplateRef;
export declare function binaryOp(op: string, left: Expression, right: Expression, pos?: Position): BinaryOp;
//# sourceMappingURL=ast.d.ts.map