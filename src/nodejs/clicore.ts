import { GitHubAccountManager } from "./github";
import { HerokuAppManager, APP_CONF } from "./heroku";
import { randUserName } from "../shared/randusername";
import { DEFAULT_REPO_NAME, gitUrl, SCRIPT_LINEFEED } from "../shared/config";
import { FORK_ALL_DELAY, CURRENT_GIT_BRANCH } from "./config";

import fs from "fs";

import { writeJson } from "./utils";
import { pause } from "../shared/utils";

import gitConfigParser from "parse-git-config";
import { storeCryptEnv, getCryptEnv, CRYPTENV } from "./crypto";
import { PACKAGE_JSON } from "./config";

//////////////////////////////////////////////////////////////////

export const UPLOAD_APPTARGZ_ACCOUNT = "pythonideasalt";
export const CONFIG_ACCOUNT = "pythonideasalt";
export const OLD_CONFIG_ACCOUNT = "browsercapturesalt";
export const APP_NAME = "vuetsexpress";

//////////////////////////////////////////////////////////////////

export function exportConfig(config: any) {
  if (Array.isArray(config)) {
    return (
      config
        .map((key: string, i: number) => `export ${key}="${process.env[key]}"`)
        .join(SCRIPT_LINEFEED) + SCRIPT_LINEFEED
    );
  } else {
    let i = 0;
    return (
      Object.keys(config)
        .map((key: string) => `export ${key}="${config[key]}"`)
        .join(SCRIPT_LINEFEED) + SCRIPT_LINEFEED
    );
  }
}

export function forkAll(gitMan: GitHubAccountManager) {
  return new Promise(async (resolve) => {
    const parsed = parseGitConfig();
    const originGitUserName = parsed.originGitUserName;

    if (!originGitUserName) {
      resolve({ error: "no origin git user name" });
      return;
    }

    const accs = gitMan.accounts
      .filter((acc) => acc.gitUserName !== originGitUserName)
      .filter((acc) => PACKAGE_JSON.forks.github.includes(acc.gitUserName));

    if (!accs.length) {
      resolve({ error: "no fork accounts" });
      return;
    }

    for (const acc of accs) {
      console.log("deleting", DEFAULT_REPO_NAME, "at", acc.gitUserName);

      await acc.deleteRepo(DEFAULT_REPO_NAME);

      await pause(FORK_ALL_DELAY);

      await acc.deleteRepo(DEFAULT_REPO_NAME + "-1");

      await pause(FORK_ALL_DELAY);

      console.log("forking", DEFAULT_REPO_NAME, "at", acc.gitUserName);

      await acc.forkRepo(originGitUserName, DEFAULT_REPO_NAME);
    }

    resolve({ done: true });
  });
}

export function parseGitConfig() {
  const parsed = gitConfigParser.sync();

  const remoteOrigin = parsed[`remote "origin"`];

  if (remoteOrigin) {
    const url = remoteOrigin.url;
    if (url) {
      parsed.originUrl = url;
      const m = url.match(/^https:\/\/github.com\/([^\/]+)/);
      if (m) {
        parsed.originGitUserName = m[1];
      }
    }
  }

  return {
    parsed,
    originUrl: parsed.originUrl,
    originGitUserName: parsed.originGitUserName,
  };
}

//////////////////////////////////////////////////////////////////

export class Command {
  name: string;
  description: string;
  positional: string[] = [];
  named: { [key: string]: string } = {};
  exec: (arvg: any) => Promise<any> = (argv: any) =>
    Promise.resolve({ ok: true });
  prepare: (() => void) | undefined;

  constructor(
    name: string,
    description: string,
    positional: string[],
    named: { [key: string]: string },
    exec?: (arvg: any) => Promise<any>,
    prepare?: () => void
  ) {
    this.name = name;
    this.description = description;
    this.positional = positional;
    this.named = named;
    this.exec = exec || this.exec;
    this.prepare = prepare;
  }

  toString() {
    const items = [];
    if (this.name) {
      items.push(`${this.name} : ${this.description}`);
    }
    if (this.positional.length) {
      items.push(
        this.positional
          .map((pos: string, i: number) => `  [${i}] : ${pos}`)
          .join("\n")
      );
    }
    if (Object.keys(this.named).length) {
      items.push(
        Object.keys(this.named)
          .map((key: string) => `  --${key} : ${this.named[key]}`)
          .join("\n")
      );
    }
    return items.join("\n");
  }
}

//////////////////////////////////////////////////////////////////

