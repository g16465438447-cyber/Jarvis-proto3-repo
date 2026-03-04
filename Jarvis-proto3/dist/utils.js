"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nowUtcIso = nowUtcIso;
exports.newId = newId;
exports.expandPathTemplate = expandPathTemplate;
exports.toAbsolutePath = toAbsolutePath;
exports.includesSecret = includesSecret;
exports.redactSecrets = redactSecrets;
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
function nowUtcIso() {
    return new Date().toISOString();
}
function newId() {
    return node_crypto_1.default.randomUUID();
}
function expandPathTemplate(input, projectRoot) {
    const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
    return input
        .replaceAll("${PROJECT_ROOT}", projectRoot)
        .replaceAll("${USER_HOME}", home);
}
function toAbsolutePath(value, projectRoot) {
    if (node_path_1.default.isAbsolute(value)) {
        return node_path_1.default.normalize(value);
    }
    return node_path_1.default.normalize(node_path_1.default.resolve(projectRoot, value));
}
function includesSecret(text) {
    const patterns = [
        /api[_-]?key/i,
        /bearer\s+[a-z0-9\-_\.]+/i,
        /password/i,
        /token/i
    ];
    return patterns.some((pattern) => pattern.test(text));
}
function redactSecrets(text) {
    let output = text;
    output = output.replace(/(api[_-]?key\s*[=:]\s*)([^\s]+)/gi, "$1[REDACTED]");
    output = output.replace(/(password\s*[=:]\s*)([^\s]+)/gi, "$1[REDACTED]");
    output = output.replace(/(token\s*[=:]\s*)([^\s]+)/gi, "$1[REDACTED]");
    output = output.replace(/(bearer\s+)([a-z0-9\-_\.]+)/gi, "$1[REDACTED]");
    return output;
}
