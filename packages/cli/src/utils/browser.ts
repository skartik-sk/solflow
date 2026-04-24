// Browser — open URL in default browser.

import { execFile, spawn } from "child_process";

/**
 * Open a URL in the user's default browser.
 */
export function openBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Browser open timed out")), 5000);

    const onResolve = () => { clearTimeout(timer); resolve(); };
    const onReject = (err: Error) => { clearTimeout(timer); reject(err); };

    if (process.platform === "win32") {
      const child = spawn("cmd", ["/c", "start", '""', url], { stdio: "ignore" });
      child.on("error", onReject);
      child.on("close", (code) => code === 0 ? onResolve() : onReject(new Error(`Browser exited with code ${code}`)));
    } else {
      const command = process.platform === "darwin" ? "open" : "xdg-open";
      execFile(command, [url], (err) => {
        if (err) onReject(err);
        else onResolve();
      });
    }
  });
}
