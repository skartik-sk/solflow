// Rust emitter — walks the AST and produces formatted Rust source code.
// This is a browser-safe pure-TS formatter (no rustfmt dependency).

import type {
  RustFile,
  RustItem,
  RustStatement,
  RustExpr,
  RustType,
  RustField,
  RustAttribute,
  RustParam,
  RustEnumVariant,
} from '../ast/types';

export class RustEmitter {
  private buf: string[] = [];
  private indentLevel = 0;
  private readonly indentStr = '    '; // 4 spaces

  // ─── Public API ────────────────────────────────────────────────────────────

  emitFile(file: RustFile): string {
    this.buf = [];
    this.indentLevel = 0;
    for (let i = 0; i < file.items.length; i++) {
      this.emitItem(file.items[i]);
      // Blank line between top-level items (except consecutive use statements)
      const next = file.items[i + 1];
      if (next) {
        if (file.items[i].kind !== 'use' || next.kind !== 'use') {
          this.line('');
        }
      }
    }
    return this.buf.join('\n').trimEnd() + '\n';
  }

  // ─── Item dispatch ─────────────────────────────────────────────────────────

  private emitItem(item: RustItem): void {
    switch (item.kind) {
      case 'use':
        this.line(`use ${item.path};`);
        break;

      case 'mod':
        this.line(`${item.visibility ? item.visibility + ' ' : ''}mod ${item.name};`);
        break;

      case 'raw':
        for (const l of item.code.split('\n')) this.line(l);
        break;

      case 'attribute':
        this.line(`${item.outer ? '#' : '#!'}[${item.content}]`);
        break;

      case 'const':
        this.line(
          `${item.visibility ? item.visibility + ' ' : ''}const ${item.name}: ${this.emitType(item.type)} = ${item.value};`
        );
        break;

      case 'type-alias':
        this.line(
          `${item.visibility ? item.visibility + ' ' : ''}type ${item.name} = ${this.emitType(item.type)};`
        );
        break;

      case 'struct':
        this.emitAttributes(item.attributes);
        const structVis = item.visibility ? item.visibility + ' ' : '';
        const generics = item.generics?.length ? `<${item.generics.join(', ')}>` : '';
        this.line(`${structVis}struct ${item.name}${generics} {`);
        this.indent(() => {
          for (const field of item.fields) this.emitField(field);
        });
        this.line('}');
        break;

      case 'enum':
        this.emitAttributes(item.attributes);
        const enumVis = item.visibility ? item.visibility + ' ' : '';
        this.line(`${enumVis}enum ${item.name} {`);
        this.indent(() => {
          for (const v of item.variants) this.emitEnumVariant(v);
        });
        this.line('}');
        break;

      case 'impl':
        const traitPart = item.traitName ? `${item.traitName} for ` : '';
        const implGenerics = item.generics?.length ? `<${item.generics.join(', ')}>` : '';
        this.line(`impl${implGenerics} ${traitPart}${item.typeName} {`);
        this.indent(() => {
          for (const fn_ of item.items) this.emitFn(fn_);
        });
        this.line('}');
        break;

      case 'fn':
        this.emitFn(item);
        break;

      case 'macro-def':
        this.line(`macro_rules! ${item.name} {`);
        for (const l of item.body.split('\n')) this.line(l);
        this.line('}');
        break;
    }
  }

  // ─── Struct field ──────────────────────────────────────────────────────────

  private emitField(field: RustField): void {
    if (field.docComment) this.line(`/// ${field.docComment}`);
    this.emitAttributes(field.attributes);
    const vis = field.visibility ? field.visibility + ' ' : '';
    this.line(`${vis}${field.name}: ${this.emitType(field.type)},`);
  }

  // ─── Enum variant ──────────────────────────────────────────────────────────

  private emitEnumVariant(v: RustEnumVariant): void {
    this.emitAttributes(v.attributes);
    if (v.fields?.length) {
      this.line(`${v.name} {`);
      this.indent(() => {
        for (const f of v.fields!) this.emitField(f);
      });
      this.line('},');
    } else if (v.discriminant !== undefined) {
      this.line(`${v.name} = ${v.discriminant},`);
    } else {
      this.line(`${v.name},`);
    }
  }

  // ─── Function ──────────────────────────────────────────────────────────────

  private emitFn(fn_: import('../ast/types').RustFnDef): void {
    this.emitAttributes(fn_.attributes);
    const vis = fn_.visibility ? fn_.visibility + ' ' : '';
    const unsafe_ = fn_.isUnsafe ? 'unsafe ' : '';
    const generics = fn_.generics?.length ? `<${fn_.generics.join(', ')}>` : '';
    const params = fn_.params.map((p) => this.emitParam(p)).join(', ');
    const ret = fn_.returnType ? ` -> ${this.emitType(fn_.returnType)}` : '';
    this.line(`${vis}${unsafe_}fn ${fn_.name}${generics}(${params})${ret} {`);
    this.indent(() => {
      for (const stmt of fn_.body) this.emitStatement(stmt);
    });
    this.line('}');
  }

  private emitParam(p: RustParam): string {
    return `${p.name}: ${this.emitType(p.type)}`;
  }

  // ─── Statements ────────────────────────────────────────────────────────────

