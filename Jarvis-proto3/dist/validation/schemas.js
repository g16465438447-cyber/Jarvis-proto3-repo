"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePlan = validatePlan;
exports.validateRunLog = validateRunLog;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const _2020_1 = __importDefault(require("ajv/dist/2020"));
const ajv_formats_1 = __importDefault(require("ajv-formats"));
const ajv = new _2020_1.default({ allErrors: true, strict: false });
(0, ajv_formats_1.default)(ajv);
function loadSchema(schemaFile) {
    const schemaPath = node_path_1.default.resolve(process.cwd(), "schemas", schemaFile);
    const raw = node_fs_1.default.readFileSync(schemaPath, "utf-8");
    return JSON.parse(raw);
}
const planValidator = ajv.compile(loadSchema("plan.schema.json"));
const runlogValidator = ajv.compile(loadSchema("runlog.schema.json"));
function validatePlan(plan) {
    const valid = planValidator(plan);
    if (valid) {
        return { ok: true };
    }
    const errors = (planValidator.errors ?? []).map((err) => `${err.instancePath || "/"} ${err.message ?? "invalid"}`);
    return { ok: false, errors };
}
function validateRunLog(runlog) {
    const valid = runlogValidator(runlog);
    if (valid) {
        return { ok: true };
    }
    const errors = (runlogValidator.errors ?? []).map((err) => `${err.instancePath || "/"} ${err.message ?? "invalid"}`);
    return { ok: false, errors };
}
