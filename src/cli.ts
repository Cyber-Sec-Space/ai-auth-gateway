#!/usr/bin/env node

import { Command } from "commander";
import { registerKeychainCommand } from "./commands/keychain.js";
import { registerSystemConfigCommand } from "./commands/config.js";
import { registerAiCommand } from "./commands/ai.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerDaemonCommands } from "./commands/daemon.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if running as root/sudo
if (process.getuid && process.getuid() !== 0) {
  console.error("\x1b[31m[Error] This command requires root privileges. Please run with 'sudo'.\x1b[0m");
  process.exit(1);
}

const program = new Command();

program
  .name("aagcli")
  .description("Multi-functional CLI for AI Auth Gateway")
  .version("1.0.0");

registerKeychainCommand(program);
registerAiCommand(program);
registerMcpCommand(program);
registerSystemConfigCommand(program);
registerDaemonCommands(program);

program
  .command("stdio-path")
  .description("Get the absolute path to the compiled stdio.js proxy script for local AI clients")
  .action(() => {
    const stdioPath = path.join(__dirname, "stdio.js");
    console.log(stdioPath);
  });

program.parseAsync(process.argv).catch(err => {
  console.error(err);
  process.exit(1);
});
