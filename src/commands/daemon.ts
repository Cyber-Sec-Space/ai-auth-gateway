import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the root directory of the project
const ROOT_DIR = path.join(__dirname, "..", "..");
const PID_FILE = path.join(ROOT_DIR, "proxy.pid");
const LOG_DIR = path.join(ROOT_DIR, "logs");

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0); // 0 does not kill the process, it just checks for existence
    return true;
  } catch (e) {
    return false;
  }
}

export function registerDaemonCommands(program: Command) {
  const serverCmd = program
    .command("server")
    .description("Manage the background Proxy Gateway daemon for external HTTP/SSE clients");

  serverCmd
    .command("start")
    .description("Start the AI Auth Gateway server in the background")
    .action(() => {
      if (fs.existsSync(PID_FILE)) {
        const pidStr = fs.readFileSync(PID_FILE, "utf-8").trim();
        const pid = parseInt(pidStr, 10);
        if (!isNaN(pid) && isProcessRunning(pid)) {
          console.error(`❌ Gateway Server is already running in the background (PID: ${pid}).`);
          process.exit(1);
        } else {
          // PID file exists but process is dead
          console.warn(`⚠️  Found stale PID file. Removing it...`);
          fs.unlinkSync(PID_FILE);
        }
      }

      if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
      }

      const outLog = path.join(LOG_DIR, "daemon.out");
      const errLog = path.join(LOG_DIR, "daemon.err");

      const out = fs.openSync(outLog, "a");
      const err = fs.openSync(errLog, "a");

      const indexPath = path.join(__dirname, "..", "index.js");

      const child = spawn(process.execPath, [indexPath], {
        detached: true,
        stdio: ["ignore", out, err],
      });

      if (child.pid !== undefined && child.pid !== null) {
        fs.writeFileSync(PID_FILE, child.pid.toString());
        child.unref();
        console.log(`🚀 Gateway Server successfully started in the background (PID: ${child.pid}).`);
        console.log(`📡 URL: http://localhost:[Port]/sse (or /message)`);
        console.log(`📂 Output log: ${outLog}`);
        console.log(`📊 Check status with: aagcli server status`);
      } else {
        console.error("❌ Failed to start the background process.");
      }
    });

  serverCmd
    .command("stop")
    .description("Stop the background Gateway server daemon")
    .action(() => {
      if (!fs.existsSync(PID_FILE)) {
        console.log("ℹ️  AI Auth Gateway is not running.");
        return;
      }

      const pidStr = fs.readFileSync(PID_FILE, "utf-8").trim();
      const pid = parseInt(pidStr, 10);

      if (isNaN(pid)) {
        console.error("❌ Invalid PID file. Cleaning up...");
        fs.unlinkSync(PID_FILE);
        return;
      }

      if (isProcessRunning(pid)) {
        try {
          process.kill(pid, 15); // SIGTERM
          console.log(`🛑 Stopped Gateway Server process (PID: ${pid}).`);
        } catch (e: any) {
          console.error(`❌ Failed to kill process ${pid}: ${e.message}`);
        }
      } else {
        console.log(`ℹ️  Process ${pid} was already dead.`);
      }

      fs.unlinkSync(PID_FILE);
    });

  serverCmd
    .command("status")
    .description("Check the status of the background proxy server daemon")
    .action(() => {
      if (!fs.existsSync(PID_FILE)) {
        console.log("⚪ Status: INACTIVE (Gateway Server is not running)");
        return;
      }

      const pidStr = fs.readFileSync(PID_FILE, "utf-8").trim();
      const pid = parseInt(pidStr, 10);

      if (!isNaN(pid) && isProcessRunning(pid)) {
        console.log(`🟢 Status: ACTIVE (Running with PID: ${pid})`);
        console.log(`Logs located at: ${LOG_DIR}`);
      } else {
        console.log(`🔴 Status: CRASHED/STOPPED (Stale PID file found: ${pid})`);
      }
    });
}
