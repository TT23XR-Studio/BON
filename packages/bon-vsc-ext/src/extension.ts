import * as vscode from "vscode";
import { evaluate, load, EvalError } from "bon-ts";
import { Lexer } from "bon-ts/lexer";
import { Parser, ParseError } from "bon-ts/parser";

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
  diagnosticCollection = vscode.languages.createDiagnosticCollection("bon");

  // Register completion provider
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    "bon",
    new BonCompletionProvider(),
    ".",
    '"',
    "{"
  );

  // Register hover provider for std functions
  const hoverProvider = vscode.languages.registerHoverProvider(
    "bon",
    new BonHoverProvider()
  );

  // Register definition provider (go to template/class definition)
  const definitionProvider = vscode.languages.registerDefinitionProvider(
    "bon",
    new BonDefinitionProvider()
  );

  // Register diagnostic provider
  const openListener = vscode.workspace.onDidOpenTextDocument(triggerDiagnostics);
  const changeListener = vscode.workspace.onDidChangeTextDocument(triggerChange);
  const closeListener = vscode.workspace.onDidCloseTextDocument((doc) => {
    if (doc.languageId === "bon") {
      diagnosticCollection.delete(doc.uri);
    }
  });

  // Run diagnostics on already-open documents
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

export function deactivate() {}

// ── Debounced diagnostic helpers ──────────────────────────────

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function triggerDiagnostics(document: vscode.TextDocument): void {
  if (document.languageId !== "bon") return;
  updateDiagnostics(document);
}

