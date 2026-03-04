"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.browserOpen = browserOpen;
exports.browserClick = browserClick;
exports.browserType = browserType;
exports.browserDownload = browserDownload;
exports.closeBrowserSessions = closeBrowserSessions;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const playwright_1 = require("playwright");
const loadPolicy_1 = require("../policy/loadPolicy");
class BrowserManager {
    browser = null;
    sessions = new Map();
    async getSession(sessionId) {
        if (this.sessions.has(sessionId)) {
            return this.sessions.get(sessionId);
        }
        if (!this.browser) {
            this.browser = await playwright_1.chromium.launch({ headless: true });
        }
        const context = await this.browser.newContext({ acceptDownloads: true });
        const page = await context.newPage();
        const session = { context, page };
        this.sessions.set(sessionId, session);
        return session;
    }
    async closeAll() {
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
async function browserOpen(args) {
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
async function browserClick(args) {
    const sessionId = String(args.session_id ?? "default");
    const selector = String(args.selector ?? "");
    if (!selector) {
        throw new Error("browser.click requires args.selector");
    }
    const session = await browserManager.getSession(sessionId);
    await session.page.click(selector);
    return { stdout: `Clicked selector ${selector}` };
}
async function browserType(args) {
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
async function browserDownload(args, ctx) {
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
        ? node_path_1.default.resolve(ctx.projectRoot, saveAsRaw)
        : node_path_1.default.resolve(ctx.tempRoot, defaultName);
    if (!(0, loadPolicy_1.isPathAllowed)(resolvedPath, ctx.policy)) {
        throw new Error(`Path is outside allowlist: ${resolvedPath}`);
    }
    await promises_1.default.mkdir(node_path_1.default.dirname(resolvedPath), { recursive: true });
    await download.saveAs(resolvedPath);
    return {
        stdout: `Downloaded artifact to ${resolvedPath}`,
        artifacts: [{ path: resolvedPath, description: "Browser download artifact", sha256: null }]
    };
}
async function closeBrowserSessions() {
    await browserManager.closeAll();
}