function _exportpush(argv: any) {
  return new Promise((resolve) => {
    if (!CURRENT_GIT_BRANCH) {
      const stdout = `echo "no current branch to push to${SCRIPT_LINEFEED}exit 1${SCRIPT_LINEFEED}"`;

      resolve({ stdout });

      return;
    }

    const providers = Object.keys(PACKAGE_JSON.forks);
    const stdout =
      providers
        .map((provider) =>
          PACKAGE_JSON.forks[provider].map((fork: string) => {
            const tokenName = `${fork.toUpperCase()}_${provider.toUpperCase()}_TOKEN_FULL`;
            const password = CRYPTENV[tokenName];
            const pushUrl = gitUrl(fork, DEFAULT_REPO_NAME, provider, password);
            return `git push "${pushUrl}" ${CURRENT_GIT_BRANCH}${
              process.env.FORCE_PUSH ? " --force" : ""
            }`;
          })
        )
        .flat()
        .join(SCRIPT_LINEFEED) + SCRIPT_LINEFEED;

    resolve({ stdout });
  });
}

function _restart(argv: any) {
  process.exit(0);
  return Promise.resolve({});
}

function _scripts(argv: any) {
  return Promise.resolve(PACKAGE_JSON.scripts);
}

function _addscript(argv: any) {
  return new Promise((resolve) => {
    const name = argv._[1];
    const script = argv._[2];
    if (!name) {
      resolve({ error: "missing script name" });
    }
    if (!script) {
      resolve({ error: "missing script" });
    }
    PACKAGE_JSON.scripts[name] = script;
    writeJson("package.json", PACKAGE_JSON);
    resolve(PACKAGE_JSON.scripts);
  });
}

function _delscript(argv: any) {
  return new Promise((resolve) => {
    const name = argv._[1];
    if (!name) {
      resolve({ error: "missing script name" });
    }
    delete PACKAGE_JSON.scripts[name];
    writeJson("package.json", PACKAGE_JSON);
    resolve(PACKAGE_JSON.scripts);
  });
}

function _gitconfig(argv: any) {
  return new Promise((resolve) => {
    const parsed = parseGitConfig();

    resolve(parsed);
  });
}

function _originurl(argv: any) {
  return new Promise((resolve) => {
    const parsed = parseGitConfig();

    console.log(parsed.originUrl);

    process.exit(0);
  });
}

function _exportconfig(argv: any) {
  return new Promise((resolve) => {
    console.log(exportConfig(APP_CONF.config));

    process.exit(0);
  });
}

function _exportcryptenv(argv: any) {
  return new Promise((resolve) => {
    /*fs.writeFileSync("clistdout", exportConfig(CRYPTENV))
    resolve({ok:true})
    return*/

    console.log(exportConfig(CRYPTENV));

    process.exit(0);
  });
}

function _addconfigkey(argv: any) {
  return new Promise((resolve) => {
    const key = argv._[1];
    if (key === undefined) {
      resolve({ error: "no key" });
      return;
    }
    if (APP_CONF.config.includes(key)) {
      resolve({ ok: "key already added" });
      return;
    }
    APP_CONF.config.push(key);
    APP_CONF.config.sort();
    writeJson("appconf.json", APP_CONF);
    resolve({ ok: "key added" });
  });
}

function _delconfigkey(argv: any) {
  return new Promise((resolve) => {
    const key = argv._[1];
    if (key === undefined) {
      resolve({ error: "no key" });
      return;
    }
    if (!APP_CONF.config.includes(key)) {
      resolve({ ok: "key already deleted" });
      return;
    }
    APP_CONF.config = APP_CONF.config.filter(
      (testKey: string) => testKey !== key
    );
    APP_CONF.config.sort();
    writeJson("appconf.json", APP_CONF);
    resolve({ ok: "key deleted" });
  });
}

function _getcryptenv(argv: any) {
  return new Promise((resolve) => {
    resolve(getCryptEnv());
  });
}

function _addconfigtocryptenv(argv: any) {
  return new Promise((resolve) => {
    const cryptenv = getCryptEnv();
    for (const key of APP_CONF.config) {
      cryptenv[key] = process.env[key];
    }
    storeCryptEnv(cryptenv);
    resolve(getCryptEnv());
  });
}

function _randuser(argv: any) {
  return new Promise((resolve) => {
    const limit = argv.limit ? parseInt(argv.limit) : 30;

    const randomUserName = randUserName(limit);

    resolve({ randomUserName });
  });
}

function _addkeytocryptenv(argv: any) {
  return new Promise((resolve) => {
    const key = argv._[1];
    if (key === undefined) {
      resolve({ error: "no key" });
      return;
    }
    const value = argv._[2];
    const cryptenv = getCryptEnv();
    cryptenv[key] = value;
    storeCryptEnv(cryptenv);
    resolve(getCryptEnv());
  });
}

//////////////////////////////////////////////////////////////////

const appMan: HerokuAppManager = new HerokuAppManager();

function initAppMan() {
  return appMan.init();
}

function _deploy(argv: any) {
  return new Promise((resolve) => {
    const appName = argv.name;
    appMan.deployApp(appName).then((result) => {
      resolve(result);

      return;
    });
  });
}

