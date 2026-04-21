// Browser — open URL in default browser.

import { execFile, spawn } from "child_process";

/**
 * Open a URL in the user's default browser.
 */
export function openBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.platform === "win32") {
      // `start` is a CMD shell builtin — spawn with shell:true
      const child = spawn("cmd", ["/c", "start", '""', url], { stdio: "ignore" });
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`exit code ${code}`)));
    } else {
      const command = process.platform === "darwin" ? "open" : "xdg-open";
      execFile(command, [url], (err) => {
        if (err) reject(err);
        else resolve();
      });
    }
  });
}
