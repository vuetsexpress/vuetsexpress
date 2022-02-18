import fs from "fs";
import { formatDuration } from "../shared/time";
import fetch from "node-fetch";
import { pauseSecond } from "../shared/utils";
import { APP_DISPOSITION, PACKAGE_JSON } from "./config";
import { DEFAULT_APP_NAME_DEFAULT } from "../shared/config";
import { readJson } from "./utils";
import { CRYPTENV } from "./crypto";
import { syslog } from "./utils";

////////////////////////////////////////////////////////////////

export const API_BASE_URL = "https://api.heroku.com";
export const DEFAULT_ACCEPT = "application/vnd.heroku+json; version=3";

export const MAX_APPS = 5;

export const SAVE_RESPONSE_SAMPLES = false;

export const APP_CONF = readJson("appconf.json", {});

export const DEFAULT_APP_NAME = APP_CONF.defaultApp || DEFAULT_APP_NAME_DEFAULT;

export function appUrl(appName: string) {
  return `https://${appName}.herokuapp.com/`;
}

export const DEFAULT_APP_URL = appUrl(DEFAULT_APP_NAME);

export const LOCAL_CONFIG = CRYPTENV;

const MIGRATE_APPS = APP_CONF.migrateApps;

export const HEROKU_STACKS = [
  "heroku-16",
  "heroku-18",
  "heroku-20",
  "container",
];

//////////////////////////////////////////////////////////////////////
// API primitives

export function api(
  endpoint: string,
  method: string,
  payload: any,
  token: string,
  accept?: string
) {
  const url = `${API_BASE_URL}/${endpoint}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: accept || DEFAULT_ACCEPT,
    "Content-Type": "application/json",
  };

  const body = payload ? JSON.stringify(payload) : undefined;

  if (require.main === module) {
    //syslog({ endpoint, method, url, headers, payload, token, body });
  }

  return new Promise((resolve, reject) => {
    fetch(url, {
      method,
      headers,
      body,
    }).then(
      (resp) =>
        resp.json().then(
          (json) => {
            if (SAVE_RESPONSE_SAMPLES)
              fs.writeFileSync(
                `responsesamples/${endpoint.replace(/\//g, "_")}.json`,
                JSON.stringify(json, null, 2)
              );
            resolve(json);
          },
          (err) => {
            syslog("ERROR", err);
            reject(err);
          }
        ),
      (err) => {
        syslog("ERROR", err);
        reject(err);
      }
    );
  });
}

function get(endpoint: string, payload: any, token: string, accept?: string) {
  return api(endpoint, "GET", payload, token, accept);
}

function post(endpoint: string, payload: any, token: string, accept?: string) {
  return api(endpoint, "POST", payload, token, accept);
}

function del(endpoint: string, payload: any, token: string, accept?: string) {
  return api(endpoint, "DELETE", payload, token, accept);
}

function patch(endpoint: string, payload: any, token: string, accept?: string) {
  return api(endpoint, "PATCH", payload, token, accept);
}

//////////////////////////////////////////////////////////////////////

export function getConfig() {
  return Promise.resolve({ content: undefined });
}

function getAppConf(name: string) {
  const appConf = APP_CONF.apps[name];
  if (appConf) return appConf;
  const baseName = name.replace(/temp$/, "");
  return APP_CONF.apps[baseName];
}

function awaitCompletion(
  resolve: any,
  func: any,
  triesLeft: number,
  stepOpt?: number
) {
  const step = stepOpt || 0;
  if (triesLeft <= 0) {
    resolve({ error: "timed out" });
  } else {
    syslog("awaiting step", step, "tries left", triesLeft);
    func().then((result: any) => {
      if (result.done) {
        resolve(result);
      } else {
        setTimeout(
          () => awaitCompletion(resolve, func, triesLeft - 1, step + 1),
          10000
        );
      }
    });
  }
}

//////////////////////////////////////////////////////////////////////

export type MigrationStrategy = "external" | "internal" | "disabled";
const DEFAULT_MIGRATION_STRATEGY = "external";

export type SelectionStrategy = "preferred" | "best" | "manual";
const DEFAULT_SELECTION_STRATEGY = "preferred";

export type SetConfigStrategy = "remote" | "fallback" | "local";
const DEFAULT_SET_CONFIG_STRATEGY = "fallback";

