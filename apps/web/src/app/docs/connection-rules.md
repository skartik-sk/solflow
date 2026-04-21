# Connection Rules

This document describes every valid connection between node types in Solana Contract Flow. Understanding these rules is essential for building correct flows.

---

## Overview

Connections define relationships between nodes. Each connection goes from an **output handle** on a source node to an **input handle** on a target node. The editor enforces type compatibility: only valid connections can be made.

---

## Connection Diagram

```
                        +-----------+
                        |  Program  |
                        +-----+-----+
                              |
                              | (instruction-out -> instruction-in)
                              v
                        +-----------+
                 +----->| Instruction|
                 |      +--+--+--+--+
                 |         |  |  |  |
        +--------+--+      |  |  |  |
        |   Error   |<-----+  |  |  +-----> +-----------+
        +-----------+  error   |  +-------->|   Event   |
                        |     |            +-----------+
                        |     |
                  account|    |logic
                        |     |
                        v     v
                  +-----------+    +-----------+
                  |  Account  |<---|   Logic   |
                  +--+-----+--+    +--+-----+-+
                     |     ^          |     ^
                     |     |          |     |
              constraint   |state  logic-in  logic-out
                     |     |          |     |
                     v     |          v     |
                  +-----------+    +-----------+
                  | Constraint|    |   Logic   |  (chain)
                  +-----------+    +-----------+
                                        ^
                                        |  (then/else branches)
                                  +-----------+
                                  |  If-Else  |---> child logic nodes
                                  +-----------+
```

---

## Valid Connections

### Program -> Instruction

| Source Handle | Target Handle | Description |
|---------------|---------------|-------------|
| `instruction-out` (bottom) | `instruction-in` (top) | The instruction belongs to this program |

**Rules:**
- A Program can connect to multiple Instruction nodes.
- Every Instruction must be connected to exactly one Program.
- A flow must have exactly one Program node and at least one Instruction.

---

### Instruction -> Account

| Source Handle | Target Handle | Description |
|---------------|---------------|-------------|
| `account-out` (right) | `account-in` (top) | This account is used by the instruction |

**Rules:**
- An Instruction can connect to multiple Account nodes.
- An Account can be connected to multiple Instructions (shared account).
- An Instruction with zero accounts generates a warning.

---

### Instruction -> Logic

| Source Handle | Target Handle | Description |
|---------------|---------------|-------------|
| `logic-out` (bottom) | `logic-in` (top) | This logic operation runs in the instruction body |

**Rules:**
- An Instruction can connect to multiple Logic nodes.
- Logic nodes execute in `order` property sequence (ascending numeric order).

---

### Instruction -> Error

| Source Handle | Target Handle | Description |
|---------------|---------------|-------------|
| `error-out` (left) | `error-in` (left) | This error variant is used by the instruction |

**Rules:**
- An Instruction can connect to multiple Error nodes.
- Error nodes are global: they are collected into a single error enum shared by all instructions.

---

### Instruction -> Event

| Source Handle | Target Handle | Description |
|---------------|---------------|-------------|
| `event-out` (left) | `event-in` (left) | This event type can be emitted by the instruction |

**Rules:**
- An Instruction can connect to multiple Event nodes.
- Event nodes are global: they generate event structs that any instruction can reference.

---

### Instruction -> Custom Code

| Source Handle | Target Handle | Description |
|---------------|---------------|-------------|
| `logic-out` (bottom) | `logic-in` (top) | Custom code runs in the instruction body |

**Rules:**
- Custom Code nodes use the same connection pattern as Logic nodes.
- They are treated as logic operations in the instruction body.

---

### Account -> Constraint

| Source Handle | Target Handle | Description |
|---------------|---------------|-------------|
| `constraint-out` (right) | `constraint-in` (left) | This constraint applies to the account |

**Rules:**
- An Account can connect to multiple Constraint nodes.
- Each constraint adds a validation rule.
- Constraints are merged: if both a flag (e.g., `isMut`) and a constraint node of the same type exist, the explicit constraint node takes precedence.

---

### Account -> State

| Source Handle | Target Handle | Description |
|---------------|---------------|-------------|
| `data-in` (left) | `data-out` (right) | This account stores this state struct |

**Rules:**
- An Account connects to at most one State node.
- A State node can connect to multiple Account nodes (the same struct used by different instructions).
- The State node's name becomes the `stateType` on the Account, determining the Rust type for the account.

---

### Logic -> Logic (chaining)

| Source Handle | Target Handle | Description |
|---------------|---------------|-------------|
| `logic-out` (bottom) | `logic-in` (top) | Sequential execution in the instruction body |

**Rules:**
- Logic nodes chain vertically to define execution order.
- The `order` property on each logic node determines final sequencing.
- All logic nodes connected to an Instruction (directly or through chains) are collected and sorted by `order`.

---

### Logic -> Logic (if-else branching)

| Source Handle | Target Handle | Description |
|---------------|---------------|-------------|
| `logic-out` (bottom, default) | `logic-in` (top) | Child logic for the "then" branch |
| `else-out` (bottom, variant) | `logic-in` (top) | Child logic for the "else" branch |

**Rules:**
- Only `if-else` logic nodes have branch handles.
- Children connected to the default bottom handle form the "then" body.
- Children connected to the "else-out" handle form the "else" body.
- Child logic can nest: an if-else child can contain its own if-else.

---

### Integration -> Account

| Source Handle | Target Handle | Description |
|---------------|---------------|-------------|
| `account-out` (bottom) | `account-in` (top) | Plugin integration modifies this account |

---

