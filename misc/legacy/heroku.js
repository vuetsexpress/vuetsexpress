let VERBOSE = false;

function log(...args) {
  if (VERBOSE) console.log(...args);
}

const prompt = require("prompt-sync")();

const fetch = require("node-fetch");
const fs = require("fs");

const argv = require("minimist")(process.argv.slice(2));

//////////////////////////////////////////////////////////////////

const pkg = require("./package.json");
const buildconf = require("./buildconf.json");
const { envIntElse } = require("@browsercapturesalt/config/server/utils");

const heroku = pkg.heroku;
const command = argv._[0];
delete argv._;

const appName = argv.name || heroku.appname;
const targzurl =
  argv.url || process.env.HEROKUTARGZBUILD_TARGZURL || pkg.targzurl;

const API_BASE_URL = "https://api.heroku.com";

const MAX_APPS = 5;

let defaultTokenName = argv.token
  ? "HEROKU_TOKEN_" + argv.token
  : "HEROKU_TOKEN";
let defaultToken = process.env[defaultTokenName];

var config = {};

pkg.heroku.configvars.forEach((cv) => (config[cv] = process.env[cv] || null));

//////////////////////////////////////////////////////////////////

function confirm(msg, defaultCancel) {
  const answer = prompt(
    "Are you sure you want to " +
      msg +
      " ? ( y = Yes, n = No, ENTER = " +
      (defaultCancel ? "No" : "Yes") +
      " ) "
  );

  if (!answer) {
    return !defaultCancel;
  }

  return defaultCancel ? answer.match(/^y/i) : !answer.match(/^n/i);
}

function fetchText(url) {
  //log("fetch text", url);
  return new Promise((resolve, reject) => {
    try {
      fetch(url)
        .then((response) => {
          //log("response", response);
          response
            .text()
            .then((text) => {
              //log("got text size", text.length);
              resolve(text);
            })
            .catch((err) => {
              const errMsg = `could not get response text ${err}`;
              log("error", errMsg);
              reject(errMsg);
            });
        })
        .catch((err) => {
          const errMsg = `could not get response ${err}`;
          log("error", errMsg);
          reject(errMsg);
        });
    } catch (err) {
      const errMsg = `fetch error ${err}`;
      log(errMsg);
      reject(errMsg);
    }
  });
}

function api(endpoint, method, payload, token, accept) {
  const url = `${API_BASE_URL}/${endpoint}`;
  const headers = {
    Authorization: `Bearer ${token || defaultToken}`,
    Accept: accept || "application/vnd.heroku+json; version=3",
    "Content-Type": "application/json",
  };
  const body = payload ? JSON.stringify(payload) : undefined;
  if (require.main === module) {
    log({ endpoint, method, url, headers, payload, token, body });
  }
  return new Promise((resolve, reject) => {
    fetch(url, {
      method,
      headers,
      body,
    }).then(
      (resp) =>
        resp.json().then(
          (json) => resolve(json),
          (err) => {
            console.error(err);
            reject(err);
          }
        ),
      (err) => {
        console.error(err);
        reject(err);
      }
    );
  });
}

function get(endpoint, payload, token, accept) {
  return api(endpoint, "GET", payload, token, accept);
}

function post(endpoint, payload, token, accept) {
  return api(endpoint, "POST", payload, token, accept);
}

function del(endpoint, payload, token, accept) {
  return api(endpoint, "DELETE", payload, token, accept);
}

function patch(endpoint, payload, token, accept) {
  return api(endpoint, "PATCH", payload, token, accept);
}

function getSchema() {
  get("schema").then((json) =>
    fs.writeFileSync("schema.json", JSON.stringify(json, null, 2))
  );
}

function createApp(name, token) {
  return new Promise((resolve) => {
    post("apps", { name }, token).then((json) => {
      if (require.main === module) {
        log(json);
      }

      resolve(json);
    });
  });
}

function delApp(name, token) {
  return new Promise((resolve) => {
    del(`apps/${name}`, undefined, token).then((json) => {
      if (require.main === module) {
        log(json);
      }

      resolve(json);
    });
  });
}

function getConfig(name, token) {
  return new Promise((resolve) => {
    get(`apps/${name}/config-vars`, undefined, token).then((json) => {
      if (require.main === module) {
        log(json);
      }

      resolve(json);
    });
  });
}

function getAccount(token) {
  return new Promise((resolve) => {
    get(`account`, undefined, token).then((json) => {
      if (require.main === module) {
        log(json);
      }

      resolve(json);
    });
  });
}