function _bestquota(argv: any) {
  return new Promise((resolve) => {
    const appName = argv.name;
    resolve(appMan.getBestQuota(appName));
  });
}

function _migratedec(argv: any) {
  return new Promise((resolve) => {
    const appName = argv.name;
    resolve(appMan.getMigrateDecision(appName));
  });
}

function _migrateonce(argv: any) {
  return new Promise((resolve) => {
    const appName = argv.name;
    resolve(appMan.migrateOnce(appName));
  });
}

function _migrate(argv: any) {
  return new Promise((resolve) => {
    const appName = argv.name;
    resolve(appMan.migrate());
  });
}

function _migrateall(argv: any) {
  return new Promise((resolve) => {
    const appName = argv.name;
    resolve(appMan.migrateAll());
  });
}

function _isbuilt(argv: any) {
  return new Promise((resolve) => {
    const appName = argv.name;
    resolve(appMan.isBuilt(appName));
  });
}

function _delunbuilt(argv: any) {
  return new Promise((resolve) => {
    const appName = argv.name;
    resolve(appMan.deleteUnbuilt(appName));
  });
}

function _delapp(argv: any) {
  return new Promise((resolve) => {
    const appName = argv.name;
    resolve(appMan.deleteApp(appName));
  });
}

//////////////////////////////////////////////////////////////////

const gitMan = new GitHubAccountManager();

function initGitMan() {
  return gitMan.init();
}

function _forkall(argv: any) {
  return new Promise(async (resolve) => {
    resolve(await forkAll(gitMan));
  });
}

function _configenv(argv: any) {
  return new Promise((resolve) => {
    const acc = gitMan.getAccountByGitUserName(CONFIG_ACCOUNT);

    if (!acc) {
      resolve({ stdout: "echo config account not available" });
      return;
    }

    acc
      .getGitContentJsonDec("blobs", `config/${APP_NAME}`, {})
      .then((blob: any) => {
        if (blob.content) {
          let stdout = "";
          for (const key in blob.content.heroku.token) {
            stdout += `export HEROKU_TOKEN_${key.toLocaleUpperCase()}="${
              blob.content.heroku.token[key]
            }"\n`;
          }
          for (const key in blob.content.github.token) {
            stdout += `export ${key.toLocaleUpperCase()}_GITHUB_TOKEN_FULL="${
              blob.content.github.token[key]
            }"\n`;
          }
          console.log(stdout);
          process.exit(0);
        } else {
          console.log(`echo "could not get config"`);
          process.exit(0);
        }
      });
  });
}

function _uploadapptargz(argv: any) {
  return new Promise((resolve) => {
    const acc = gitMan.getAccountByGitUserName(UPLOAD_APPTARGZ_ACCOUNT);

    if (!acc) {
      resolve({ error: "upload apptargz account not available" });
      return;
    }

    let apptargz;

    try {
      apptargz = fs.readFileSync("repo.tar.gz");
    } catch (err) {
      resolve({ error: "could not open repo.tar.gz" });

      return;
    }

    const appName = argv.appName || "vuetsexpress";

    acc
      .upsertGitContent("blobs", `apptargz/${appName}.tar.gz`, apptargz)
      .then((result) => {
        resolve(result);
      });
  });
}

function _commits(argv: any) {
  return new Promise((resolve) => {
    const acc = gitMan.getAccountByGitUserName(argv.user);

    if (!acc) {
      resolve({ error: "commits account not available" });
      return;
    }

    let page = parseInt(argv.page);
    if (isNaN(page)) page = 1;
    let perPage = parseInt(argv.perpage);
    if (isNaN(perPage)) perPage = 5;

    acc.getCommits(argv.repo, page, perPage).then((result: any) => {
      resolve(result);
    });
  });
}

function _oldconfig(argv: any) {
  return new Promise((resolve) => {
    const acc = gitMan.getAccountByGitUserName(OLD_CONFIG_ACCOUNT);

    if (acc) {
      acc
        .getGitContentJsonDec("blobs", "config", undefined)
        .then((result: any) => {
          if (result.error) {
            resolve({ exports: "", error: result.error });
            return;
          }

          const config = result.content;

          const keys = Object.keys(config);

          const exports = keys
            .map((key) => `gp env ${key.toUpperCase()}="${config[key]}"`)
            .join(SCRIPT_LINEFEED);

          fs.writeFileSync("oldconfig.sh", exports);

          for (const key of keys) {
            if (!APP_CONF.config.includes(key)) {
              APP_CONF.config.push(key);
            }
          }

          APP_CONF.config = APP_CONF.config.sort();

          fs.writeFileSync("appconf.json", JSON.stringify(APP_CONF, null, 2));

          resolve({ exportsLength: exports.length });
        });
    } else {
      resolve({ error: "account not found" });
    }
  });
}