  private emitStatement(stmt: RustStatement): void {
    switch (stmt.kind) {
      case 'let': {
        const mut = stmt.mutable ? 'mut ' : '';
        const ty = stmt.type ? `: ${this.emitType(stmt.type)}` : '';
        this.line(`let ${mut}${stmt.name}${ty} = ${this.emitExpr(stmt.value)};`);
        break;
      }
      case 'assign':
        this.line(`${this.emitExpr(stmt.target)} = ${this.emitExpr(stmt.value)};`);
        break;
      case 'expr':
        this.line(`${this.emitExpr(stmt.expr)};`);
        break;
      case 'return':
        if (stmt.value) {
          this.line(`return ${this.emitExpr(stmt.value)};`);
        } else {
          this.line('return;');
        }
        break;
      case 'if':
        this.line(`if ${this.emitExpr(stmt.condition)} {`);
        this.indent(() => {
          for (const s of stmt.thenBlock) this.emitStatement(s);
        });
        if (stmt.elseBlock?.length) {
          this.line('} else {');
          this.indent(() => {
            for (const s of stmt.elseBlock!) this.emitStatement(s);
          });
        }
        this.line('}');
        break;
      case 'match':
        this.line(`match ${this.emitExpr(stmt.expr)} {`);
        this.indent(() => {
          for (const arm of stmt.arms) {
            this.line(`${arm.pattern} => {`);
            this.indent(() => {
              for (const s of arm.body) this.emitStatement(s);
            });
            this.line('}');
          }
        });
        this.line('}');
        break;
      case 'for':
        this.line(`for ${stmt.var} in ${this.emitExpr(stmt.iter)} {`);
        this.indent(() => {
          for (const s of stmt.body) this.emitStatement(s);
        });
        this.line('}');
        break;
      case 'raw':
        for (const l of stmt.code.split('\n')) this.line(l);
        break;
    }
  }

  // ─── Expressions ──────────────────────────────────────────────────────────

  emitExpr(expr: RustExpr): string {
    switch (expr.kind) {
      case 'literal':
        if (typeof expr.value === 'string') return `"${expr.value}"`;
        if (typeof expr.value === 'boolean') return expr.value ? 'true' : 'false';
        return String(expr.value);
      case 'ident':
        return expr.name;
      case 'field-access':
        return `${this.emitExpr(expr.object)}.${expr.field}`;
      case 'method-call': {
        const args = expr.args.map((a) => this.emitExpr(a)).join(', ');
        return `${this.emitExpr(expr.object)}.${expr.method}(${args})`;
      }
      case 'fn-call': {
        const args = expr.args.map((a) => this.emitExpr(a)).join(', ');
        return `${expr.name}(${args})`;
      }
      case 'macro-call':
        return `${expr.name}!(${expr.args})`;
      case 'binary':
        return `${this.emitExpr(expr.left)} ${expr.op} ${this.emitExpr(expr.right)}`;
      case 'unary':
        return `${expr.op}${this.emitExpr(expr.operand)}`;
      case 'reference': {
        const mut = expr.mutable ? 'mut ' : '';
        return `&${mut}${this.emitExpr(expr.expr)}`;
      }
      case 'try':
        return `${this.emitExpr(expr.expr)}?`;
      case 'struct-init': {
        const fields = expr.fields
          .map((f) => `${f.name}: ${this.emitExpr(f.value)}`)
          .join(', ');
        return `${expr.name} { ${fields} }`;
      }
      case 'closure': {
        const params = expr.params.join(', ');
        const body = expr.body.map((s) => {
          // Inline single-statement closures
          if (s.kind === 'raw') return s.code;
          if (s.kind === 'expr') return this.emitExpr(s.expr);
          return '/* complex closure body */';
        });
        return `|${params}| { ${body.join('; ')} }`;
      }
      case 'raw':
        return expr.code;
    }
  }

  // ─── Types ────────────────────────────────────────────────────────────────

  emitType(type: RustType): string {
    switch (type.kind) {
      case 'simple':
        return type.name;
      case 'generic': {
        const params = type.params.map((p) => this.emitType(p)).join(', ');
        return `${type.name}<${params}>`;
      }
      case 'reference': {
        const lifetime = type.lifetime ? `'${type.lifetime} ` : '';
        const mut = type.mutable ? 'mut ' : '';
        return `&${lifetime}${mut}${this.emitType(type.type)}`;
      }
      case 'array':
        return `[${this.emitType(type.type)}; ${type.size}]`;
      case 'option':
        return `Option<${this.emitType(type.type)}>`;
      case 'vec':
        return `Vec<${this.emitType(type.type)}>`;
      case 'result':
        return `Result<${this.emitType(type.ok)}, ${this.emitType(type.err)}>`;
      case 'raw':
        return type.code;
    }
  }

  // ─── Attributes ───────────────────────────────────────────────────────────

  private emitAttributes(attrs: RustAttribute[]): void {
    for (const attr of attrs) {
      this.line(`${attr.outer ? '#' : '#!'}[${attr.content}]`);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private line(text: string): void {
    const pad = this.indentStr.repeat(this.indentLevel);
    this.buf.push(text.length ? pad + text : '');
  }

  private indent(fn: () => void): void {
    this.indentLevel++;
    fn();
    this.indentLevel--;
  }
}