export type DeployStrategy = {
  migrationStrategy?: MigrationStrategy;
  selectionStrategy?: SelectionStrategy;
  setConfigStrategy?: SetConfigStrategy;
  deployTo?: string;
  targzUrl?: string;
  region?: string;
  stack?: string;
};

export type LogParams = {
  lines?: number;
  tail?: boolean;
};

export class HerokuApp {
  id: string = "";
  name: string = "";
  stack: string = "";
  region: string = "";
  quotaUsed: number = 0;
  parentAccount: HerokuAccount = new HerokuAccount("");
  origBlob: any = {};

  constructor(parentAccount: HerokuAccount, blob: any) {
    this.id = blob.id;
    this.name = blob.name;
    this.stack = blob.stack.name;
    this.region = blob.region.name;
    this.parentAccount = parentAccount;
    this.origBlob = blob;
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      stack: this.stack,
      region: this.region,
      quotaUsed: this.quotaUsed,
      origBlob: this.origBlob,
    };
  }

  getLogs(lpOpt?: LogParams) {
    const lp: LogParams = lpOpt || {
      lines: 500,
      tail: true,
    };
    return new Promise((resolve) => {
      post(`apps/${this.name}/log-sessions`, lp, this.parentAccount.token).then(
        (result: any) => {
          resolve(result);
        }
      );
    });
  }

  build(url: string) {
    syslog(
      "starting build",
      this.name,
      "at",
      this.parentAccount.name,
      "targz",
      url
    );
    return new Promise((resolve) => {
      post(
        `apps/${this.name}/builds`,
        {
          source_blob: {
            checksum: null,
            url,
            version: null,
          },
        },
        this.parentAccount.token
      ).then((result: any) => {
        resolve(result);
      });
    });
  }
  getBuild(id: string) {
    return new Promise((resolve) => {
      get(
        `apps/${this.name}/builds/${id}`,
        undefined,
        this.parentAccount.token
      ).then((result: any) => {
        resolve(result);
      });
    });
  }
  awaitBuild(url: string) {
    return new Promise((resolve) => {
      this.build(url).then((result: any) => {
        const id = result.id;

        awaitCompletion(
          resolve,
          () => {
            return new Promise((resolve) => {
              this.getBuild(id).then((result: any) => {
                if (result.status === "pending") {
                  resolve({ done: false });
                } else {
                  resolve({ done: result });
                }
              });
            });
          },
          30
        );
      });
    });
  }

  getBuilds() {
    return new Promise((resolve) => {
      get(`apps/${this.name}/builds`, undefined, this.parentAccount.token).then(
        (json) => {
          resolve(json);
        }
      );
    });
  }

  setConfig(configOpt?: any) {
    const config = configOpt || {};
    const numKeys = Object.keys(config).length;
    syslog("setting config", this.name, numKeys, "keys");
    return new Promise((resolve) => {
      patch(
        `apps/${this.name}/config-vars`,
        config,
        this.parentAccount.token
      ).then((result: any) => {
        if (typeof result === "object") {
          const setNumKeys = Object.keys(result).length;
          syslog(
            "set config result",
            this.name,
            setNumKeys,
            "keys",
            setNumKeys >= numKeys ? "ok" : "failed"
          );
        } else {
          syslog("ERROR", "set config result is not object", this.name, result);
        }
        resolve(result);
      });
    });
  }

  getConfig() {
    return new Promise((resolve) => {
      get(
        `apps/${this.name}/config-vars`,
        undefined,
        this.parentAccount.token
      ).then((result: any) => {
        resolve(result);
      });
    });
  }

  toString(pref: string) {
    return `${pref}HerokuApp < ${this.name} [ ${this.id} ] ${
      this.region
    } used: ${formatDuration(this.quotaUsed)} , remaining: ${formatDuration(
      this.parentAccount.quotaRemaining()
    )} >`;
  }
}

export type CreateAppParams = {
  name: string;
  region?: string;
  stack?: string;
};

export class HerokuAccount {
  name: string = "";
  envTokenFullName: string = "";
  token: string = "";
  id: string = "";
  quotaTotal: number = 0;
  quotaUsed: number = 0;
  apps: HerokuApp[] = [];

  constructor(name: string) {
    this.name = name;
    this.envTokenFullName = "HEROKU_TOKEN_" + this.name;
    this.token = CRYPTENV[this.envTokenFullName] || "";
  }