function getQuota(token) {
  return new Promise((resolve) => {
    getAccount(token).then((acc) => {
      get(
        `accounts/${acc.id}/actions/get-quota`,
        undefined,
        token,
        "application/vnd.heroku+json; version=3.account-quotas"
      ).then((json) => {
        json.acc = acc;

        if (require.main === module) {
          log(json);
        }

        resolve(json);
      });
    });
  });
}

function getRichQuota(tokenOpt) {
  const token = tokenOpt || defaultToken;

  return new Promise((resolve) => {
    Promise.all([getQuota(token), getApps(token)]).then((items) => {
      const [quota, apps] = items;

      const json = {
        quota,
        apps,
      };

      let allUsedQuota = 0;
      for (let qApp of quota.apps) {
        const appId = qApp.app_uuid;
        const app = apps.find((app) => app.id === appId);
        allUsedQuota += qApp.quota_used;
        if (app) {
          app.usedQuota = qApp.quota_used;
          app.accountQuota = quota.account_quota;
        }
      }

      json.accountQuota = json.quota.account_quota;
      json.accountUsedQuota = allUsedQuota;
      json.accountRemainingQuota = json.accountQuota - json.accountUsedQuota;

      for (let app of apps) {
        app.remainingQuota = json.accountRemainingQuota;
        app.usedQuota = app.usedQuota || 0;
      }

      const alltokens = getAllTokens();
      json.accountHerokuToken = token;
      json.accountHerokuName = alltokens.herokuNameByToken[token];

      if (require.main === module) {
        log(JSON.stringify(json, null, 2));
      }

      resolve(json);
    });
  });
}

function getAllRichQuotas() {
  const alltokens = getAllTokens();
  return new Promise((resolve) => {
    Promise.all(alltokens.tokens.map((token) => getRichQuota(token))).then(
      (richQuotas) => {
        const json = {
          richQuotas,
          apps: richQuotas.map((richQuota) => richQuota.apps).flat(),
        };

        resolve(json);
      }
    );
  });
}

function setConfig(name, configVars, token) {
  return new Promise((resolve) => {
    patch(`apps/${name}/config-vars`, configVars || config, token).then(
      (json) => {
        if (require.main === module) {
          log(json);
        }

        resolve(json);
      }
    );
  });
}

function getLogs(name, token, lines, tail) {
  return new Promise((resolve) => {
    post(
      `apps/${name}/log-sessions`,
      { lines: lines || 100, tail: tail || false },
      token
    ).then((json) => {
      if (tail) {
        json.logText = "";
        json.logLines = [];
        json.logItems = [];

        resolve(json);
      } else {
        fetchText(json.logplex_url)
          .then((text) => {
            //log("fetched logs text size", text.length);
            json.logText = `${text}`;
            json.logLines = json.logText
              .replace(/\r/g, "")
              .split("\n")
              .filter((line) => line.length);
            json.logItems = json.logLines.map((line) => {
              const m = line.match(/([^ ]+) ([^ ]+): (.*)/);
              return { time: m[1], dyno: m[2], content: m[3] };
            });

            if (require.main === module) {
              log(json);
            }

            resolve(json);
          })
          .catch((err) => {
            log("error fetching log text", err);
            json.error = err;
            json.logText = err;
            json.logLines = [];
            json.logItems = [];

            if (require.main === module) {
              log(json);
            }

            resolve(json);
          });
      }
    });
  });
}

function getBuilds(name, token) {
  return new Promise((resolve) => {
    get(`apps/${name}/builds`, undefined, token).then((json) => {
      if (require.main === module) {
        log(json);
      }

      resolve(json);
    });
  });
}

function getApps(tokenOpt) {
  const token = tokenOpt || defaultToken;
  return new Promise((resolve) => {
    get("apps", undefined, token).then((json) => {
      if (require.main === module) {
        log(json);
      }
      const alltokens = getAllTokens();
      try {
        json.forEach((app) => {
          app.herokuToken = token;
          app.herokuName = alltokens.tokensByToken[token].split("_")[2];
        });
      } catch (err) {
        log(err, token, alltokens);
      }
      resolve(json);
    });
  });
}

function getAllApps() {
  return new Promise((resolve) => {
    const alltokens = getAllTokens();

    Promise.all(
      Object.keys(alltokens.tokensByToken).map((token) => getApps(token))
    ).then((appss) => {
      const apps = appss
        .flat()
        .sort((a, b) => {
          if (a.herokuName != b.herokuName)
            return a.herokuName.localeCompare(b.herokuName);
          return a.name.localeCompare(b.name);
        })
        .map((app) => {
          app.herokuIndex = alltokens.herokuNames.findIndex(
            (name) => app.herokuName === name
          );
          return app;
        });

      if (require.main === module) {
        log(apps);
      }

      resolve(apps);
    });
  });
}

