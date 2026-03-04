import type {
  ExecuteOptions,
  ResourceStats,
  StreamEvent,
  TriggerInstallTaskOptions,
  TriggerProfile,
  TriggerRuntimeEvent,
  TriggerRuntimeInfo,
  TriggerRuntimeResult,
  UiPreferences
} from "../../shared/types";

declare global {
  interface Window {
    pilot: {
      preview: (request: string, options?: { sessionId?: string }) => Promise<unknown>;
      execute: (options: ExecuteOptions) => Promise<{ sessionId: string }>;
      abort: (runIdOrSessionId: string) => Promise<boolean>;
      getRun: (runId: string) => Promise<unknown>;
      onEvent: (listener: (event: StreamEvent) => void) => () => void;
    };
    ui: {
      getPreferences: () => Promise<UiPreferences>;
      setPreferences: (next: Partial<UiPreferences>) => Promise<UiPreferences>;
      getResourceStats: () => Promise<ResourceStats>;
    };
    trigger: {
      listProfiles: () => Promise<TriggerProfile[]>;
      saveProfile: (profile: TriggerProfile) => Promise<TriggerProfile[]>;
      deleteProfile: (profileId: string) => Promise<TriggerProfile[]>;
      start: (profileId: string) => Promise<TriggerRuntimeInfo>;
      stop: (profileId: string) => Promise<boolean>;
      listRunning: () => Promise<TriggerRuntimeInfo[]>;
      installTask: (options: TriggerInstallTaskOptions) => Promise<TriggerRuntimeResult>;
      onEvent: (listener: (event: TriggerRuntimeEvent) => void) => () => void;
    };
  }
}

export {};