  hasApp(appName: string) {
    return this.apps.find((app) => app.name === appName);
  }

  serialize() {
    return {
      name: this.name,
      id: this.id,
      quotaTotal: this.quotaTotal,
      quotaUsed: this.quotaUsed,
      apps: this.apps.map((app) => app.serialize()),
    };
  }

  createApp(cap: CreateAppParams) {
    syslog("creating app", cap, "at", this.name);
    return new Promise((resolve) => {
      post("apps", cap, this.token).then((result: any) => {
        if (result.id === "invalid_params") {
          syslog("could not create app", cap, result.message);
          resolve({
            error: "invalid params",
            message: result.message,
          });
        } else {
          syslog("created app", cap, "at", this.name, "id", result.id);
          resolve(result);
        }
      });
    });
  }

  deleteApp(name: string) {
    syslog("deleting app", name, "at", this.name);
    return new Promise((resolve) => {
      del(`apps/${name}`, undefined, this.token).then((result: any) => {
        if (result.id === "not_found") {
          syslog("ERROR", result.message);
          resolve({
            error: "not found",
            message: result.message,
          });
        } else {
          syslog("deleted", name, "at", this.name, "id", result.id);
          resolve(result);
        }
      });
    });
  }

  restartAllDynos(name: string) {
    syslog("restart all dynos", name, "at", this.name);
    return new Promise((resolve) => {
      del(`apps/${name}/dynos`, undefined, this.token).then((json) => {
        resolve(json);
      });
    });
  }

  quotaRemaining() {
    return this.quotaTotal - this.quotaUsed;
  }

  toString(pref: string) {
    const apps = this.apps.length
      ? `\n${pref}  apps:\n${this.apps
          .map((app) => "    " + app.toString(pref))
          .join("\n")}`
      : "";
    return `${pref}HerokuAccount < ${this.name} [ ${this.id} , ${
      this.token
    } ]\n${pref}  used: ${formatDuration(
      this.quotaUsed
    )} , remaining: ${formatDuration(this.quotaRemaining())}${apps}\n${pref}>`;
  }

  getAccount() {
    return new Promise((resolve) => {
      get(`account`, undefined, this.token)
        .then((json: any) => {
          this.id = json.id;
          resolve(json);
        })
        .catch((err) => {
          console.error("error getting account", err);
          resolve({});
        });
    });
  }

  getQuota() {
    const fakeQuota = {
      account_quota: 550,
      quota_used: 0,
    };
    return new Promise((resolve) => {
      get(
        `accounts/${this.id}/actions/get-quota`,
        undefined,
        this.token,
        "application/vnd.heroku+json; version=3.account-quotas"
      )
        .then((json: any) => {
          if (
            json.id === "not_found" ||
            json.id === "application_error" ||
            json.id === "internal_server_error"
          ) {
            console.error("error getting quota", json.id, json.message);
            resolve(fakeQuota);
          } else {
            resolve(json);
          }
        })
        .catch((err) => {
          console.error("error getting quota", err);
          resolve(fakeQuota);
        });
    });
  }

  cancelBuild(appName: string, buildId: string) {
    return new Promise((resolve) => {
      del(
        `apps/${appName}/builds/${buildId}`,
        undefined,
        this.token,
        "application/vnd.heroku+json; version=3.cancel-build"
      ).then((json: any) => {
        resolve(json);
      });
    });
  }

  setStack(appName: string, stack: string) {
    return new Promise((resolve) => {
      patch(`apps/${appName}`, { build_stack: stack }, this.token).then(
        (json: any) => {
          resolve(json);
        }
      );
    });
  }

  getAppById(id: string) {
    return this.apps.find((app) => app.id === id);
  }

  getApps() {
    return new Promise((resolve) => {
      get("apps", undefined, this.token)
        .then((json: any) => {
          try {
            this.apps = json.map((app: any) => new HerokuApp(this, app));
          } catch (err) {
            console.error("error getting apps", err);
            resolve([]);
          }
          resolve(json);
        })
        .catch((err) => {
          console.error("error getting apps", err);
          resolve([]);
        });
    });
  }

