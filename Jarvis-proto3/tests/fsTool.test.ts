import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { fsList, fsMove, fsRename, fsSearch } from "../src/tools/fsTool";
import { cleanupSandbox, makePolicy, makeSandbox, makeToolContext } from "./helpers";

describe("fs tools", () => {
  test("fs.list and fs.search return expected entries", async () => {
    const sandbox = await makeSandbox();
    try {
      const nested = path.join(sandbox, "nested");
      await fs.mkdir(nested, { recursive: true });
      await fs.writeFile(path.join(sandbox, "alpha.txt"), "a", "utf-8");
      await fs.writeFile(path.join(nested, "beta.txt"), "b", "utf-8");

      const policy = makePolicy({ allowed_paths: [sandbox] });
      const ctx = makeToolContext(policy, sandbox);

      const listed = await fsList({ path: sandbox, recursive: true }, ctx);
      const listData = listed.data as { entries: string[] };
      expect(listData.entries.some((item) => item.endsWith("alpha.txt"))).toBe(true);
      expect(listData.entries.some((item) => item.endsWith("beta.txt"))).toBe(true);

      const searched = await fsSearch({ path: sandbox, pattern: "beta", recursive: true }, ctx);
      const searchData = searched.data as { matches: string[] };
      expect(searchData.matches).toHaveLength(1);
      expect(searchData.matches[0]).toContain("beta.txt");
    } finally {
      await cleanupSandbox(sandbox);
    }
  });

  test("fs.move and fs.rename update file paths", async () => {
    const sandbox = await makeSandbox();
    try {
      const src = path.join(sandbox, "source.txt");
      const moved = path.join(sandbox, "moved.txt");
      await fs.writeFile(src, "hello", "utf-8");

      const policy = makePolicy({ allowed_paths: [sandbox] });
      const ctx = makeToolContext(policy, sandbox);

      await fsMove({ source: src, destination: moved }, ctx);
      await expect(fs.access(moved)).resolves.toBeUndefined();
      await expect(fs.access(src)).rejects.toThrow();

      const renamedName = "renamed.txt";
      const renamed = path.join(sandbox, renamedName);
      await fsRename({ path: moved, new_name: renamedName }, ctx);
      await expect(fs.access(renamed)).resolves.toBeUndefined();
      await expect(fs.access(moved)).rejects.toThrow();
    } finally {
      await cleanupSandbox(sandbox);
    }
  });

  test("rejects operations outside allowed paths", async () => {
    const sandbox = await makeSandbox();
    try {
      const denied = path.join(path.parse(sandbox).root, "denied.txt");
      const policy = makePolicy({ allowed_paths: [sandbox] });
      const ctx = makeToolContext(policy, sandbox);

      await expect(fsList({ path: denied }, ctx)).rejects.toThrow("outside allowlist");
    } finally {
      await cleanupSandbox(sandbox);
    }
  });
});

