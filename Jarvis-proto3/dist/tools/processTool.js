"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processStart = processStart;
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const loadPolicy_1 = require("../policy/loadPolicy");
async function processStart(args, ctx) {
    const command = String(args.command ?? "");
    const rawArgs = Array.isArray(args.args) ? args.args.map((item) => String(item)) : [];
    const cwd = typeof args.cwd === "string" ? args.cwd : ctx.projectRoot;
    if (!command) {
        throw new Error("process.start requires args.command");
    }
    if (!(0, loadPolicy_1.isAppAllowed)(node_path_1.default.basename(command), ctx.policy)) {
        throw new Error(`Application is not allowlisted: ${command}`);
    }
    const child = (0, node_child_process_1.spawn)(command, rawArgs, {
        cwd,
        detached: true,
        windowsHide: true,
        stdio: "ignore"
    });
    child.unref();
    return {
        stdout: `Started process ${command} (pid=${child.pid ?? "unknown"})`,
        data: { pid: child.pid ?? null }
    };
}
