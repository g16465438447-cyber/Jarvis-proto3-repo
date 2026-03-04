import { Action, ToolContext, ToolHandler, ToolResult } from "../types";
import { fsList, fsMove, fsRename, fsSearch } from "./fsTool";
import { processStart } from "./processTool";
import { shellRun } from "./shellTool";
import { browserClick, browserDownload, browserOpen, browserType, closeBrowserSessions } from "./browserTool";

const notImplemented = (actionType: string): ToolHandler => {
  return async () => {
    throw new Error(`Action type not implemented in MVP scaffold: ${actionType}`);
  };
};

const handlers: Record<string, ToolHandler> = {
  "fs.list": fsList,
  "fs.search": fsSearch,
  "fs.move": fsMove,
  "fs.rename": fsRename,
  "process.start": processStart,
  "process.stop": notImplemented("process.stop"),
  "window.focus": notImplemented("window.focus"),
  "window.screenshot": notImplemented("window.screenshot"),
  "browser.open": browserOpen,
  "browser.click": browserClick,
  "browser.type": browserType,
  "browser.download": browserDownload,
  "shell.run": shellRun,
  "extract.text": notImplemented("extract.text"),
  "extract.table": notImplemented("extract.table")
};

export async function executeAction(action: Action, ctx: ToolContext): Promise<ToolResult> {
  const handler = handlers[action.type];
  if (!handler) {
    throw new Error(`No handler for action type: ${action.type}`);
  }
  return handler(action.args, ctx);
}

export async function shutdownTools(): Promise<void> {
  await closeBrowserSessions();
}