function buildApp(name, url, token) {
  return new Promise((resolve) => {
    post(
      `apps/${name}/builds`,
      {
        source_blob: {
          checksum: null,
          url,
          version: null,
        },
      },
      token
    ).then((json) => {
      if (require.main === module) {
        log(json);
      }

      resolve(json);
    });
  });
}

function restartAllDynos(name, token) {
  return new Promise((resolve) => {
    del(`apps/${name}/dynos`, undefined, token).then((json) => {
      if (require.main === module) {
        log(json);
      }

      resolve(json);
    });
  });
}

function getAllTokens() {
  const tokensByName = {};
  const tokensByHerokuName = {};
  const tokensByToken = {};
  const namesByName = {};
  const herokuNameByToken = {};
  const herokuNames = [];
  const tokens = [];
  const excludedByHerokuName = {};
  Object.keys(process.env)
    .filter((key) => key.match(new RegExp("^HEROKU_TOKEN_")))
    .forEach((token) => {
      const envToken = process.env[token];
      const herokuName = token.split("_")[2];
      tokensByName[token] = envToken;
      tokensByHerokuName[token] = envToken;
      tokensByToken[envToken] = token;
      namesByName[token] = herokuName;
      herokuNameByToken[envToken] = herokuName;
      herokuNames.push(herokuName);
      tokens.push(envToken);
      if (heroku.exclude.find((exc) => exc === herokuName)) {
        excludedByHerokuName[herokuName] = true;
      }
    });
  return {
    tokensByName,
    tokensByHerokuName,
    tokensByToken,
    namesByName,
    herokuNameByToken,
    herokuNames: herokuNames.sort((a, b) => a.localeCompare(b)),
    tokens,
    excludedByHerokuName,
  };
}

async function createConfigAndBuildConfirmed() {
  if (
    confirm(
      `create <${appName}>, set default config, and build from <${targzurl}>`
    )
  ) {
    await createApp(appName);
    await setConfig(appName);
    await buildApp(appName, targzurl);
  }
}

function getTargzurlForAppname(appName) {
  const effAppName = appName.replace(/temp$/, "");
  console.log("getting targzurl", appName, effAppName);
  const item = buildconf.find((item) => item.app === effAppName);
  if (item) {
    console.log("got targzurl", item.url);
    return item.url;
  }
  console.log("could not obtain targzurl");
  return undefined;
}

async function awaitBuildLoop(
  appName,
  token,
  readyFunc,
  resolve,
  step,
  retries
) {
  if (retries <= 0) {
    console.error("awaiting build timed out", appName);

    resolve({
      status: "timedout",
    });

    return;
  }

  console.log("awaiting build", appName, "step", step, "retries", retries);

  const builds = await getBuilds(appName, token);

  if (readyFunc(builds)) {
    console.log("build done", appName);

    resolve({
      status: "awaited",
      builds,
    });

    return;
  }

  setTimeout(
    () =>
      awaitBuildLoop(appName, token, readyFunc, resolve, step + 1, retries - 1),
    10000
  );
}

function awaitBuild(appName, token, readyFunc) {
  return new Promise((resolve) => {
    awaitBuildLoop(appName, token, readyFunc, resolve, 0, 30);
  });
}

function deployApp(appName, token) {
  console.log("deploying", appName);
  return new Promise(async (resolve) => {
    const targzurl = getTargzurlForAppname(appName);

    if (!targzurl) {
      resolve({
        done: false,
        failed: true,
        status: "notargzurl",
      });
      return;
    }

    const createResult = await createApp(appName, token);

    const setConfigResult = await setConfig(appName, undefined, token);

    console.log("deploy config keys", Object.keys(setConfigResult).length);

    const buildResult = await buildApp(appName, targzurl, token);

    if (buildResult.id === "bad_request") {
      resolve({
        done: false,
        failed: true,
        status: buildResult.id,
        message: buildResult.message,
      });

      return;
    }

    const buildId = buildResult.id;

    console.log("build started", buildId);

    const awaitBuildResult = await awaitBuild(appName, token, (builds) => {
      if (builds.id === "forbidden") {
        console.error("build forbidden", appName);
        resolve(true);
        return;
      }

      const build = builds.find((build) => build.id === buildId);

      if (build) {
        if (build.status === "pending") {
          return false;
        } else {
          console.log("build ready", build.status);
          return true;
        }
      } else {
        return false;
      }
    });

    if (awaitBuildResult.status === "timedout") {
      resolve({
        done: false,
        failed: true,
        status: "timedout",
      });

      return;
    }

    const build = awaitBuildResult.builds.find((build) => build.id === buildId);

    resolve({
      done: build.status === "succeeded",
      failed: build.status !== "succeeded",
      status: build.status,
    });
  });
}