  init() {
    return new Promise(async (resolve) => {
      const account = await this.getAccount();
      const quota: any = await this.getQuota();
      const apps = await this.getApps();
      if (!quota.apps) {
        quota.apps = [];
      }
      for (const qApp of quota.apps) {
        try {
          (this.getAppById(qApp.app_uuid) as any).quotaUsed = qApp.quota_used;
        } catch (err) {
          /*syslog(
              `quota app not among account apps`,
              qApp,
              this.apps.map((app) => app.id)
            );*/
        }
      }
      this.quotaTotal = quota.account_quota;
      this.quotaUsed = quota.quota_used;
      resolve({ account, quota, apps });
    });
  }
}

function getAllEnvTokens() {
  const envTokenKeys = Object.keys(CRYPTENV).filter((key) =>
    key.match(/^HEROKU_TOKEN_/)
  );

  const envTokens = envTokenKeys.map((key) => ({
    key,
    name: key.split("_")[2],
    token: CRYPTENV[key],
  }));

  return envTokens;
}

function getAllGitHubFullTokens() {
  const envTokenKeys = Object.keys(CRYPTENV).filter((key) =>
    key.match(/_GITHUB_TOKEN_FULL$/)
  );

  const envTokens = envTokenKeys.map((key) => ({
    key,
    envTokenName: key.split("_")[0],
    token: CRYPTENV[key],
  }));

  return envTokens;
}

export type MigrateAction =
  | "temptobest"
  | "deltemp"
  | "apptobest"
  | "delapp"
  | "done"
  | "final";
export type MigrateState = "best" | "inf" | "none";

export type MigrateDecision = {
  appState: MigrateState;
  tempAppState: MigrateState;
  action: MigrateAction;
  bestQuota?: HerokuAccount;
  appAccount?: HerokuAccount;
  tempAppAccount?: HerokuAccount;
};

export type MigrateResult = {
  final?: string;
  acc?: HerokuAccount;
  migrateDecision?: MigrateDecision;
  done?: string;
  completed?: string;
};

function migrateDecisionLookupInternal(): MigrateDecision[] {
  return [
    // 1
    {
      appState: "best",
      tempAppState: "none",
      action: "done",
    },
    // 2
    {
      appState: "best",
      tempAppState: "best",
      action: "deltemp",
    },
    // 3
    {
      appState: "best",
      tempAppState: "inf",
      action: "deltemp",
    },
    // 4
    {
      appState: "inf",
      tempAppState: "best",
      action: "delapp",
    },
    // 5
    {
      appState: "inf",
      tempAppState: "inf",
      action: "deltemp",
    },
    // 6
    {
      appState: "inf",
      tempAppState: "none",
      action: "temptobest",
    },
    // 7
    {
      appState: "none",
      tempAppState: "best",
      action: "apptobest",
    },
    // 8
    {
      appState: "none",
      tempAppState: "inf",
      action: "apptobest",
    },
    // 9
    {
      appState: "none",
      tempAppState: "none",
      action: "apptobest",
    },
  ];
}

function migrateDecisionLookupExternal(): MigrateDecision[] {
  return [
    // 1
    {
      appState: "best",
      tempAppState: "none",
      action: "done",
    },
    // 2
    {
      appState: "best",
      tempAppState: "best",
      action: "deltemp",
    },
    // 3
    {
      appState: "best",
      tempAppState: "inf",
      action: "deltemp",
    },
    // 4
    {
      appState: "inf",
      tempAppState: "best",
      action: "deltemp",
    },
    // 5
    {
      appState: "inf",
      tempAppState: "inf",
      action: "deltemp",
    },
    // 6
    {
      appState: "inf",
      tempAppState: "none",
      action: "delapp",
    },
    // 7
    {
      appState: "none",
      tempAppState: "best",
      action: "deltemp",
    },
    // 8
    {
      appState: "none",
      tempAppState: "inf",
      action: "deltemp",
    },
    // 9
    {
      appState: "none",
      tempAppState: "none",
      action: "apptobest",
    },
  ];
}

export class HerokuAppManager {
  accounts: HerokuAccount[] = [];

  constructor() {}

  serialize() {
    return {
      accounts: this.accounts.map((account) => account.serialize()),
    };
  }

  getAccountByName(name: string) {
    const acc = this.accounts.find((acc) => acc.name === name);
    return acc;
  }

  cancelBuild(appName: string, buildId: string) {
    const acc = this.getAccountByAppName(appName);
    return new Promise((resolve) => {
      if (acc) {
        acc.cancelBuild(appName, buildId).then((result: any) => {
          resolve(result);
        });
      } else {
        resolve({
          error: "no such app",
        });
      }
    });
  }

