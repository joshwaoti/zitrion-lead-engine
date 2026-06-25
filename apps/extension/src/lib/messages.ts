import type {
  ApprovedAction,
  CommenterProfile,
  InboxMessage,
  InstagramProfileInsight,
  InstagramScrapeRequest,
  RawCandidate,
  WatchRule,
} from "@zitrion/core";

export type BackgroundMessage =
  | { type: "SCRAPE_FOR_RULE"; rule: WatchRule }
  | { type: "EXECUTE_ACTION"; action: ApprovedAction }
  | { type: "CHECK_THROTTLE" }
  | { type: "GET_PAGE_CONTEXT" }
  | { type: "SYNC_INBOX"; limit?: number }
  | { type: "RUN_IG_DISCOVERY"; postUrl?: string }
  | { type: "IG_SCRAPE_COMMENTERS"; postUrl?: string; limit: number }
  | { type: "IG_SCRAPE_FOLLOWERS"; profileUrl?: string; limit: number }
  | { type: "IG_ENRICH_PROFILE"; handle?: string };

export type ContentMessage =
  | { type: "DISCOVERY_RESULT"; candidates: RawCandidate[]; error?: string }
  | { type: "INBOX_SYNC_RESULT"; messages: InboxMessage[]; error?: string }
  | { type: "IG_DISCOVERY_RESULT"; commenters: CommenterProfile[]; postUrl: string }
  | {
      type: "IG_COMMENTERS_RESULT";
      commenters: CommenterProfile[];
      postUrl: string;
      error?: string;
    }
  | {
      type: "IG_FOLLOWERS_RESULT";
      followers: CommenterProfile[];
      profileUrl: string;
      error?: string;
    }
  | { type: "IG_ENRICH_RESULT"; insight: InstagramProfileInsight | null; error?: string }
  | { type: "ACTION_RESULT"; actionId: string; status: "done" | "failed"; permalink?: string; errorMessage?: string }
  | { type: "THROTTLE_DETECTED"; reason: string }
  | { type: "PAGE_CONTEXT"; loggedIn: boolean; url: string }
  | { type: "DISCOVERY_PROGRESS"; step: string }
  | { type: "ERROR"; message: string };

export type PopupMessage =
  | { type: "GET_STATUS" }
  | { type: "GET_IG_STATE" }
  | { type: "TOGGLE_KILL_SWITCH"; enabled: boolean }
  | { type: "TRIGGER_DISCOVERY" }
  | { type: "TRIGGER_INSTAGRAM_DISCOVERY" }
  | { type: "TRIGGER_INSTAGRAM_SCRAPE"; request: InstagramScrapeRequest }
  | { type: "RUN_IG_SEND_LOOP" }
  | { type: "STOP_IG_SEND_LOOP" }
  | { type: "SAVE_CONFIG"; config: { convexUrl: string; deviceToken: string; workspaceId: string; dashboardUrl: string } };

export type IgRuntimeState = {
  scraping: boolean;
  sending: boolean;
  progress: string;
  approvedCount: number;
  sendsToday: number;
  dailySendCeiling: number;
};

export type ServiceWorkerResponse =
  | { type: "STATUS"; status: import("@zitrion/core").ExtensionSessionStatus }
  | { type: "IG_STATE"; state: IgRuntimeState }
  | { type: "OK" }
  | { type: "ERROR"; message: string };