const migrateFilter = (rq) => {
  if (rq.apps.length >= MAX_APPS) {
    console.log("excluded for having too many apps", rq.accountHerokuName);
    return false;
  }

  if (heroku.exclude.find((exc) => exc === rq.accountHerokuName)) {
    console.log("excluded for being on exclude list", rq.accountHerokuName);
    return false;
  }

  return true;
};

function migrate(appName, delOnDone, deployOnDone) {
  const tempAppName = appName + "temp";
  return new Promise((resolve) => {
    getAllRichQuotas().then((result) => {
      const app = result.apps.find((app) => app.name === appName);
      const tempApp = result.apps.find((app) => app.name === tempAppName);
      const sortedQuotas = result.richQuotas
        .filter(migrateFilter)
        .sort((a, b) => b.accountRemainingQuota - a.accountRemainingQuota);
      if (!sortedQuotas.length) {
        resolve({
          done: false,
          failed: true,
          status: "noavailableaccount",
        });

        return;
      }
      const bestQuota = sortedQuotas[0];
      const bestRemaining = bestQuota.accountRemainingQuota;

      if (!(app || tempApp)) {
        // no app at all
        // deploy app in best quota
        deployApp(appName, bestQuota.accountHerokuToken).then((result) => {
          result.done = false;
          resolve(result);
        });
      } else {
        if (app) {
          if (tempApp) {
            if (app.remainingQuota < bestRemaining) {
              if (tempApp.remainingQuota < bestRemaining) {
                // app and temp app on inferior quota
                // delete temp app
                delApp(tempAppName, tempApp.herokuToken).then((result) => {
                  resolve({
                    del: tempAppName,
                    id: result.id,
                    message: result.message,
                  });
                });
              } else {
                // app on inferior quota, temp app on best quota
                // delete app
                delApp(appName, app.herokuToken).then((result) => {
                  resolve({
                    del: appName,
                    id: result.id,
                    message: result.message,
                  });
                });
              }
            } else {
              if (tempApp.remainingQuota < bestRemaining) {
                // app on best quota, temp app on inferior quota
                // delete temp app
                delApp(tempAppName, tempApp.herokuToken).then((result) => {
                  resolve({
                    del: tempAppName,
                    id: result.id,
                    message: result.message,
                  });
                });
              } else {
                // app and temp app on best quota
                // delete temp app
                delApp(tempAppName, tempApp.herokuToken).then((result) => {
                  resolve({
                    del: tempAppName,
                    id: result.id,
                    message: result.message,
                  });
                });
              }
            }
          } else {
            if (app.remainingQuota < bestRemaining) {
              // app only on inferior quota
              // deploy temp app on best quota
              deployApp(tempAppName, bestQuota.accountHerokuToken).then(
                (result) => {
                  result.done = false;
                  resolve(result);
                }
              );
            } else {
              // app only on best quota
              if (delOnDone) {
                // del anyway
                delApp(appName, app.herokuToken).then((result) => {
                  resolve({
                    del: appName,
                    id: result.id,
                    message: result.message,
                  });
                });
              } else {
                // done
                if (deployOnDone) {
                  console.log("deploying app on best quota", appName);
                  deployApp(appName, app.herokuToken).then((result) => {
                    result.done = true;
                    resolve(result);
                  });
                } else {
                  resolve({
                    done: true,
                    id: app.id,
                    message: "app only on best quota",
                  });
                }
              }
            }
          }
        } else {
          if (tempApp) {
            if (tempApp.remainingQuota < bestRemaining) {
              // temp app only on inferior quota
              // deploy app on best quota
              deployApp(appName, bestQuota.accountHerokuToken).then(
                (result) => {
                  result.done = false;
                  resolve(result);
                }
              );
            } else {
              // temp app only on best quota
              // deploy app on best quota
              deployApp(appName, bestQuota.accountHerokuToken).then(
                (result) => {
                  result.done = false;
                  resolve(result);
                }
              );
            }
          }
        }
      }
    });
  });
}

