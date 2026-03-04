"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeAction = executeAction;
exports.shutdownTools = shutdownTools;
const fsTool_1 = require("./fsTool");
const processTool_1 = require("./processTool");
const shellTool_1 = require("./shellTool");
const browserTool_1 = require("./browserTool");
const notImplemented = (actionType) => {
    return async () => {
        throw new Error(`Action type not implemented in MVP scaffold: ${actionType}`);
    };
};
const handlers = {
    "fs.list": fsTool_1.fsList,
    "fs.search": fsTool_1.fsSearch,
    "fs.move": fsTool_1.fsMove,
    "fs.rename": fsTool_1.fsRename,
    "process.start": processTool_1.processStart,
    "process.stop": notImplemented("process.stop"),
    "window.focus": notImplemented("window.focus"),
    "window.screenshot": notImplemented("window.screenshot"),
    "browser.open": browserTool_1.browserOpen,
    "browser.click": browserTool_1.browserClick,
    "browser.type": browserTool_1.browserType,
    "browser.download": browserTool_1.browserDownload,
    "shell.run": shellTool_1.shellRun,
    "extract.text": notImplemented("extract.text"),
    "extract.table": notImplemented("extract.table")
};
async function executeAction(action, ctx) {
    const handler = handlers[action.type];
    if (!handler) {
        throw new Error(`No handler for action type: ${action.type}`);
    }
    return handler(action.args, ctx);
}
async function shutdownTools() {
    await (0, browserTool_1.closeBrowserSessions)();
}