  setStack(appName: string, stack: string) {
    const acc = this.getAccountByAppName(appName);
    return new Promise((resolve) => {
      if (acc) {
        acc.setStack(appName, stack).then((result: any) => {
          resolve(result);
        });
      } else {
        resolve({
          error: "no such app",
        });
      }
    });
  }

  createApp(accountName: string, cap: CreateAppParams) {
    const acc = this.getAccountByName(accountName);
    return new Promise((resolve) => {
      if (acc) {
        acc.createApp(cap).then((result: any) => {
          resolve(result);
        });
      } else {
        resolve({
          error: "no such account",
        });
      }
    });
  }

  allApps() {
    const apps = this.accounts.map((acc) => acc.apps).flat();
    return apps;
  }

  getBestQuota(appNameOpt?: string): MigrateResult {
    const appConfApps = APP_CONF.apps;

    if (!appConfApps)
      return {
        final: "no apps in appconf",
      };

    const appName = appNameOpt || DEFAULT_APP_NAME;

    syslog("get best quota", appName);

    const appConf = appConfApps[appName];

    if (!appConf)
      return {
        final: "no conf for app in appconf",
      };

    const allowedAccounts = appConf.allowedAccounts;

    if (!allowedAccounts)
      return {
        final: "no allowed accounts",
      };

    const allowedHerokuAccounts = this.accounts.filter((acc) =>
      appConf.allowedAccounts.includes(acc.name)
    );

    if (!allowedHerokuAccounts.length)
      return {
        final: "no allowed heroku accounts",
      };

    const hasRoom = allowedHerokuAccounts.filter(
      (acc) => acc.apps.length < MAX_APPS - 1
    );

    if (!hasRoom.length)
      return {
        final: "no room",
      };

    const bestQuota = hasRoom.reduce((acc, curr) =>
      curr.quotaRemaining() > acc.quotaRemaining() ? curr : acc
    );

    const quotaRemaining = bestQuota.quotaRemaining();

    if (quotaRemaining <= 0) {
      return {
        final: `no quota on best quota ( ${quotaRemaining} )`,
      };
    }

    return {
      acc: bestQuota,
    };
  }

  hasApp(appName: string) {
    return this.allApps().find((app) => app.name === appName);
  }

  getMigrateDecision(appNameOpt?: string): MigrateResult {
    const appName = appNameOpt || DEFAULT_APP_NAME;
    const tempAppName = appName + "temp";

    syslog("get migrate decision", appName);

    const bestQuotaResult = this.getBestQuota(appName);

    syslog({ bestQuotaResult });

    if (bestQuotaResult.final) return bestQuotaResult;

    const bestQuota = bestQuotaResult.acc as HerokuAccount;

    const hasApp = this.hasApp(appName);
    let appState: MigrateState = "none";
    if (bestQuota.hasApp(appName)) {
      appState = "best";
    } else if (hasApp) {
      appState = "inf";
    }

    const hasTempApp = this.hasApp(tempAppName);
    let tempAppState: MigrateState = "none";
    if (bestQuota.hasApp(tempAppName)) {
      tempAppState = "best";
    } else if (hasTempApp) {
      tempAppState = "inf";
    }

    const migrateDecisionLookup =
      appName === DEFAULT_APP_NAME
        ? migrateDecisionLookupInternal()
        : migrateDecisionLookupExternal();

    syslog({ migrateDecisionLookup });

    const dec = migrateDecisionLookup.find(
      (dec) => dec.appState === appState && dec.tempAppState === tempAppState
    ) as MigrateDecision;

    dec.bestQuota = bestQuota;

    if (hasApp) dec.appAccount = hasApp.parentAccount;
    if (hasTempApp) dec.tempAppAccount = hasTempApp.parentAccount;

    syslog({
      hasApp: !!hasApp,
      hasTempApp: !!hasTempApp,
      appState,
      tempAppState,
      dec,
    });

    return {
      migrateDecision: dec,
    };
  }

