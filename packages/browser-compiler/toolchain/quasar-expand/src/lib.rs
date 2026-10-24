//! Expands Quasar's procedural macros ahead of compilation, so the in-browser rustc (which can't
//! load native macro libraries) only ever sees plain Rust. Uses quasar-derive's own code.

use proc_macro2::TokenStream;
use quote::ToTokens;
use std::collections::BTreeMap;
use syn::visit_mut::VisitMut;
use syn::{Attribute, Item, Meta};

const ATTRIBUTE_MACROS: [&str; 5] = ["program", "instruction", "account", "event", "error_code"];
const ACCOUNTS_HELPERS: [&str; 2] = ["account", "instruction"];
/// Expansions can produce more macro uses; stop well before anything pathological.
const MAX_ROUNDS: usize = 16;

fn macro_name(path: &syn::Path) -> Option<String> {
    let last = path.segments.last()?.ident.to_string();
    // `program`, `quasar_lang::prelude::program`, … but not some other crate's macro.
    let first = path.segments.first()?.ident.to_string();
    (path.segments.len() == 1 || first == "quasar_lang" || first == "quasar_derive").then_some(last)
}

fn attrs_mut(item: &mut Item) -> Option<&mut Vec<Attribute>> {
    Some(match item {
        Item::Fn(i) => &mut i.attrs,
        Item::Struct(i) => &mut i.attrs,
        Item::Enum(i) => &mut i.attrs,
        Item::Mod(i) => &mut i.attrs,
        Item::Impl(i) => &mut i.attrs,
        Item::Const(i) => &mut i.attrs,
        Item::Static(i) => &mut i.attrs,
        Item::Type(i) => &mut i.attrs,
        Item::Trait(i) => &mut i.attrs,
        Item::Union(i) => &mut i.attrs,
        _ => return None,
    })
}

fn derives_accounts(attrs: &[Attribute]) -> bool {
    attrs.iter().any(|a| {
        a.path().is_ident("derive")
            && a.parse_args_with(syn::punctuated::Punctuated::<syn::Path, syn::Token![,]>::parse_terminated)
                .is_ok_and(|paths| paths.iter().any(|p| macro_name(p).as_deref() == Some("Accounts")))
    })
}

fn attr_args(attr: &Attribute) -> TokenStream {
    match &attr.meta {
        Meta::List(list) => list.tokens.clone(),
        _ => TokenStream::new(),
    }
}

fn parse_items(tokens: TokenStream) -> Result<Vec<Item>, String> {
    syn::parse2::<syn::File>(tokens)
        .map(|f| f.items)
        .map_err(|e| format!("macro expansion produced invalid Rust: {e}"))
}

