/**
 * BON AST - Abstract Syntax Tree type definitions.
 */
// ── Helper constructors ──────────────────────────────────────
export function literal(value, pos = { line: 0, column: 0 }) {
    return { kind: "Literal", value, pos };
}
export function identifier(name, pos = { line: 0, column: 0 }) {
    return { kind: "Identifier", name, pos };
}
export function templateRef(name, pos = { line: 0, column: 0 }) {
    return { kind: "TemplateRef", name, pos };
}
export function binaryOp(op, left, right, pos = { line: 0, column: 0 }) {
    return { kind: "BinaryOp", op, left, right, pos };
}
//# sourceMappingURL=ast.js.map