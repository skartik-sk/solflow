"use client";

import React from "react";
import type { SolanaType } from "@solflow/flow-nodes";

const SOLANA_PRIMITIVES = [
  "bool",
  "u8", "u16", "u32", "u64", "u128",
  "i8", "i16", "i32", "i64", "i128",
  "f32", "f64",
  "String", "Pubkey",
];

const TYPE_CATEGORIES = ["primitive", "vec", "option", "array", "defined", "enum", "hashMap"] as const;
type TypeCategory = (typeof TYPE_CATEGORIES)[number];

const selectClass =
  "h-7 w-full rounded-md border border-white/[0.08] bg-background/60 px-1.5 text-[12px] outline-none transition-[border-color,box-shadow] duration-150 ease-out hover:border-white/[0.14] focus:border-primary/70 focus:ring-2 focus:ring-primary/20";
const inputClass =
  "h-7 w-full rounded-md border border-white/[0.08] bg-background/60 px-2 text-[12px] outline-none transition-[border-color,box-shadow] duration-150 ease-out hover:border-white/[0.14] focus:border-primary/70 focus:ring-2 focus:ring-primary/20";

function getCategory(t: SolanaType): TypeCategory {
  if (typeof t === "string") {
    if (SOLANA_PRIMITIVES.includes(t)) return "primitive";
    return "defined";
  }
  if (t && typeof t === "object") {
    if ("vec" in t) return "vec";
    if ("option" in t) return "option";
    if ("array" in t) return "array";
    if ("defined" in t) return "defined";
    if ("hashMap" in t) return "hashMap";
    if ("enum" in t) return "enum";
  }
  return "primitive";
}

interface TypeEditorProps {
  value: SolanaType;
  onChange: (t: SolanaType) => void;
  availableStates: Array<{ name: string }>;
  compact?: boolean;
}

export function TypeEditor({ value, onChange, availableStates, compact }: TypeEditorProps) {
  const category = getCategory(value);

  const handleCategoryChange = (newCat: TypeCategory) => {
    switch (newCat) {
      case "primitive":
        onChange("u64");
        break;
      case "vec":
        onChange({ vec: "u64" });
        break;
      case "option":
        onChange({ option: "u64" });
        break;
      case "array":
        onChange({ array: ["u64", 8] });
        break;
      case "defined":
        onChange({ defined: availableStates[0]?.name ?? "MyState" });
        break;
      case "hashMap":
        onChange({ hashMap: ["String", "u64"] });
        break;
      case "enum":
        onChange({ enum: { name: "MyEnum", variants: [{ name: "Variant1" }] } });
        break;
    }
  };

  if (compact) {
    return (
      <div className="space-y-1">
        <CompactCategorySelector category={category} onChange={handleCategoryChange} />
        <TypeValueEditor
          category={category}
          value={value}
          onChange={onChange}
          availableStates={availableStates}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-white/[0.07] bg-background/30 p-2">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">Type</span>
        <select
          className={selectClass}
          value={category}
          onChange={(e) => handleCategoryChange(e.target.value as TypeCategory)}
        >
          {TYPE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {catLabel(cat)}
            </option>
          ))}
        </select>
      </div>
      <TypeValueEditor
        category={category}
        value={value}
        onChange={onChange}
        availableStates={availableStates}
      />
    </div>
  );
}

function CompactCategorySelector({
  category,
  onChange,
}: {
  category: TypeCategory;
  onChange: (c: TypeCategory) => void;
}) {
  return (
    <select
      className={selectClass}
      value={category}
      onChange={(e) => onChange(e.target.value as TypeCategory)}
    >
      {TYPE_CATEGORIES.map((cat) => (
        <option key={cat} value={cat}>
          {catLabel(cat)}
        </option>
      ))}
    </select>
  );
}

