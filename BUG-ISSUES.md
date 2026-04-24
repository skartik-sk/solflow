# Bug & Issue Tracker — SolStudio CLI

Generated: 2026-04-22 | Tests passing: 646/647

---

## CRITICAL (Must Fix)

### C1. Duplicate Ok(()) check — logic-parser.ts:36
- `line === "Ok(())"` appears 3 times, plus a typo `"Ok(()))"` (extra paren)
- Fix: Single check `line === "Ok(())"`

### C2. ID counter not reset between parseProgram calls — to-flow.ts:15
- Module-level `_idCounter = 0` is never reset between calls
- Second parse will have IDs starting from where last left off
- Fix: Call `resetIdCounter()` at start of `parsedProgramToFlow()`

### C3. Missing account struct validation — to-flow.ts:94
- `parsed.accounts[ix.accountsStructName]` accessed without null check
- Fix: Add fallback `|| []`

### C4. Hardcoded version "0.1.0" — rust-parser index.ts:116
- Should be parsed from Cargo.toml or omitted
- Fix: Try to parse from Cargo.toml, fallback to "0.1.0"

### C5. Hardcoded license "MIT" — to-flow.ts:44
- Program node data has license regardless of actual project
- Fix: Remove or parse from Cargo.toml

### C6. Placeholder program ID in init.ts:11
- `PLACEHOLDER1111111111111111111111111111111111` is not valid base58
- Fix: Use a valid placeholder like `11111111111111111111111111111111`

---

## HIGH (Should Fix)

### H1. depth >= 0 logic in collectBlockLines — logic-parser.ts:314
- Condition should be `depth > 0` semantically

### H2. No input validation on server routes — server/index.ts
- PUT /api/project writes req.body without validation
- POST /api/codegen and /api/audit don't validate nodes/edges

### H3. Type assertions without validation — init.ts:44,69, server:73
- `as "anchor" | "pinocchio" | "quasar"` bypasses type safety

### H4. Missing @solflow/versioning dependency — standalone package.json
- ui-store.ts imports FlowDiff from versioning but not in deps

### H5. Naive path split for project name — view.ts:24
- `split("/").pop()` fails on Windows
- Fix: Use `path.basename()`

### H6. Parse command missing --format ir — parse.ts
- Plan specifies json|ir|summary but only json and summary work

### H7. No format option validation — parse.ts, idl.ts
- Accepts any string for --format

### H8. Silent error handling — config.ts:50, detect.ts:50,68
- Multiple catch {} blocks swallow errors

### H9. Security: 50MB JSON payload limit — server/index.ts:27
- Excessive for local CLI
- Fix: Reduce to 5MB

### H10. Security: Unrestricted CORS — server/index.ts:26
- Fix: Restrict to localhost origins

---

## MEDIUM (Important)

### M1. Error parser: hardcoded error code 6000 — error-parser.ts:35
### M2. Regex global flag misuse — error-parser.ts:37, constant-parser.ts:13
### M3. Constraint parser incomplete — missing address, owner, realloc
### M4. Logic parser: no match/loop/while/for support
### M5. Logic parser: only handles += not -= *= /= %=
### M6. Logic parser: if-else misses } else if {
### M7. findTransferInfo only looks back 10 lines
### M8. extractAmount returns "?" on failure — silent data loss
### M9. IDL command missing --view flag
### M10. No graceful shutdown in server
### M11. Standalone shows hardcoded "SolStudio Local" not project name
### M12. Missing Quasar framework detection in detect.ts
### M13. No IDL JSON validation in idl.ts

---

## LOW (Nice to Have)

### L1. Type mapper missing types (char, tuples, &[u8], Sysvars)
### L2. No Pinocchio framework support in parser
### L3. No watcher debounce in server
### L4. Test fixture path mismatch in server.test.ts
### L5. Test fixture helpers duplicated in bugfixes.test.ts
### L6-L8. No tests for browser.ts, file watcher, WebSocket messages
### L9. Hardcoded SKIP_DIRS in scanner.ts
### L10. Missing if let support in logic parser

---

## MISSING TEST COVERAGE

- Logic parser: if-else, transfers, mint/burn, checked math, multi-line, nested blocks
- Constraint parser: all constraint types
- CLI: browser.ts, file watcher, WebSocket messages, server validation, format options
- Error parser: explicit error codes
- Malformed input handling across all parsers

---

## FIX PROGRESS

- [x] C1. Duplicate Ok(()) check — FIXED
- [x] C2. ID counter reset — was already working
- [x] C3. Missing account struct validation — FIXED (added ?? [])
- [x] C4. Hardcoded version — FIXED (parse from Cargo.toml)
- [x] C5. Hardcoded license — FIXED (removed)
- [x] C6. Placeholder program ID — FIXED (valid base58)
- [x] H1. depth >= 0 logic — FIXED (rewrote collectBlockLines)
- [x] H2. Server input validation — FIXED
- [x] H3. Type assertions — FIXED (validated framework values)
- [x] H4. Missing versioning dep — FIXED
- [x] H5. Naive path split — FIXED (use path.basename)
- [x] H6. Missing --format ir — FIXED
- [x] H7. Format validation — FIXED
- [x] H8. Silent error handling — FIXED (added warning logs)
- [x] H9. 50MB payload — FIXED (reduced to 5MB)
- [x] H10. CORS restriction — FIXED (localhost only)
- [x] M5. Logic parser compound operators — FIXED (all: +=, -=, *=, /=, %=)
- [x] M7. findTransferInfo lookback — FIXED (10→20 lines)
- [x] M8. extractAmount fallback — FIXED (empty string instead of "?")
- [x] M11. Standalone project name — FIXED (from API)
- [x] M12. Quasar detection — PARTIAL (added detection note)
- [x] M13. IDL validation — FIXED
- [x] Tests Round 1: 65 new tests added (646→711 passing)

## Round 2 Fixes

- [x] R2-1. findTransferInfo infinite recursion — FIXED (flat loop, no recursion)
- [x] R2-2. to-flow if-else missing body data — FIXED (added thenBody/elseBody)
- [x] R2-3. parseFile missing error handling — FIXED (try-catch, returns empty)
- [x] R2-4. Duplicate Ok(()) still present — FIXED (removed)
- [x] R2-5. Regex lastIndex not reset — FIXED (error-parser, constant-parser, program-parser)
- [x] R2-6. logicOps not initialized — FIXED (always [])
- [x] R2-7. Port validation — FIXED (1-65535 check)
- [x] R2-8. EADDRINUSE error message — FIXED (suggest --port)
- [x] R2-9. Config value validation — FIXED (framework, mode, port)
- [x] R2-10. Broadcast error handling — FIXED (try-catch per client)
- [x] R2-11. detect.ts recursion limit — FIXED (depth=10 max)
- [x] R2-12. browser.ts timeout — FIXED (5s timeout)
- [x] R2-13. Auth hardcoded secret — FIXED (require AUTH_SECRET env, timing-safe compare)
- [x] R2-14. Audit silent catch — FIXED (logs rule ID + error)
- [x] R2-15. idl-import unknown type — ADDED isUnknownType helper
- [x] Tests Round 2: 22 new tests (711→733 passing)

Final: 733 pass / 1 fail (pre-existing e2e Playwright issue)
