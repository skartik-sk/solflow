import { flowToIR } from "@solflow/ir";
const flow = {
  nodes: [
    { id: "program-1", type: "program", position: { x: 300, y: 50 }, data: { name: "my_program", version: "0.1.0", description: "", license: "", programId: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS" } },
    { id: "instruction-1", type: "instruction", position: { x: 300, y: 220 }, data: { name: "initialize", description: "", args: [], accessControl: "none" } },
    { id: "account-1", type: "account", position: { x: 120, y: 420 }, data: { name: "state_account", accountType: "account", isMut: true, isSigner: false, isInit: true, isClose: false } },
    { id: "authority-1", type: "account", position: { x: 300, y: 420 }, data: { name: "authority", accountType: "signer", isMut: false, isSigner: true, isInit: false, isClose: false } },
    { id: "sys-1", type: "account", position: { x: 480, y: 420 }, data: { name: "system_program", accountType: "system-program", isMut: false, isSigner: false, isInit: false, isClose: false } },
    { id: "state-1", type: "state", position: { x: 120, y: 600 }, data: { name: "ProgramState", fields: [{ name: "authority", type: "Pubkey" }, { name: "count", type: "u64" }], isZeroCopy: false } },
    { id: "logic-1", type: "logic", position: { x: 300, y: 340 }, data: { logicType: "set-field", order: 0, operation: { type: "set-field", account: "state_account", field: "count", value: "0" } } },
  ],
  edges: [
    { id: "e1", source: "program-1", target: "instruction-1", sourceHandle: "instruction-out", targetHandle: "instruction-in", type: "smoothstep", animated: true },
    { id: "e2", source: "instruction-1", target: "account-1", sourceHandle: "account-out", targetHandle: "account-in", type: "smoothstep", animated: true },
    { id: "e3", source: "instruction-1", target: "authority-1", sourceHandle: "account-out", targetHandle: "account-in", type: "smoothstep", animated: true },
    { id: "e4", source: "instruction-1", target: "sys-1", sourceHandle: "account-out", targetHandle: "account-in", type: "smoothstep", animated: true },
    { id: "e5", source: "instruction-1", target: "logic-1", sourceHandle: "logic-out", targetHandle: "logic-in", type: "smoothstep", animated: true },
    { id: "e6", source: "state-1", target: "account-1", sourceHandle: "data-out", targetHandle: "data-in", type: "smoothstep", animated: true },
  ],
};
const ir = flowToIR(flow.nodes as any, flow.edges as any);
console.log(JSON.stringify(ir, null, 2));