## Complete Connection Matrix

| From (source) | To (target) | Handle Pair | Purpose |
|---------------|-------------|-------------|---------|
| Program | Instruction | instruction-out -> instruction-in | Program contains this instruction |
| Instruction | Account | account-out -> account-in | Instruction operates on this account |
| Instruction | Logic | logic-out -> logic-in | Instruction executes this logic |
| Instruction | Custom Code | logic-out -> logic-in | Instruction executes this custom code |
| Instruction | Error | error-out -> error-in | Instruction references this error |
| Instruction | Event | event-out -> event-in | Instruction can emit this event |
| Instruction | Integration | logic-in <- logic-out | Plugin attaches to instruction |
| Account | Constraint | constraint-out -> constraint-in | Constraint validates this account |
| State | Account | data-out -> data-in | Account stores this state struct |
| Logic | Logic | logic-out -> logic-in | Sequential chaining |
| Logic (if-else) | Logic (then) | logic-out -> logic-in | Then branch body |
| Logic (if-else) | Logic (else) | else-out -> logic-in | Else branch body |
| Custom Code | Logic | logic-out -> logic-in | Chaining after custom code |
| Integration | Account | account-out -> account-in | Plugin modifies account |

---

## Invalid Connections

The following connections are **not allowed**:

| Attempted Connection | Reason |
|---------------------|--------|
| Program -> Account | Accounts must be connected to Instructions, not directly to Programs |
| Program -> Logic | Logic must be connected to Instructions |
| Program -> State | States connect to Accounts, not Programs |
| Constraint -> Constraint | Constraints attach to Accounts only |
| Constraint -> Instruction | Constraints are one-way: Account <- Constraint |
| Error -> Instruction | Errors are referenced, not invoked |
| Event -> Instruction | Events are emitted, not invoked |
| State -> Instruction | States connect to Accounts only |
| State -> State | States are independent definitions |
| Error -> Error | Errors are independent definitions |
| Event -> Event | Events are independent definitions |

---

## Handle Reference by Node Type

### Program Node

| Handle ID | Position | Direction | Connects To |
|-----------|----------|-----------|-------------|
| `instruction-out` | Bottom | Output | Instruction |

### Instruction Node

| Handle ID | Position | Direction | Connects To |
|-----------|----------|-----------|-------------|
| `instruction-in` | Top | Input | Program |
| `account-out` | Right | Output | Account |
| `logic-out` | Bottom | Output | Logic, Custom Code |
| `error-out` | Left (top) | Output | Error |
| `event-out` | Left (bottom) | Output | Event |

### Account Node

| Handle ID | Position | Direction | Connects To |
|-----------|----------|-----------|-------------|
| `account-in` | Top | Input | Instruction, Integration |
| `constraint-out` | Right | Output | Constraint |
| `data-in` | Left | Input | State |

### State Node

| Handle ID | Position | Direction | Connects To |
|-----------|----------|-----------|-------------|
| `data-out` | Right | Output | Account |

### Constraint Node

| Handle ID | Position | Direction | Connects To |
|-----------|----------|-----------|-------------|
| `constraint-in` | Left | Input | Account |

### Logic Node

| Handle ID | Position | Direction | Connects To |
|-----------|----------|-----------|-------------|
| `logic-in` | Top | Input | Instruction, Logic |
| `logic-out` | Bottom | Output | Logic |
| `account-out` | Right | Output | (reference to accounts) |

### If-Else Logic Node (additional handles)

| Handle ID | Position | Direction | Connects To |
|-----------|----------|-----------|-------------|
| `else-out` | Bottom (variant) | Output | Logic (else branch) |

### Error Node

| Handle ID | Position | Direction | Connects To |
|-----------|----------|-----------|-------------|
| `error-in` | Left | Input | Instruction |

### Event Node

| Handle ID | Position | Direction | Connects To |
|-----------|----------|-----------|-------------|
| `event-in` | Left | Input | Instruction |

### Custom Code Node

| Handle ID | Position | Direction | Connects To |
|-----------|----------|-----------|-------------|
| `logic-in` | Top | Input | Instruction, Logic |
| `logic-out` | Bottom | Output | Logic |
| `data-in` | Left | Input | (variable bindings) |
| `data-out` | Right | Output | (variable bindings) |

### Integration Node

| Handle ID | Position | Direction | Connects To |
|-----------|----------|-----------|-------------|
| `logic-in` | Top | Input | Instruction |
| `account-out` | Bottom | Output | Account |

---

## Common Patterns

### Pattern: Initialize a Data Account

```
Program
  |
  v
Instruction (initialize)
  |---> Account (payer) [signer, mut]
  |---> Account (new_account) [init, payer=payer, space=auto]
  |       <--- State (MyData { authority, value })
  |---> Account (system_program)
  |---> Logic (set-field: new_account.authority = payer.key())
```

### Pattern: Token Transfer with PDA Authority

```
Program
  |
  v
Instruction (transfer)
  |---> Account (vault) [seeds=[b"vault"], bump]
  |---> Account (from_token) [token-account]
  |---> Account (to_token) [token-account]
  |---> Account (token_program)
  |---> Logic (transfer-token: from=from_token, to=to_token, authority=vault, signerSeeds=...)
```

### Pattern: Conditional Logic

```
Program
  |
  v
Instruction (process)
  |---> Account (data) [mut, account]
  |---> Logic (if-else: condition = data.value > 0)
  |       |---> Logic (set-field: data.status = "active")    [then branch]
  |       |---> Logic (return-error: errorCode=InvalidValue)  [else branch]
```
