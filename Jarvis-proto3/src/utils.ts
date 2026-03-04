import path from "node:path";
import crypto from "node:crypto";

export function nowUtcIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

export function expandPathTemplate(input: string, projectRoot: string): string {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  return input
    .replaceAll("${PROJECT_ROOT}", projectRoot)
    .replaceAll("${USER_HOME}", home);
}

export function toAbsolutePath(value: string, projectRoot: string): string {
  if (path.isAbsolute(value)) {
    return path.normalize(value);
  }
  return path.normalize(path.resolve(projectRoot, value));
}

export function includesSecret(text: string): boolean {
  const patterns = [
    /api[_-]?key/i,
    /bearer\s+[a-z0-9\-_\.]+/i,
    /password/i,
    /token/i
  ];
  return patterns.some((pattern) => pattern.test(text));
}

export function redactSecrets(text: string): string {
  let output = text;
  output = output.replace(/(api[_-]?key\s*[=:]\s*)([^\s]+)/gi, "$1[REDACTED]");
  output = output.replace(/(password\s*[=:]\s*)([^\s]+)/gi, "$1[REDACTED]");
  output = output.replace(/(token\s*[=:]\s*)([^\s]+)/gi, "$1[REDACTED]");
  output = output.replace(/(bearer\s+)([a-z0-9\-_\.]+)/gi, "$1[REDACTED]");
  return output;
}

