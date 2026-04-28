#!/usr/bin/env bun
// @solflow/cli — SolStudio CLI entry point

import { Command } from "commander";
import { parseCommand } from "./commands/parse";
import { idlCommand } from "./commands/idl";
import { viewCommand } from "./commands/view";
import { initCommand } from "./commands/init";
import { auditCommand } from "./commands/audit";
import { testCommand } from "./commands/test";
import { doctorCommand } from "./commands/doctor";
import { ciCommand } from "./commands/ci";
import { patchCommand } from "./commands/patch";

const program = new Command();

program
  .name("solstudio")
  .description("Visualize any Solana codebase locally")
  .version("0.1.2");

program.addCommand(parseCommand);
program.addCommand(idlCommand);
program.addCommand(viewCommand);
program.addCommand(initCommand);
program.addCommand(auditCommand);
program.addCommand(testCommand);
program.addCommand(doctorCommand);
program.addCommand(ciCommand);
program.addCommand(patchCommand);

program.parse();
