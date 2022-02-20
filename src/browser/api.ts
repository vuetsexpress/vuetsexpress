import { Logger } from "../shared/utils";

////////////////////////////////////////////////////////////////

const API_BASE_URL = "/api";

const LOGGING_DISABLED_ENDPOINTS = [
  "timestamp",
  "setremotestorage",
  "getremotestorage",
  "login",
  "getglobalconfig",
  "getanalysis",
  "checkadmin",
  "getseeks",
  "getactiveusers",
  "getchat",
  "events/ping",
  "storeanalysis",
  "getmatches",
];

////////////////////////////////////////////////////////////////

let logger = new Logger({ owner: "api" });

export function setLogger(setLogger: any) {
  logger = setLogger;
}

////////////////////////////////////////////////////////////////

function api(endpoint: string, method: string, payloadOpt?: any) {
  const payload = payloadOpt || {};
  const url = `${API_BASE_URL}/${endpoint}`;
  payload.ADMIN_PASS = localStorage.getItem("ADMIN_PASS");
  payload.USER_TOKEN = localStorage.getItem("USER_TOKEN");
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const endpointRoot = endpoint.split("/?")[0];
  if (!LOGGING_DISABLED_ENDPOINTS.includes(endpointRoot))
    logger.log({ sent: true, endpoint, method, payload, url, headers }, "api");
  return new Promise((resolve) => {
    fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(payload),
    })
      .then((response) => {
        response
          .json()
          .then((json) => {
            if (!LOGGING_DISABLED_ENDPOINTS.includes(endpointRoot))
              logger.log({ received: true, endpoint, json }, "api");
            resolve(json);
          })
          .catch((error) => {
            resolve({ error });
          });
      })
      .catch((error) => {
        resolve({ error });
      });
  });
}

export function get(endpoint: string, payload?: any) {
  return api(endpoint, "GET", payload);
}

export function post(endpoint: string, payload?: any) {
  return api(endpoint, "POST", payload);
}

export function hotReload() {
  get("timestamp").then((json: any) => {
    const TIMESTAMP = json.TIMESTAMP;

    setInterval(() => {
      get("timestamp").then((json: any) => {
        if (json.TIMESTAMP !== TIMESTAMP) {
          setTimeout(() => document.location.reload(), 3000);
        }
      });
      // APP_CONF is declared in buildtargets/shims.d.td
      // VsCode linter marks it as name not found
      // is is safe to ignore this warning
    }, APP_CONF.HOT_RELOAD_INTERVAL || 1000);
  });
}
