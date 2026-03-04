import fs from "node:fs/promises";
import path from "node:path";
import { chromium, Browser, BrowserContext, Page } from "playwright";
import { ToolContext, ToolResult } from "../types";
import { isPathAllowed } from "../policy/loadPolicy";

interface BrowserSession {
  context: BrowserContext;
  page: Page;
}

class BrowserManager {
  private browser: Browser | null = null;
  private sessions = new Map<string, BrowserSession>();

  async getSession(sessionId: string): Promise<BrowserSession> {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
    const context = await this.browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const session = { context, page };
    this.sessions.set(sessionId, session);
    return session;
  }

  async closeAll(): Promise<void> {
    for (const session of this.sessions.values()) {
      await session.context.close();
    }
    this.sessions.clear();
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

const browserManager = new BrowserManager();

export async function browserOpen(args: Record<string, unknown>): Promise<ToolResult> {
  const sessionId = String(args.session_id ?? "default");
  const url = String(args.url ?? "");
  if (!url) {
    throw new Error("browser.open requires args.url");
  }
  const session = await browserManager.getSession(sessionId);
  await session.page.goto(url, { waitUntil: "domcontentloaded" });
  const title = await session.page.title();
  return { stdout: `Opened ${url}`, data: { title } };
}

export async function browserClick(args: Record<string, unknown>): Promise<ToolResult> {
  const sessionId = String(args.session_id ?? "default");
  const selector = String(args.selector ?? "");
  if (!selector) {
    throw new Error("browser.click requires args.selector");
  }
  const session = await browserManager.getSession(sessionId);
  await session.page.click(selector);
  return { stdout: `Clicked selector ${selector}` };
}

export async function browserType(args: Record<string, unknown>): Promise<ToolResult> {
  const sessionId = String(args.session_id ?? "default");
  const selector = String(args.selector ?? "");
  const text = String(args.text ?? "");
  const clear = Boolean(args.clear ?? true);
  if (!selector) {
    throw new Error("browser.type requires args.selector");
  }
  const session = await browserManager.getSession(sessionId);
  if (clear) {
    await session.page.fill(selector, "");
  }
  await session.page.fill(selector, text);
  return { stdout: `Typed into selector ${selector}` };
}

export async function browserDownload(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const sessionId = String(args.session_id ?? "default");
  const selector = String(args.selector ?? "");
  const saveAsRaw = typeof args.save_as === "string" ? args.save_as : "";
  if (!selector) {
    throw new Error("browser.download requires args.selector");
  }

  const session = await browserManager.getSession(sessionId);
  const [download] = await Promise.all([session.page.waitForEvent("download"), session.page.click(selector)]);

  const defaultName = download.suggestedFilename() || `download-${Date.now()}.bin`;
  const resolvedPath = saveAsRaw
    ? path.resolve(ctx.projectRoot, saveAsRaw)
    : path.resolve(ctx.tempRoot, defaultName);

  if (!isPathAllowed(resolvedPath, ctx.policy)) {
    throw new Error(`Path is outside allowlist: ${resolvedPath}`);
  }

  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await download.saveAs(resolvedPath);

  return {
    stdout: `Downloaded artifact to ${resolvedPath}`,
    artifacts: [{ path: resolvedPath, description: "Browser download artifact", sha256: null }]
  };
}

export async function closeBrowserSessions(): Promise<void> {
  await browserManager.closeAll();
}