function TypeValueEditor({
  category,
  value,
  onChange,
  availableStates,
}: {
  category: TypeCategory;
  value: SolanaType;
  onChange: (t: SolanaType) => void;
  availableStates: Array<{ name: string }>;
}) {
  switch (category) {
    case "primitive":
      return (
        <select
          className={selectClass}
          value={typeof value === "string" ? value : "u64"}
          onChange={(e) => onChange(e.target.value as SolanaType)}
        >
          {SOLANA_PRIMITIVES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      );

    case "defined":
      return (
        <select
          className={selectClass}
          value={typeof value === "object" && "defined" in value ? value.defined : ""}
          onChange={(e) => onChange({ defined: e.target.value })}
        >
          {availableStates.length === 0 && (
            <option value="">No state types defined</option>
          )}
          {availableStates.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      );

    case "vec": {
      const inner = typeof value === "object" && "vec" in value ? value.vec : ("u64" as SolanaType);
      return (
        <div className="space-y-1 border-l border-white/[0.1] pl-2">
          <span className="text-[11px] text-muted-foreground">Vec inner type</span>
          <TypeEditor value={inner} onChange={(t) => onChange({ vec: t })} availableStates={availableStates} compact />
        </div>
      );
    }

    case "option": {
      const inner = typeof value === "object" && "option" in value ? value.option : ("u64" as SolanaType);
      return (
        <div className="space-y-1 border-l border-white/[0.1] pl-2">
          <span className="text-[11px] text-muted-foreground">Option inner type</span>
          <TypeEditor value={inner} onChange={(t) => onChange({ option: t })} availableStates={availableStates} compact />
        </div>
      );
    }

    case "array": {
      const inner =
        typeof value === "object" && "array" in value ? value.array[0] : ("u64" as SolanaType);
      const size =
        typeof value === "object" && "array" in value ? value.array[1] : 8;
      return (
        <div className="space-y-1 border-l border-white/[0.1] pl-2">
          <span className="text-[11px] text-muted-foreground">Array inner type</span>
          <TypeEditor value={inner} onChange={(t) => onChange({ array: [t, size] })} availableStates={availableStates} compact />
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[11px] text-muted-foreground">Size</span>
            <input
              className={inputClass}
              type="number"
              min={1}
              value={size}
              onChange={(e) => onChange({ array: [inner, Number(e.target.value) || 1] })}
            />
          </div>
        </div>
      );
    }

    case "hashMap": {
      const key =
        typeof value === "object" && "hashMap" in value ? value.hashMap[0] : ("String" as SolanaType);
      const val =
        typeof value === "object" && "hashMap" in value ? value.hashMap[1] : ("u64" as SolanaType);
      return (
        <div className="space-y-1 border-l border-white/[0.1] pl-2">
          <span className="text-[11px] text-muted-foreground">Key type</span>
          <TypeEditor value={key} onChange={(k) => onChange({ hashMap: [k, val] })} availableStates={availableStates} compact />
          <span className="text-[11px] text-muted-foreground">Value type</span>
          <TypeEditor value={val} onChange={(v) => onChange({ hashMap: [key, v] })} availableStates={availableStates} compact />
        </div>
      );
    }

    case "enum": {
      const enumDef = typeof value === "object" && "enum" in value
        ? value.enum
        : { name: "MyEnum", variants: [{ name: "Variant1" }] };
      return (
        <div className="space-y-1 border-l border-white/[0.1] pl-2">
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[11px] text-muted-foreground">Name</span>
            <input
              className={inputClass}
              value={enumDef.name}
              onChange={(e) => onChange({ enum: { ...enumDef, name: e.target.value } })}
            />
          </div>
          <span className="text-[11px] text-muted-foreground">Variants</span>
          {enumDef.variants.map((v, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                className={inputClass + " flex-1"}
                value={v.name}
                onChange={(e) => {
                  const newVariants = [...enumDef.variants];
                  newVariants[i] = { ...newVariants[i], name: e.target.value };
                  onChange({ enum: { ...enumDef, variants: newVariants } });
                }}
              />
              <button
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[12px] text-muted-foreground outline-none transition-colors duration-150 hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-primary"
                onClick={() => {
                  const newVariants = enumDef.variants.filter((_, vi) => vi !== i);
                  onChange({ enum: { ...enumDef, variants: newVariants.length ? newVariants : [{ name: "Variant1" }] } });
                }}
              >
                x
              </button>
            </div>
          ))}
          <button
            className="rounded text-[11px] font-medium text-primary outline-none hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            onClick={() =>
              onChange({ enum: { ...enumDef, variants: [...enumDef.variants, { name: `Variant${enumDef.variants.length + 1}` }] } })
            }
          >
            + Add Variant
          </button>
        </div>
      );
    }

    default:
      return null;
  }
}

function catLabel(cat: TypeCategory): string {
  switch (cat) {
    case "primitive":
      return "Primitive";
    case "vec":
      return "Vec<T>";
    case "option":
      return "Option<T>";
    case "array":
      return "[T; N]";
    case "defined":
      return "Custom Type";
    case "hashMap":
      return "HashMap<K,V>";
    case "enum":
      return "Enum";
  }
}
