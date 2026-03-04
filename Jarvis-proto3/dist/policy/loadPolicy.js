"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPolicy = loadPolicy;
exports.isPathAllowed = isPathAllowed;
exports.isCommandAllowed = isCommandAllowed;
exports.isAppAllowed = isAppAllowed;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const utils_1 = require("../utils");
const POLICY_PATH = node_path_1.default.resolve(process.cwd(), "config", "policy.json");
function loadPolicy(projectRoot) {
    const raw = node_fs_1.default.readFileSync(POLICY_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return {
        ...parsed,
        allowed_paths: parsed.allowed_paths.map((value) => node_path_1.default.normalize((0, utils_1.expandPathTemplate)(value, projectRoot)))
    };
}
function isPathAllowed(targetPath, policy) {
    if (policy.allowed_paths.includes("*")) {
        return true;
    }
    const normalizedTarget = node_path_1.default.normalize(targetPath).toLowerCase();
    return policy.allowed_paths.some((allowed) => {
        const normalizedAllowed = node_path_1.default.normalize(allowed).toLowerCase();
        return normalizedTarget === normalizedAllowed || normalizedTarget.startsWith(`${normalizedAllowed}${node_path_1.default.sep}`);
    });
}
function isCommandAllowed(command, policy) {
    if (policy.allowed_shell_commands.includes("*")) {
        return true;
    }
    return policy.allowed_shell_commands.some((allowed) => allowed.toLowerCase() === command.toLowerCase());
}
function isAppAllowed(command, policy) {
    if (policy.allowed_apps.includes("*")) {
        return true;
    }
    const normalized = node_path_1.default.basename(command).toLowerCase();
    return policy.allowed_apps.some((allowed) => allowed.toLowerCase() === normalized);
}
