"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shellRun = shellRun;
const node_child_process_1 = require("node:child_process");
const loadPolicy_1 = require("../policy/loadPolicy");
function quoteArg(value) {
    const escaped = value.replace(/'/g, "''");
    return `'${escaped}'`;
}
function renderArg(value) {
    if (/^-[a-z0-9]/i.test(value)) {
        // Keep parameter switches unquoted so PowerShell binds named parameters correctly.
        return value;
    }
    return quoteArg(value);
}
async function shellRun(args, ctx) {
    const command = String(args.command ?? "");
    const commandArgs = Array.isArray(args.args) ? args.args.map((item) => String(item)) : [];
    if (!command) {
        throw new Error("shell.run requires args.command");
    }
    if (!(0, loadPolicy_1.isCommandAllowed)(command, ctx.policy)) {
        throw new Error(`Shell command is not allowlisted: ${command}`);
    }
    const expression = `& ${command} ${commandArgs.map(renderArg).join(" ")}`.trim();
    const child = (0, node_child_process_1.spawn)("pwsh", ["-NoProfile", "-Command", expression], {
        cwd: ctx.projectRoot,
        windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    await new Promise((resolve, reject) => {
        child.stdout.on("data", (chunk) => {
            stdout += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
            stderr += String(chunk);
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) {
                resolve();
            }
            else {
                reject(new Error(`PowerShell exited with code ${code}: ${stderr}`));
            }
        });
    });
    return {
        stdout: stdout.trim(),
        stderr: stderr.trim()
    };
}