  migrateOnce(appNameOpt?: string): Promise<MigrateResult> {
    const appName = appNameOpt || DEFAULT_APP_NAME;
    const tempAppName = appName + "temp";

    syslog("migrate once", appName, tempAppName);

    return new Promise((resolve) => {
      const result = this.getMigrateDecision(appName);

      if (result.final) {
        resolve({ final: result.final });
        return;
      }

      const dec = result.migrateDecision as MigrateDecision;

      const bestQuota = dec.bestQuota as HerokuAccount;

      if (dec.action === "apptobest") {
        this.deployApp(appName, { deployTo: bestQuota.name }).then(
          (result: any) => {
            if (result.done) {
              resolve({
                done: result.done,
              });
            } else {
              resolve({
                final: result.status,
              });
            }
          }
        );
        return;
      }

      if (dec.action === "delapp") {
        (dec.appAccount as HerokuAccount)
          .deleteApp(appName)
          .then((result: any) => {
            if (result.error) {
              resolve({
                final: result.error,
              });
            } else {
              resolve({
                done: `deleted app ${appName}`,
              });
            }
          });
        return;
      }

      if (dec.action === "temptobest") {
        this.deployApp(tempAppName, { deployTo: bestQuota.name }).then(
          (result: any) => {
            if (result.done) {
              resolve({
                done: result.done,
              });
            } else {
              resolve({
                final: result.status,
              });
            }
          }
        );
        return;
      }

      if (dec.action === "deltemp") {
        (dec.tempAppAccount as HerokuAccount)
          .deleteApp(tempAppName)
          .then((result: any) => {
            if (result.error) {
              resolve({
                final: result.error,
              });
            } else {
              resolve({
                done: `deleted temp app ${tempAppName}`,
              });
            }
          });
        return;
      }

      if (dec.action === "done") {
        resolve({
          done: `completed migrate once ${appName} ok`,
          completed: `no action required migrate once ${appName}`,
        });
        return;
      }

      if (dec.action === "final") {
        resolve({
          final: dec.action,
        });
        return;
      }
    });
  }

  migrate(appNameOpt?: string): Promise<MigrateResult> {
    const appName = appNameOpt || DEFAULT_APP_NAME;
    const tempAppName = appName + "temp";

    syslog("migrate", appName);

    let step = 0;

    return new Promise(async (resolve) => {
      while (true) {
        if (
          step > 0 &&
          appName === DEFAULT_APP_NAME &&
          APP_DISPOSITION !== "dev"
        ) {
          syslog("waiting for migrate step", step);

          await pauseSecond(45);
        }

        syslog("migrate step", step++);

        await this.init();

        syslog("checking unbuilt app", appName);

        const delUnbuiltAppResult = await this.deleteUnbuilt(appName);

        syslog({ delUnbuiltAppResult });

        if (delUnbuiltAppResult.final) {
          syslog(
            "ERROR",
            "migrate failed, could not delete unbuilt app",
            delUnbuiltAppResult
          );
          resolve({ final: "could not delete unbuilt app" });
          break;
        } else {
          syslog("no unbuilt app", appName);
        }

        syslog("checking unbuilt app", tempAppName);

        const delUnbuiltTempAppResult = await this.deleteUnbuilt(tempAppName);

        syslog({ delUnbuiltTempAppResult });

        if (delUnbuiltTempAppResult.final) {
          syslog(
            "ERROR",
            "migrate failed, could not delete unbuilt temp app",
            delUnbuiltTempAppResult
          );
          resolve({ final: "could not delete unbuilt temp app" });
          break;
        } else {
          console.log("no unbuilt temp app", tempAppName);
        }

        const migrateOnceResult = await this.migrateOnce(appName);

        if (migrateOnceResult.final) {
          syslog("ERROR", "migrate failed", migrateOnceResult);
          resolve(migrateOnceResult);
          break;
        }

        if (migrateOnceResult.completed) {
          syslog("migrate completed", migrateOnceResult.completed);
          resolve({
            completed: migrateOnceResult.completed,
          });
          break;
        }
      }
    });
  }

  migrateAll() {
    return new Promise(async (resolve) => {
      let final = 0;
      let completed = 0;

      for (const appName of MIGRATE_APPS) {
        syslog("migrate all", appName, "of", MIGRATE_APPS);

        const migrateResult = await this.migrate(appName);

        syslog({ migrateResult });

        if (migrateResult.final) final++;
        if (migrateResult.completed) completed++;
      }

      resolve({ final, completed });
    });
  }