//////////////////////////////////////////////////////////////////

export const COMMANDS = [
  new Command("help", "display help", [], {}),
  new Command("", "", [], { help: "display help" }),
  new Command("exportpush", "export git push commands", [], {}, _exportpush),
  new Command(
    "restart",
    "process exit ( used by web app for restarting server )",
    [],
    {},
    _restart
  ),
  new Command("scripts", "list package.json scripts", [], {}, _scripts),
  new Command(
    "addscript",
    "add package.json script",
    ["name", "script"],
    {},
    _addscript
  ),
  new Command(
    "delscript",
    "delete package.json script",
    ["name"],
    {},
    _delscript
  ),
  new Command("gitconfig", "parse git config", [], {}, _gitconfig),
  new Command("originurl", "parse git origin url", [], {}, _originurl),
  new Command(
    "exportconfig",
    "export process env of appconf config keys",
    [],
    {},
    _exportconfig
  ),
  new Command("exportcryptenv", "export cryptenv", [], {}, _exportcryptenv),
  new Command(
    "addconfigkey",
    "add key to appconf config",
    [],
    {},
    _addconfigkey
  ),
  new Command(
    "delconfigkey",
    "delete key from appconf config",
    [],
    {},
    _delconfigkey
  ),
  new Command("getcryptenv", "get crypt env", [], {}, _getcryptenv),
  new Command(
    "addconfigtocryptenv",
    "add process env of appconf config keys to cryptenv",
    [],
    {},
    _addconfigtocryptenv
  ),
  new Command(
    "randuser",
    "generate random username",
    [],
    { limit: "max length" },
    _randuser
  ),
  new Command(
    "addkeytocryptenv",
    "add key to cryptenv",
    ["key", "value"],
    {},
    _addkeytocryptenv
  ),
  new Command(
    "deploy",
    "deploy app",
    [],
    { name: "app name ( optional )" },
    _deploy,
    initAppMan
  ),
  new Command(
    "bestquota",
    "best quota for app",
    [],
    { name: "app name ( optional )" },
    _bestquota,
    initAppMan
  ),
  new Command(
    "migratedec",
    "migrate decision for app",
    [],
    { name: "app name ( optional )" },
    _migratedec,
    initAppMan
  ),
  new Command(
    "migrateonce",
    "migrate app once",
    [],
    { name: "app name ( optional )" },
    _migrateonce,
    initAppMan
  ),
  new Command("migrate", "migrate", [], {}, _migrate, initAppMan),
  new Command("migrateall", "migrate all", [], {}, _migrateall, initAppMan),
  new Command(
    "isbuilt",
    "is app built",
    [],
    { name: "app name ( optional )" },
    _isbuilt,
    initAppMan
  ),
  new Command(
    "delunbuilt",
    "delete unbuilt app",
    [],
    { name: "app name ( optional )" },
    _delunbuilt,
    initAppMan
  ),
  new Command(
    "delapp",
    "delete app",
    [],
    { name: "app name ( optional )" },
    _delapp,
    initAppMan
  ),
  new Command("forkall", "fork all", [], {}, _forkall, initGitMan),
  new Command(
    "configenv",
    "get encrypted github config",
    [],
    {},
    _configenv,
    initGitMan
  ),
  new Command(
    "uploadapptargz",
    "upload app targz",
    [],
    {},
    _uploadapptargz,
    initGitMan
  ),
  new Command(
    "commits",
    "get commits",
    [],
    {
      user: "git user ( required )",
      repo: "repo ( required )",
      page: "commits page ( optional, default = 1 )",
      perpage: "commits per page ( optional, max = 100 )",
    },
    _commits,
    initGitMan
  ),
  new Command("oldconfig", "get old config", [], {}, _oldconfig, initGitMan),
];

export class CommandInterpreter {
  commands: Command[] = [];

  constructor(commands?: Command[]) {
    if (commands) this.commands = commands;
  }

  help(): string {
    return (
      this.commands
        .map((command) => command.toString())
        .join("\n----------------------\n") + "\n"
    );
  }

  exec(argv: any) {
    return new Promise(async (resolve) => {
      const command = argv._[0];
      if (!command) {
        resolve(this.help());
        return;
      }

      const commandClass = this.commands.find((c) => c.name === command);

      if (commandClass) {
        if (commandClass.prepare) {
          await commandClass.prepare();
        }

        const result = await commandClass.exec(argv);

        resolve(result);
      } else {
        resolve({ error: "unknown command" });
      }
    });
  }
}

//////////////////////////////////////////////////////////////////

export const INTERPRETER = new CommandInterpreter(COMMANDS);

export function interpreter(argv: any) {
  return INTERPRETER.exec(argv);
}

//////////////////////////////////////////////////////////////////
