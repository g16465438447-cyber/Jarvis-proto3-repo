import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020";
import type { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { Plan, RunLog } from "../types";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

function loadSchema(schemaFile: string): object {
  const schemaPath = path.resolve(process.cwd(), "schemas", schemaFile);
  const raw = fs.readFileSync(schemaPath, "utf-8");
  return JSON.parse(raw) as object;
}

const planValidator: ValidateFunction<Plan> = ajv.compile<Plan>(loadSchema("plan.schema.json"));
const runlogValidator: ValidateFunction<RunLog> = ajv.compile<RunLog>(loadSchema("runlog.schema.json"));

export function validatePlan(plan: unknown): { ok: true } | { ok: false; errors: string[] } {
  const valid = planValidator(plan);
  if (valid) {
    return { ok: true };
  }
  const errors = (planValidator.errors ?? []).map((err) => `${err.instancePath || "/"} ${err.message ?? "invalid"}`);
  return { ok: false, errors };
}

export function validateRunLog(runlog: unknown): { ok: true } | { ok: false; errors: string[] } {
  const valid = runlogValidator(runlog);
  if (valid) {
    return { ok: true };
  }
  const errors = (runlogValidator.errors ?? []).map((err) => `${err.instancePath || "/"} ${err.message ?? "invalid"}`);
  return { ok: false, errors };
}