  getAppByName(name: string) {
    const app = this.allApps().find((app) => app.name === name);
    return app;
  }

  setConfig(nameOpt?: string, configOpt?: any) {
    const name = nameOpt || DEFAULT_APP_NAME;
    const app = this.getAppByName(name);
    return new Promise((resolve) => {
      if (app) {
        app.setConfig(configOpt).then((result: any) => {
          resolve(result);
        });
      } else {
        resolve({
          error: "no such app",
        });
      }
    });
  }

  getConfig(nameOpt?: string) {
    const name = nameOpt || DEFAULT_APP_NAME;
    const app = this.getAppByName(name);
    return new Promise((resolve) => {
      if (app) {
        app.getConfig().then((result: any) => {
          resolve(result);
        });
      } else {
        resolve({
          error: "no such app",
        });
      }
    });
  }

  getLogs(nameOpt?: string, lpOpt?: LogParams) {
    const name = nameOpt || DEFAULT_APP_NAME;
    const app = this.getAppByName(name);
    return new Promise((resolve) => {
      if (app) {
        app.getLogs(lpOpt).then((result: any) => {
          resolve(result);
        });
      } else {
        resolve({
          error: "no such app",
        });
      }
    });
  }

  getBuilds(nameOpt?: string) {
    const name = nameOpt || DEFAULT_APP_NAME;
    const app = this.getAppByName(name);
    return new Promise((resolve) => {
      if (app) {
        app.getBuilds().then((result: any) => {
          resolve(result);
        });
      } else {
        resolve({
          error: "no such app",
        });
      }
    });
  }

  isBuilt(nameOpt?: string) {
    const name = nameOpt || DEFAULT_APP_NAME;
    const app = this.getAppByName(name);
    return new Promise((resolve) => {
      if (app) {
        app.getBuilds().then((result: any) => {
          if (result.id === "forbidden") {
            resolve({ error: result });
          } else {
            const builds = result;
            if (builds.length) {
              const latestBuild = builds[builds.length - 1];
              resolve({
                built: latestBuild.status === "succeeded",
                latestBuild,
              });
            } else {
              resolve({ built: false, status: "no builds" });
            }
          }
        });
      } else {
        resolve({
          built: false,
          error: "no such app",
        });
      }
    });
  }

  deleteUnbuilt(nameOpt?: string): Promise<MigrateResult> {
    const name = nameOpt || DEFAULT_APP_NAME;

    return new Promise(async (resolve) => {
      while (true) {
        const app = this.getAppByName(name);

        if (!app) {
          resolve({
            done: "already deleted",
          });
          break;
        }

        const isBuiltResult: any = await this.isBuilt(name);

        if (isBuiltResult.error) {
          resolve({
            final: `error accessing app ${name}`,
          });
          break;
        } else {
          if (isBuiltResult.built) {
            resolve({
              done: `built ${name}`,
            });
            break;
          } else {
            syslog("deleting unbuilt app", name);
            await this.deleteApp(name);
            this.init();
          }
        }
      }
    });
  }

  getAccountByAppName(name: string) {
    const app = this.allApps().find((app) => app.name === name);
    if (app) {
      return app.parentAccount;
    } else {
      return undefined;
    }
  }

  deleteApp(nameOpt: string) {
    const name = nameOpt || DEFAULT_APP_NAME;
    const acc = this.getAccountByAppName(name);
    return new Promise((resolve) => {
      if (acc) {
        acc.deleteApp(name).then((result: any) => {
          resolve(result);
        });
      } else {
        resolve({
          error: "no such app",
        });
      }
    });
  }

  restartAllDynos(nameOpt: string) {
    const name = nameOpt || DEFAULT_APP_NAME;
    const acc = this.getAccountByAppName(name);
    return new Promise((resolve) => {
      if (acc) {
        acc.restartAllDynos(name).then((result: any) => {
          resolve(result);
        });
      } else {
        resolve({
          error: "no such app",
        });
      }
    });
  }

  toString() {
    return `HerokuAppManager <\n${this.accounts
      .map((acc) => acc.toString("  "))
      .join("\n")}\n>`;
  }

