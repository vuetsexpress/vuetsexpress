export const SCRIPT_LINEFEED = "\n";

export const DEFAULT_APP_NAME_DEFAULT = "appvuetsexpress";
export const DEFAULT_TARGZ_URL =
  "https://github.com/pythonideasalt/blobs/blob/main/apptargz/vuetsexpress.tar.gz?raw=true";

export function gitUrl(
  owner: string,
  repo: string,
  provider?: string,
  password?: string
) {
  const auth = password ? `${owner}:${password}@` : "";
  return `https://${auth}${provider || "github"}.com/${owner}/${repo}`;
}

export const DEFAULT_REPO_OWNER = "vuetsexpress";
export const DEFAULT_REPO_NAME = "vuetsexpress";
export const DEFAULT_REPO_URL = gitUrl(DEFAULT_REPO_OWNER, DEFAULT_REPO_NAME);

export const DEFAULT_LOGIN_INTERVAL = 60000;

export const CHAT_MESSAGE_MAX_LENGTH = 200;
export const DEFAULT_VARIANT_KEY = "atomic";
export const DEFAUL_VARIANT_DISPLAY_NAME = "Atomic";
export const DEFAULT_VARIANT_ALIAS_REGEX = "atomic";
export const DEFAULT_RATED = true;
export const ALLOWED_ROUNDS = [2, 4, 6, 8, 10];
export const DEFAULT_ROUNDS = 2;
export const MAX_STORED_SEEKS = 20;

export const TYPICAL_DEBUNCE_DELAY = 3000;
export const TYPICAL_MAXWAIT_DELAY = 10000;

export const CHESSOPS_VARIANT_KEYS = [
  "chess",
  "antichess",
  "atomic",
  "crazyhouse",
  "horde",
  "kingofthehill",
  "racingkings",
  "3check",
] as const;