function triggerChange(event: vscode.TextDocumentChangeEvent): void {
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

function updateDiagnostics(document: vscode.TextDocument): void {
  const config = vscode.workspace.getConfiguration("bon");
  if (!config.get<boolean>("enableDiagnostics", true)) {
    diagnosticCollection.delete(document.uri);
    return;
  }

  const text = document.getText();
  const diagnostics: vscode.Diagnostic[] = [];
  const params = config.get<Record<string, unknown>>("params", {});

  // Phase 1: Lexer + Parser (syntax errors)
  try {
    const lexer = new Lexer(text);
    const tokens = lexer.tokens();
    const parser = new Parser(tokens);
    parser.parse();
  } catch (e: unknown) {
    if (e instanceof ParseError) {
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

  // Phase 2: Evaluation (semantic errors) only if syntax is clean
  if (diagnostics.length === 0) {
    try {
      // Determine base dir for import resolution
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      const baseDir = workspaceFolder
        ? workspaceFolder.uri.fsPath
        : document.uri.fsPath;
      evaluate(text, baseDir, params);
    } catch (e: unknown) {
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

function errorToDiagnostic(
  message: string,
  pos?: { line: number; column: number }
): vscode.Diagnostic | null {
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

// ── Completion Provider ──────────────────────────────────────

class BonCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    // Get current line text
    const lineText = document.lineAt(position).text;
    const textBefore = lineText.substring(0, position.character);

    // Check if we're after a dot (property access)
    if (textBefore.endsWith(".")) {
      // std.xxx completions
      const stdCompletions = this.getStdCompletions();
      items.push(...stdCompletions);
      return items;
    }

    // Check if we're inside a template reference {xxx}
    const templateMatch = textBefore.match(/\{([a-zA-Z_][a-zA-Z0-9_]*)?$/);
    if (templateMatch) {
      // Offer template completions
      items.push(...this.getTemplateCompletions(document, position));
      return items;
    }

    // Top-level completions
    items.push(...this.getKeywordCompletions());
    items.push(...this.getSnippetCompletions());

    return items;
  }

  private getStdCompletions(): vscode.CompletionItem[] {
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
      { name: "type_of", sig: "std.type_of(value: any): string", doc: "Get type name" },
    ];

    return stdFunctions.map((fn) => {
      const item = new vscode.CompletionItem(fn.name, vscode.CompletionItemKind.Function);
      item.detail = fn.sig;
      item.documentation = new vscode.MarkdownString(fn.doc);
      item.insertText = fn.name;
      return item;
    });
  }

  private getKeywordCompletions(): vscode.CompletionItem[] {
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
      { name: "in", doc: "Part of for loop syntax" },
    ];

    return keywords.map((kw) => {
      const item = new vscode.CompletionItem(kw.name, vscode.CompletionItemKind.Keyword);
      item.documentation = new vscode.MarkdownString(kw.doc);
      return item;
    });
  }

  private getSnippetCompletions(): vscode.CompletionItem[] {
    const snippets = [
      {
        label: "template",
        snippet: "${1:name}-{${2:value}}",
        doc: "Template definition",
      },
      {
        label: "class",
        snippet:
          "class ${1:Name} {\n\t\"${2:key}\": ${3:value},\n\n\tfn ${4:method}(${5:params}) {\n\t\treturn ${6:expr}\n\t}\n}",
        doc: "Class definition",
      },
      {
        label: "fn",
        snippet: "fn(${1:args}) { return ${2:expr} }",
        doc: "Anonymous function",
      },
      {
        label: "import",
        snippet: 'import "${1:path}" as ${2:Alias}',
        doc: "Import statement",
      },
      {
        label: "if",
        snippet: "if (${1:cond}) { ${2:then} } else { ${3:else} }",
        doc: "Conditional expression",
      },
      {
        label: "for",
        snippet: "for ${1:item} in ${2:iterable} { ${3:body} }",
        doc: "Loop expression",
      },
      {
        label: "param",
        snippet: "${1:name}",
        doc: "Insert compile-time parameter reference",
      },
    ];

    return snippets.map((s) => {
      const item = new vscode.CompletionItem(s.label, vscode.CompletionItemKind.Snippet);
      item.insertText = new vscode.SnippetString(s.snippet);
      item.documentation = new vscode.MarkdownString(s.doc);
      return item;
    });
  }

  private getTemplateCompletions(
    _document: vscode.TextDocument,
    _position: vscode.Position
  ): vscode.CompletionItem[] {
    return [];
  }
}

// ── Hover Provider ───────────────────────────────────────────

class BonHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Hover> {
    const word = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);
    if (!word) return null;

    const text = document.getText(word);

    // Check for std.xxx pattern
    const lineText = document.lineAt(position).text;
    const stdMatch = lineText.match(/std\.([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (stdMatch) {
      const funcName = stdMatch[1];
      return this.getStdHover(funcName);
    }

    // Check for keywords
    const keywords: Record<string, string> = {
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
      in: "**in** - Part of for loop syntax",
    };

    if (text in keywords) {
      return new vscode.Hover(new vscode.MarkdownString(keywords[text]));
    }

    return null;
  }

  private getStdHover(funcName: string): vscode.Hover | null {
    const docs: Record<string, string> = {
      upper: "**std.upper(s)** - Convert string to uppercase\n\n```bon\nstd.upper(\"hello\") // \"HELLO\"\n```",
      lower: "**std.lower(s)** - Convert string to lowercase\n\n```bon\nstd.lower(\"WORLD\") // \"world\"\n```",
      trim: "**std.trim(s)** - Remove leading/trailing whitespace\n\n```bon\nstd.trim(\"  hi  \") // \"hi\"\n```",
      split: '**std.split(s, sep)** - Split string by separator\n\n```bon\nstd.split("a,b,c", ",") // ["a","b","c"]\n```',
      replace: '**std.replace(s, old, new)** - Replace substring\n\n```bon\nstd.replace("foo bar", "bar", "baz") // "foo baz"\n```',
      len: "**std.len(x)** - Get length of string, array, or object\n\n```bon\nstd.len(\"hello\") // 5\nstd.len([1,2,3]) // 3\n```",
      at: "**std.at(array, index)** - Get element at index (supports negative)\n\n```bon\nstd.at([10,20,30], -1) // 30\n```",
      first: "**std.first(array)** - Get first element\n\n```bon\nstd.first([5,6]) // 5\n```",
      last: "**std.last(array)** - Get last element\n\n```bon\nstd.last([5,6]) // 6\n```",
      map: "**std.map(array, fn)** - Map transform\n\n```bon\nstd.map([1,2], fn(x) { return x * 2 }) // [2,4]\n```",
      filter: "**std.filter(array, fn)** - Filter elements\n\n```bon\nstd.filter([1,2,3], fn(x) { return x > 1 }) // [2,3]\n```",
      reduce: "**std.reduce(array, init, fn)** - Reduce/fold array\n\n```bon\nstd.reduce([1,2,3], 0, fn(a,b) { return a + b }) // 6\n```",
      concat: "**std.concat(a1, a2)** - Concatenate two arrays\n\n```bon\nstd.concat([1], [2]) // [1,2]\n```",
      merge: "**std.merge(obj1, obj2)** - Shallow merge objects\n\n```bon\nstd.merge({\"a\":1}, {\"b\":2}) // {\"a\":1, \"b\":2}\n```",
      keys: "**std.keys(obj)** - Get object keys\n\n```bon\nstd.keys({\"a\":1, \"b\":2}) // [\"a\",\"b\"]\n```",
      values: "**std.values(obj)** - Get object values\n\n```bon\nstd.values({\"a\":1, \"b\":2}) // [1,2]\n```",
      to_string: "**std.to_string(x)** - Convert value to string\n\n```bon\nstd.to_string(123) // \"123\"\n```",
      to_number: "**std.to_number(s)** - Convert string to number\n\n```bon\nstd.to_number(\"42.5\") // 42.5\n```",
      type_of: '**std.type_of(x)** - Get type name\n\n```bon\ntype_of([1]) // "array"\ntype_of("hi") // "string"\n```',
    };

    if (funcName in docs) {
      return new vscode.Hover(new vscode.MarkdownString(docs[funcName]));
    }

    return null;
  }
}

// ── Definition Provider ──────────────────────────────────────

class BonDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Definition> {
    const word = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);
    if (!word) return null;

    const text = document.getText(word);

    // Search for template/class definitions in the document
    const fullText = document.getText();
    const lines = fullText.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for template definition: name-{ ... }
      const templateMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*-\s*\{/);
      if (templateMatch && templateMatch[1] === text) {
        return new vscode.Location(document.uri, new vscode.Position(i, 0));
      }

      // Check for class definition: class Name { ... }
      const classMatch = line.match(/\bclass\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (classMatch && classMatch[1] === text) {
        return new vscode.Location(document.uri, new vscode.Position(i, line.indexOf("class")));
      }
    }

    return null;
  }
}