/// Remove `Accounts` from derive lists (dropping emptied derives) and its helper attributes.
fn strip_accounts(item: &mut Item) {
    if let Some(attrs) = attrs_mut(item) {
        attrs.retain_mut(|a| {
            if a.path().is_ident("derive") {
                if let Ok(paths) = a.parse_args_with(syn::punctuated::Punctuated::<syn::Path, syn::Token![,]>::parse_terminated) {
                    let kept: Vec<_> = paths.into_iter().filter(|p| macro_name(p).as_deref() != Some("Accounts")).collect();
                    if kept.is_empty() {
                        return false;
                    }
                    *a = syn::parse_quote!(#[derive(#(#kept),*)]);
                }
                return true;
            }
            !ACCOUNTS_HELPERS.iter().any(|h| a.path().is_ident(h))
        });
    }
    if let Item::Struct(s) = item {
        for field in s.fields.iter_mut() {
            field.attrs.retain(|a| !ACCOUNTS_HELPERS.iter().any(|h| a.path().is_ident(h)));
        }
    }
}

/// Function-like macros used inside function bodies.
struct BangMacros {
    changed: bool,
    error: Option<String>,
}

impl BangMacros {
    fn expand(&mut self, mac: &syn::Macro) -> Option<TokenStream> {
        match macro_name(&mac.path).as_deref() {
            Some("emit_cpi") => Some(quasar_derive::emit_cpi(mac.tokens.clone())),
            _ => None,
        }
    }
}

impl VisitMut for BangMacros {
    fn visit_expr_mut(&mut self, expr: &mut syn::Expr) {
        if let syn::Expr::Macro(m) = expr {
            if let Some(tokens) = self.expand(&m.mac) {
                match syn::parse2::<syn::Expr>(quote::quote!({ #tokens })) {
                    Ok(e) => {
                        *expr = e;
                        self.changed = true;
                    }
                    Err(e) => self.error = Some(e.to_string()),
                }
                return;
            }
        }
        syn::visit_mut::visit_expr_mut(self, expr);
    }

    fn visit_stmt_mut(&mut self, stmt: &mut syn::Stmt) {
        if let syn::Stmt::Macro(m) = stmt {
            if let Some(tokens) = self.expand(&m.mac) {
                match syn::parse2::<syn::Block>(quote::quote!({ #tokens })) {
                    Ok(block) => {
                        *stmt = syn::Stmt::Expr(syn::Expr::Block(syn::ExprBlock { attrs: vec![], label: None, block }), Some(Default::default()));
                        self.changed = true;
                    }
                    Err(e) => self.error = Some(e.to_string()),
                }
                return;
            }
        }
        syn::visit_mut::visit_stmt_mut(self, stmt);
    }
}

/// One expansion pass over a list of items. Returns whether anything changed.
fn expand_items(items: &mut Vec<Item>) -> Result<bool, String> {
    let mut changed = false;
    let mut out = Vec::with_capacity(items.len());
    for mut item in std::mem::take(items) {
        // Item-level function-like macros, e.g. `declare_program!(…)`.
        if let Item::Macro(m) = &item {
            if macro_name(&m.mac.path).as_deref() == Some("declare_program") {
                out.extend(parse_items(quasar_derive::declare_program(m.mac.tokens.clone()))?);
                changed = true;
                continue;
            }
        }

        let has_accounts = attrs_mut(&mut item).is_some_and(|a| derives_accounts(a));

        // Attribute macros, outermost first. On a #[derive(Accounts)] struct, `account` and
        // `instruction` are that derive's helper attributes, not macros.
        let position = attrs_mut(&mut item).and_then(|attrs| {
            attrs.iter().position(|a| {
                let name = macro_name(a.path()).unwrap_or_default();
                ATTRIBUTE_MACROS.contains(&name.as_str()) && !(has_accounts && ACCOUNTS_HELPERS.contains(&name.as_str()))
            })
        });
        if let Some(i) = position {
            let attr = attrs_mut(&mut item).unwrap().remove(i);
            let args = attr_args(&attr);
            let input = item.to_token_stream();
            let expanded = match macro_name(attr.path()).as_deref() {
                Some("program") => quasar_derive::program(args, input),
                Some("instruction") => quasar_derive::instruction(args, input),
                Some("account") => quasar_derive::account(args, input),
                Some("event") => quasar_derive::event(args, input),
                Some("error_code") => quasar_derive::error_code(args, input),
                _ => unreachable!(),
            };
            out.extend(parse_items(expanded)?);
            changed = true;
            continue;
        }

        if has_accounts {
            // A derive sees the item as written; its output is added next to the item.
            let generated = parse_items(quasar_derive::derive_accounts(item.to_token_stream()))?;
            strip_accounts(&mut item);
            out.push(item);
            out.extend(generated);
            changed = true;
            continue;
        }

        if let Item::Mod(module) = &mut item {
            if let Some((_, content)) = &mut module.content {
                changed |= expand_items(content)?;
            }
        }

        let mut bang = BangMacros { changed: false, error: None };
        bang.visit_item_mut(&mut item);
        if let Some(err) = bang.error {
            return Err(err);
        }
        changed |= bang.changed;
        out.push(item);
    }
    *items = out;
    Ok(changed)
}

/// Expand every Quasar macro in one source file, returning formatted Rust.
pub fn expand_source(source: &str) -> Result<String, String> {
    let mut file = syn::parse_file(source).map_err(|e| format!("couldn't parse: {e}"))?;
    for _ in 0..MAX_ROUNDS {
        if !expand_items(&mut file.items)? {
            return Ok(prettyplease::unparse(&file));
        }
    }
    Err("macro expansion didn't settle".to_owned())
}

/// Expand a set of files (path → source); each error is reported with its file.
pub fn expand_files(files: &BTreeMap<String, String>) -> Result<BTreeMap<String, String>, String> {
    files
        .iter()
        .map(|(path, src)| expand_source(src).map(|out| (path.clone(), out)).map_err(|e| format!("{path}: {e}")))
        .collect()
}

#[cfg(target_arch = "wasm32")]
mod wasm {
    use super::*;
    use wasm_bindgen::prelude::*;

    /// JSON `{ path: source }` in, JSON `{ path: expanded }` out.
    #[wasm_bindgen(js_name = expandQuasar)]
    pub fn expand_quasar(files_json: &str) -> Result<String, String> {
        let files: BTreeMap<String, String> = serde_json::from_str(files_json).map_err(|e| e.to_string())?;
        serde_json::to_string(&expand_files(&files)?).map_err(|e| e.to_string())
    }
}
