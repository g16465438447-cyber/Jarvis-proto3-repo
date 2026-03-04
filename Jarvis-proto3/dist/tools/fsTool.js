"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fsList = fsList;
exports.fsSearch = fsSearch;
exports.fsMove = fsMove;
exports.fsRename = fsRename;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const loadPolicy_1 = require("../policy/loadPolicy");
async function collectEntries(targetPath, recursive) {
    const entries = await promises_1.default.readdir(targetPath, { withFileTypes: true });
    const output = [];
    for (const entry of entries) {
        const fullPath = node_path_1.default.join(targetPath, entry.name);
        output.push(fullPath);
        if (recursive && entry.isDirectory()) {
            output.push(...(await collectEntries(fullPath, true)));
        }
    }
    return output;
}
function assertPathAllowed(targetPath, ctx) {
    if (!(0, loadPolicy_1.isPathAllowed)(targetPath, ctx.policy)) {
        throw new Error(`Path is outside allowlist: ${targetPath}`);
    }
}
async function fsList(args, ctx) {
    const targetPath = String(args.path ?? "");
    const recursive = Boolean(args.recursive ?? false);
    if (!targetPath) {
        throw new Error("fs.list requires args.path");
    }
    assertPathAllowed(targetPath, ctx);
    const entries = await collectEntries(targetPath, recursive);
    return {
        stdout: entries.join("\n"),
        data: { count: entries.length, entries }
    };
}
async function fsSearch(args, ctx) {
    const targetPath = String(args.path ?? "");
    const pattern = String(args.pattern ?? "");
    const recursive = Boolean(args.recursive ?? true);
    if (!targetPath || !pattern) {
        throw new Error("fs.search requires args.path and args.pattern");
    }
    assertPathAllowed(targetPath, ctx);
    const entries = await collectEntries(targetPath, recursive);
    const normalizedPattern = pattern.toLowerCase();
    const matches = entries.filter((item) => node_path_1.default.basename(item).toLowerCase().includes(normalizedPattern));
    return {
        stdout: matches.join("\n"),
        data: { count: matches.length, matches }
    };
}
async function fsMove(args, ctx) {
    const source = String(args.source ?? "");
    const destination = String(args.destination ?? "");
    if (!source || !destination) {
        throw new Error("fs.move requires args.source and args.destination");
    }
    assertPathAllowed(source, ctx);
    assertPathAllowed(destination, ctx);
    await promises_1.default.mkdir(node_path_1.default.dirname(destination), { recursive: true });
    await promises_1.default.rename(source, destination);
    return {
        stdout: `Moved ${source} -> ${destination}`,
        artifacts: [{ path: destination, description: "Moved file/folder", sha256: null }]
    };
}
async function fsRename(args, ctx) {
    const targetPath = String(args.path ?? "");
    const newName = String(args.new_name ?? "");
    if (!targetPath || !newName) {
        throw new Error("fs.rename requires args.path and args.new_name");
    }
    assertPathAllowed(targetPath, ctx);
    const destination = node_path_1.default.join(node_path_1.default.dirname(targetPath), newName);
    assertPathAllowed(destination, ctx);
    await promises_1.default.rename(targetPath, destination);
    return {
        stdout: `Renamed ${targetPath} -> ${destination}`,
        artifacts: [{ path: destination, description: "Renamed file/folder", sha256: null }]
    };
}
