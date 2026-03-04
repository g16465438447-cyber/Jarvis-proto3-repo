import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { browserClick, browserDownload, browserOpen, browserType, closeBrowserSessions } from "../src/tools/browserTool";
import { cleanupSandbox, makePolicy, makeSandbox, makeToolContext } from "./helpers";

afterAll(async () => {
  await closeBrowserSessions();
});

describe("browser tools", () => {
  test(
    "browser.open, browser.type, browser.click, and browser.download succeed",
    async () => {
      const sandbox = await makeSandbox();
      try {
        const policy = makePolicy({ allowed_paths: [process.cwd(), sandbox] });
        const ctx = makeToolContext(policy, sandbox);
        const sessionId = "browser-tool-suite";

        const interactiveHtml = encodeURIComponent(
          "<html><body><input id='name' /><button id='go' onclick=\"document.body.setAttribute('data-clicked','1')\">Go</button></body></html>"
        );
        await browserOpen({ session_id: sessionId, url: `data:text/html,${interactiveHtml}` });
        await browserType({ session_id: sessionId, selector: "#name", text: "hello" });
        await browserClick({ session_id: sessionId, selector: "#go" });

        const downloadHtml = encodeURIComponent(
          "<html><body><a id='dl' href='data:text/plain;base64,aGVsbG8=' download='sample.txt'>download</a></body></html>"
        );
        await browserOpen({ session_id: sessionId, url: `data:text/html,${downloadHtml}` });
        const savePath = path.join(sandbox, "download.txt");
        const saveAsRelative = path.relative(process.cwd(), savePath);
        const result = await browserDownload(
          { session_id: sessionId, selector: "#dl", save_as: saveAsRelative },
          ctx
        );

        await expect(fs.access(savePath)).resolves.toBeUndefined();
        expect(result.artifacts?.[0].path).toBe(savePath);
      } finally {
        await cleanupSandbox(sandbox);
      }
    },
    60000
  );

  test(
    "browser.download blocks disallowed output path",
    async () => {
      const sandbox = await makeSandbox();
      try {
        const policy = makePolicy({ allowed_paths: [sandbox] });
        const ctx = makeToolContext(policy, sandbox);
        const sessionId = "browser-tool-disallow";

        const downloadHtml = encodeURIComponent(
          "<html><body><a id='dl' href='data:text/plain;base64,aGVsbG8=' download='sample.txt'>download</a></body></html>"
        );
        await browserOpen({ session_id: sessionId, url: `data:text/html,${downloadHtml}` });
        const disallowedPath = path.join(path.parse(sandbox).root, "not-allowed-download.txt");
        await expect(
          browserDownload({ session_id: sessionId, selector: "#dl", save_as: disallowedPath }, ctx)
        ).rejects.toThrow("outside allowlist");
      } finally {
        await cleanupSandbox(sandbox);
      }
    },
    60000
  );
});