function migrateTillDoneLoop(appName, del, dep, resolve, step, triesLeft) {
  if (!triesLeft) {
    resolve({ failed: "no tries left" });
  } else {
    console.log("migrate till step", step);
    migrate(appName, del, dep).then((result) => {
      if (result.done) {
        console.log("migrate done", appName, result);
        resolve(result);
      } else if (result.failed) {
        console.log("migrate failed", appName, result);
        resolve(result);
      } else {
        console.log("migrate in progress", appName, result);
        migrateTillDoneLoop(
          appName,
          del,
          dep,
          resolve,
          step + 1,
          triesLeft - 1
        );
      }
    });
  }
}

function migrateTillDone(appName, del, dep) {
  return new Promise((resolve) => {
    migrateTillDoneLoop(appName, del, dep, resolve, 0, 8);
  });
}

function migrateTillDoneMany(appNamesOpt) {
  const appNames =
    appNamesOpt || (process.env["MIGRATE_APPS"] || appName).split(" ");
  console.log("migrate many till done", appNames);
  return new Promise(async (resolve) => {
    let allDone = true;

    for (let appName of appNames) {
      const dep = appName !== heroku.appname;
      console.log("migrate till done", appName, "of", appNames, "dep", dep);
      const result = await migrateTillDone(appName, false, dep);
      console.log("migrate till done result", appName, "of", appNames, result);
      if (!result.done) allDone = false;
    }

    resolve({ allDone });
  });
}

function pauseMinute(minute) {
  return new Promise((resolve) => setTimeout(resolve, minute * 60 * 1000));
}

async function migrateTillDoneManyRetry(appNamesOpt, retriesOpt) {
  const retries =
    retriesOpt || envIntElse("MIGRATE_TILL_DONE_MANY_RETIRES", 18);

  do {
    console.log("migrate till done many, retries left", retries);

    const result = await migrateTillDoneMany(appNamesOpt);

    console.log({ result });

    if (result.allDone) {
      console.log("migrate till done many done, retries left", retries);
      return;
    }

    retries--;

    await pauseMinute(envIntElse("MIGRATE_TILL_DONE_MANY_RETRY_PAUSE", 10));
  } while (retries >= 0);
}

async function interpreter() {
  console.log(command, argv, defaultTokenName);

  if (command === "create") {
    const result = await createApp(appName);
    if (result.message) {
      console.log("could not create", appName, result.message);
    } else {
      console.log("created", appName, "id", result.id);
    }
  } else if (command === "del") {
    const result = await delApp(appName);
    if (result.message) {
      console.log("could not delete", appName, result.message);
    } else {
      console.log("deleted", appName);
    }
  } else if (command === "build") {
    const result = await buildApp(appName, targzurl);
    console.log("build", appName, result.status);
  } else if (command === "deploy") {
    const result = await deployApp(appName);
    console.log(result);
  } else if (command === "csb") {
    createConfigAndBuildConfirmed();
  } else if (command === "schema") {
    getSchema();
  } else if (command === "getconfig") {
    getConfig(appName);
  } else if (command === "setconfig") {
    const result = await setConfig(appName);
    console.log("config set", appName, "keys", Object.keys(result).length);
  } else if (command === "getapps") {
    getApps();
  } else if (command === "getallapps") {
    getAllApps();
  } else if (command === "gettokens") {
    log(getAllTokens());
  } else if (command === "getlogs") {
    getLogs(appName);
  } else if (command === "getbuilds") {
    getBuilds(appName);
  } else if (command === "restartall") {
    restartAllDynos(appName);
  } else if (command === "acc") {
    getAccount();
  } else if (command === "quota") {
    getQuota();
  } else if (command === "richquota") {
    getRichQuota();
  } else if (command === "allrichquotas") {
    const result = await getAllRichQuotas();
    console.log(result);
  } else if (command === "migrate") {
    const result = await migrate(appName, argv.del, argv.dep);
    console.log(result);
  } else if (command === "migratetill") {
    const result = await migrateTillDone(appName, argv.del, argv.dep);
    console.log(result);
  } else if (command === "migratetillmany") {
    const result = await migrateTillDoneMany();
    console.log(result);
  } else {
    console.error("unknown command");
  }
}

if (require.main !== module) {
  module.exports = {
    getApps,
    getAllTokens,
    getAllApps,
    createApp,
    delApp,
    getLogs,
    getBuilds,
    buildApp,
    deployApp,
    getConfig,
    setConfig,
    restartAllDynos,
    getAccount,
    getQuota,
    getRichQuota,
    getAllRichQuotas,
    migrate,
    migrateTillDone,
    migrateTillDoneMany,
    migrateTillDoneManyRetry,
  };
} else {
  interpreter();
}