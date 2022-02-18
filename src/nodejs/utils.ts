import express from "express";
import path from "path";
import fetch from "node-fetch";
import fs from "fs";
import { JsonSerializable } from "../shared/models";
import { CRYPTENV } from "./crypto";
import { ADMIN_PASS } from "./config";
import gitConfigParser from "parse-git-config";

/////////////////////////////////////////////////////////////////

export let syslog = (...args: any) => {
  console.log(...args);
};

export function setSyslog(syslogFunc: any) {
  syslog = syslogFunc;
}

/////////////////////////////////////////////////////////////////

export function parseGitConfig(): any {
  const parsed = gitConfigParser.sync() || {};

  const nullResult = {
    parsed,
    originUrl: undefined,
    repo: undefined,
    originGitUserName: undefined,
  };

  const remoteOrigin = parsed[`remote "origin"`];

  if (remoteOrigin) {
    const url = remoteOrigin.url;
    if (url) {
      parsed.originUrl = url;
      const m = url.match(/^https:\/\/github.com\/([^\/]+)/);
      if (m) {
        parsed.originGitUserName = m[1];
      }
    } else {
      return nullResult;
    }
  } else {
    return nullResult;
  }

  const originUrl = parsed.originUrl;

  const originUrlParts = originUrl.split(/\//);
  const repoUrl = originUrlParts[originUrlParts.length - 1];
  const repo = repoUrl.replace(/\.git$/, "");

  return {
    parsed,
    originUrl,
    repo,
    originGitUserName: parsed.originGitUserName,
  };
}

/////////////////////////////////////////////////////////////////

export function readJson(path: string, def: JsonSerializable) {
  try {
    const json = JSON.parse(fs.readFileSync(path).toString());

    return json;
  } catch (err) {
    return def;
  }
}

export function readFile(path: string, def?: string) {
  try {
    const content = fs.readFileSync(path).toString();
    return content;
  } catch (err) {
    return def || "";
  }
}

export function writeJson(path: string, json: any) {
  fs.writeFileSync(path, JSON.stringify(json, null, 2));
}

/////////////////////////////////////////////////////////////////

export function envIntElse(key: string, def: number, proc?: boolean): number {
  const stored = proc ? process.env[key] : CRYPTENV[key];
  if (typeof stored === "undefined") {
    return def;
  }
  const parsed = parseInt(stored);
  if (isNaN(parsed)) {
    return def;
  }
  return parsed;
}

export function envStrElse(key: string, def: string, proc?: boolean) {
  const env = proc ? process.env[key] : CRYPTENV[key];

  if (env === undefined) {
    return def;
  }

  return env;
}

export function envBlobElse(key: string, def: any) {
  const json = envStrElse(key, "");
  try {
    return JSON.parse(json);
  } catch (err) {
    return def;
  }
}

/////////////////////////////////////////////////////////////////

export class Router {
  router = express.Router();
  checkLogin: any = (req: any) =>
    Promise.resolve({ error: "Not Authenticated User" });

  constructor() {
    this.router.use(express.json());
  }

  setCheckLogin(checkLogin: any) {
    this.checkLogin = checkLogin;
  }

  viewPath(name: string) {
    return path.join(__dirname, "..", "views", name);
  }

  sendView(res: any, name: string) {
    res.sendFile(this.viewPath(name));
  }

  sendDist(res: any, name: string) {
    res.sendFile(path.join(__dirname, "..", "dist", name));
  }

  sendModule(res: any, name: string) {
    res.sendFile(path.join(__dirname, "..", "node_modules", name));
  }

  postAuth(endpoint: string, handler: any) {
    this.router.post(endpoint, (req: any, res: any) => {
      this.checkLogin(req).then((result: any) => {
        if (result.error) {
          res.json(result);
        } else {
          const user = result.user;

          req.user = user;
          req.lightUser = user.cloneLight();

          handler(req, res);
        }
      });
    });
  }

  checkAdmin(req: any) {
    req.isAdmin = false;

    if (req.body) {
      if (req.body.ADMIN_PASS === ADMIN_PASS) {
        req.isAdmin = true;
      }
    }

    return req.isAdmin;
  }

  postAdmin(endpoint: string, handler: any) {
    this.router.post(endpoint, (req: any, res: any) => {
      if (this.checkAdmin(req)) {
        handler(req, res);
      } else {
        res.json({ endpoint, error: "Not Admin Authorized" });
      }
    });
  }

  get(endpoint: string, handler: any) {
    this.router.get(endpoint, handler);
  }

  post(endpoint: string, handler: any) {
    this.router.post(endpoint, (req: any, res: any) => {
      handler(req, res);
    });
  }

  mount(endpoint: string, parent: any) {
    parent.use(endpoint, this.router);
    return this;
  }
}

/////////////////////////////////////////////////////////////////

export type FetchParams = {
  url: string;
  headers?: { [key: string]: string };
  method?: string;
  payloadUrlEndcoded?: any;
  payloadJson?: any;
};

export function fetchText(fp: FetchParams): Promise<any> {
  return new Promise((resolve) => {
    let body = undefined;
    if (fp.payloadJson) {
      body = JSON.stringify(fp.payloadJson);
    }
    if (fp.payloadUrlEndcoded) {
      // TODO
    }
    const params = {
      method: fp.method || "GET",
      headers: fp.headers || {},
      body,
    };
    fetch(fp.url, params)
      .then((response) => {
        response
          .text()
          .then((text) => {
            resolve({ ok: true, text });
          })
          .catch((err) => {
            resolve({ error: err, status: "fetch text error" });
          });
      })
      .catch((err) => {
        resolve({ error: err, status: "fetch error" });
      });
  });
}

export function fetchJson(fp: FetchParams): Promise<any> {
  return new Promise((resolve) => {
    fetchText(fp).then((result) => {
      if (result.ok) {
        try {
          const json = JSON.parse(result.text);
          resolve({ ok: true, json });
        } catch (err) {
          resolve({
            error: err,
            status: "json parse error",
            text: result.text,
          });
        }
      } else {
        resolve(result);
      }
    });
  });
}

/////////////////////////////////////////////////////////////////

export class EventDispatcher {
  subscribers: any[] = [];

  constructor() {}

  subsrcibe(callback: any) {
    this.subscribers.push(callback);
    return this;
  }

  dispatch(ev: any) {
    this.subscribers.forEach((subs) => {
      subs(ev);
    });
  }
}
