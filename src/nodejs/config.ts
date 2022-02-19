import { DAY, WEEK, SECOND, MINUTE, HOUR, TimeQuota } from "../shared/time";
import {
  DEFAULT_LOGIN_INTERVAL,
  DEFAULT_REPO_NAME,
  DEFAULT_APP_DISPLAY_NAME,
} from "../shared/config";
import currentGitBranch from "current-git-branch";
import { readJson } from "./utils";
import { parseGitConfig } from "./utils";

/////////////////////////////////////////////////////////////////////

export const PACKAGE_JSON = readJson("package.json", { scripts: {} });

export const GIT_REPO_NAME =
  process.env.GIT_REPO_NAME ||
  PACKAGE_JSON.repoName ||
  parseGitConfig().repo ||
  DEFAULT_REPO_NAME;
export const DEFAULT_DATABASE_NAME = GIT_REPO_NAME || DEFAULT_REPO_NAME;
export const DATABASE_NAME = PACKAGE_JSON.databaseName || DEFAULT_DATABASE_NAME;
export const APP_DISPLAY_NAME =
  PACKAGE_JSON.appDisplayName || DEFAULT_APP_DISPLAY_NAME;

export const DEFAULT_PORT = 8080;
export const DEFAULT_PORT_STR = `${DEFAULT_PORT}`;
export const PARSED_PORT = parseInt(process.env.PORT || DEFAULT_PORT_STR);
export const PORT = isNaN(PARSED_PORT) ? DEFAULT_PORT : PARSED_PORT;

export const APP_DISPOSITION = process.env.APP_DISPOSITION || "prod";
export const IS_DEV = APP_DISPOSITION === "dev";
export const IS_PROD = !IS_DEV;

export const DEFAULT_ADMIN_PASS = "admin";
export const ADMIN_PASS = process.env.ADMIN_PASS || DEFAULT_ADMIN_PASS;

export const MAX_ANON_LOGINS_FROM_IP = 5;

export const CURRENT_GIT_BRANCH = currentGitBranch();

/////////////////////////////////////////////////////////////////////

export const MAX_CHAT_MESSAGES = 100;
export const MAX_MATCHES_PER_USER = 3;
export const MAX_SEEKS = 3;

/////////////////////////////////////////////////////////////////////

export const FORK_ALL_DELAY = 15000;

export const MIGRATE_INTERVAL_MINUTE = 60;

export const LOGIN_INTERVAL = DEFAULT_LOGIN_INTERVAL;

export const CHECK_LICHESS_PROFILE_AFTER = DAY;
export const DISCARD_CHAT_MESSAGE_AFTER = WEEK;

/////////////////////////////////////////////////////////////////////

export const CHAT_TIME_QUOTA = new TimeQuota().fromBlob({
  name: "Chat",
  items: [
    { dur: 5 * SECOND, freq: 1 },
    { dur: 1 * MINUTE, freq: 5 },
    { dur: 1 * HOUR, freq: 100 },
    { dur: 1 * DAY, freq: 500 },
  ],
});