  init() {
    //syslog("initializing app manager");
    return new Promise(async (resolve) => {
      this.accounts = getAllEnvTokens().map(
        (token) => new HerokuAccount(token.name)
      );

      const initResult = await Promise.all(
        this.accounts.map((acc) => acc.init())
      );

      this.accounts.sort((a, b) => a.name.localeCompare(b.name));

      syslog(
        "initialized",
        initResult.length,
        "heroku account(s)",
        this.allApps().length,
        "app(s)"
      );

      resolve(initResult);
    });
  }

  deployApp(nameOpt?: string, strategyOpt?: DeployStrategy) {
    const name = nameOpt || DEFAULT_APP_NAME;
    const strategy = strategyOpt || {};
    const migrationStrategy =
      strategy.migrationStrategy || DEFAULT_MIGRATION_STRATEGY;
    const selectionStrategy =
      strategy.selectionStrategy || DEFAULT_SELECTION_STRATEGY;
    const setConfigStrategy =
      strategy.setConfigStrategy || DEFAULT_SET_CONFIG_STRATEGY;
    syslog("deploying app", name, strategy);
    return new Promise(async (resolve) => {
      syslog("getting app conf", name);

      let appConf = getAppConf(name);

      if (!appConf && !(strategy.targzUrl && strategy.deployTo)) {
        resolve({ error: "no conf for app" });
        return;
      }

      appConf = appConf || {};

      syslog("getting targz url", name);

      const targzUrl = appConf.targzUrl || strategy.targzUrl;

      if (!targzUrl) {
        resolve({ error: "no targz url for app" });
        return;
      }

      syslog("getting deploy account", name);

      let account = strategy.deployTo;

      if (!account) {
        if (selectionStrategy === "preferred") {
          const preferredAccount = appConf.preferredAccount;

          if (!preferredAccount) {
            resolve({ error: "no preferred account for app" });
            return;
          }

          account = preferredAccount;
        } else if (selectionStrategy === "best") {
          const allowedAccountNames =
            appConf.allowedAccounts || this.accounts.map((acc) => acc.name);
          const allowedAccounts = this.accounts
            .filter((acc) =>
              allowedAccountNames.find(
                (allowed: string) => acc.name === allowed
              )
            )
            .filter((acc) => acc.apps.length < MAX_APPS);
          const sortedAllowedAccounts = allowedAccounts.sort(
            (a, b) => b.quotaRemaining() - a.quotaRemaining()
          );
          if (!sortedAllowedAccounts.length) {
            resolve({ error: "no available account" });
            return;
          }
          account = sortedAllowedAccounts[0].name;
        }
      }

      syslog("getting config", name);

      let config = LOCAL_CONFIG;

      if (setConfigStrategy !== "local") {
        const getConfigResult = await getConfig();

        const remoteConfig = getConfigResult.content;

        if (remoteConfig) {
          config = remoteConfig;
        } else {
          if (setConfigStrategy === "remote") {
            resolve({ error: "could not obtain remote config" });
            return;
          }
        }
      }

      syslog("migrating", name);

      const existingApp = this.allApps().find((app) => app.name === name);

      if (existingApp) {
        syslog("already exists", name);

        const existingAccountName = existingApp.parentAccount.name;

        if (existingAccountName !== account) {
          if (migrationStrategy === "disabled") {
            resolve({ error: "app exists on different account" });
            return;
          }

          if (migrationStrategy === "external") {
            const deleteAppResult: any = await this.deleteApp(name);
            syslog("delete", name, "result", deleteAppResult.id);
          } else {
            resolve({ error: "internal migration not implemented" });
            return;
          }
        }
      }

      const region = strategy.region || appConf.region || PACKAGE_JSON.region;

      const stack = strategy.stack || appConf.stack || PACKAGE_JSON.stack;

      const cap: CreateAppParams = { name };

      if (region) cap.region = region;

      if (stack) cap.stack = stack;

      syslog("creating", name);

      const createAppResult = await this.createApp(account as string, cap);

      const initResult = await this.init();

      const app = this.getAppByName(name);

      if (!app) {
        resolve({ error: "could not create app" });
        return;
      }

      syslog("setting config", name);

      const setConfigResult = await this.setConfig(name, config);

      syslog("building", name);

      const awaitBuildResult: any = await app.awaitBuild(targzUrl);

      if (awaitBuildResult.done) {
        syslog("deployed", name, "status", awaitBuildResult.done.status);
      } else {
        syslog("ERROR", "deploy", name, "failed", awaitBuildResult.status);
      }

      resolve(awaitBuildResult);
    });
  }
}
