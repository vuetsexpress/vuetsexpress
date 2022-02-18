import { GitHubAccountManager } from "./github";
import { HerokuAppManager, HEROKU_STACKS } from "./heroku";
import { Router } from "./utils";
import { CRYPTENV } from "./crypto";

/////////////////////////////////////////////////////////////////////////

const TIMESTAMP = Date.now();

/////////////////////////////////////////////////////////////////////////

export class Manager {
  api: Router = new Router();

  gitMan: GitHubAccountManager = new GitHubAccountManager();
  appMan: HerokuAppManager = new HerokuAppManager();

  constructor() {}

  init() {
    return new Promise((resolve) => {
      Promise.all([this.appMan.init(), this.gitMan.init()]).then((result) => {
        resolve(result);
      });
    });
  }

  mount(api: Router) {
    this.api = api;

    this.api.get("/timestamp", (req: any, res: any) => {
      res.json({ TIMESTAMP });
    });

    this.api.postAdmin("/checkadmin", (req: any, res: any) => {
      res.json({ admin: true });
    });

    this.api.postAdmin("/getglobalconfig", (req: any, res: any) => {
      const acc = this.gitMan.getAccountByGitUserName("pythonideasalt");

      if (acc) {
        acc
          .getGitContentJsonDec("blobs", "config/vuetsexpress", {})
          .then((blob) => {
            res.json(blob);
          });
      } else {
        res.json({ content: CRYPTENV });
      }
    });

    this.api.postAdmin("/setconfig", (req: any, res: any) => {
      const acc = this.gitMan.getAccountByGitUserName("pythonideasalt");

      if (acc) {
        acc
          .upsertGitContentJsonEnc(
            "blobs",
            "config/vuetsexpress",
            req.body.config || {}
          )
          .then((result) => {
            res.json(result);
          });
      } else {
        res.json({ error: "GitHub Account Missing" });
      }
    });

    this.api.postAdmin("/appman", (req: any, res: any) => {
      this.appMan.init().then((result) => {
        res.json(this.appMan.serialize());
      });
    });

    this.api.postAdmin("/gitman", (req: any, res: any) => {
      this.gitMan.init().then((result) => {
        res.json(this.gitMan.serialize());
      });
    });

    this.api.postAdmin("/allman", (req: any, res: any) => {
      Promise.all([this.appMan.init(), this.gitMan.init()]).then((result) => {
        res.json({
          appMan: this.appMan.serialize(),
          gitMan: this.gitMan.serialize(),
          HEROKU_STACKS,
        });
      });
    });

    this.api.postAdmin("/getcommits", (req: any, res: any) => {
      const acc = this.gitMan.getAccountByGitUserName(req.body.gitUserName);
      if (acc) {
        acc
          .getCommits(req.body.repo, req.body.page, req.body.perPage)
          .then((result) => {
            res.json(result);
          });
      } else {
        res.json({ error: "No Such Account" });
      }
    });

    this.api.postAdmin("/createrepo", (req: any, res: any) => {
      const acc = this.gitMan.getAccountByGitUserName(req.body.gitUserName);
      if (acc) {
        acc.createRepo(req.body).then((createResult) => {
          this.gitMan.init().then((result) => {
            res.json({
              createResult,
              gitMan: this.gitMan.serialize(),
            });
          });
        });
      } else {
        res.json({ error: "No Such Account" });
      }
    });

    this.api.postAdmin("/fork", (req: any, res: any) => {
      const acc = this.gitMan.getAccountByGitUserName(req.body.gitUserName);
      if (acc) {
        acc.forkRepo(req.body.owner, req.body.name).then((forkResult) => {
          setTimeout(() => {
            this.gitMan.init().then((result) => {
              res.json({
                forkResult,
                gitMan: this.gitMan.serialize(),
              });
            });
          }, 5000);
        });
      } else {
        res.json({ error: "No Such Account" });
      }
    });

    this.api.postAdmin("/deleterepo", (req: any, res: any) => {
      const acc = this.gitMan.getAccountByGitUserName(req.body.gitUserName);
      if (acc) {
        acc.deleteRepo(req.body.name).then((deleteResult) => {
          setTimeout(() => {
            this.gitMan.init().then((result) => {
              res.json({
                deleteResult,
                gitMan: this.gitMan.serialize(),
              });
            });
          }, 5000);
        });
      } else {
        res.json({ error: "No Such Account" });
      }
    });

    this.api.postAdmin("/getlogs", (req: any, res: any) => {
      this.appMan.getLogs(req.body.app.name).then((result) => {
        res.json(result);
      });
    });

    this.api.postAdmin("/getbuilds", (req: any, res: any) => {
      this.appMan.getBuilds(req.body.name).then((result) => {
        res.json(result);
      });
    });

    this.api.postAdmin("/deleteapp", (req: any, res: any) => {
      this.appMan.deleteApp(req.body.name).then(async (result) => {
        console.log("delete app result", result);
        await this.appMan.init();
        res.json({
          appMan: this.appMan.serialize(),
        });
      });
    });

    this.api.postAdmin("/restartalldynos", (req: any, res: any) => {
      this.appMan.restartAllDynos(req.body.name).then(async (result) => {
        console.log("restart all dynos result", result);
        res.json({
          restartAllDynosResult: result,
        });
      });
    });

    this.api.postAdmin("/getconfig", (req: any, res: any) => {
      this.appMan.getConfig(req.body.name).then((result) => {
        res.json(result);
      });
    });

    this.api.postAdmin("/setconfig", (req: any, res: any) => {
      this.appMan.setConfig(req.body.name, req.body.config).then((result) => {
        res.json(result);
      });
    });

    return this;
  }
}
