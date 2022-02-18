import { Db, Collection } from "./mongodb";
import { Router, fetchJson, EventDispatcher } from "./utils";
import { SseServer } from "./sse";
import { randUserName } from "../shared/randusername";
import { uid, areStringArraysEqual, typDeb } from "../shared/utils";
import {
  MAX_ANON_LOGINS_FROM_IP,
  LOGIN_INTERVAL,
  CHECK_LICHESS_PROFILE_AFTER,
} from "./config";
import _ from "lodash";
import { User, AppData, POSSIBLE_TITLES } from "../shared/models";
import { APP_CONF, HerokuAppManager } from "./heroku";
import { interpreter } from "./clicore";

//////////////////////////////////////////////////////////////

export const lichessHost = "https://lichess.org";
const MAX_USERNAME_LENGTH = 20;

//////////////////////////////////////////////////////////////

export type LoginSetup = {
  appDb: Db;
  api: Router;
  sseServer: SseServer;
};

export class Login {
  appDb: Db;
  api: Router;
  sseServer: SseServer;
  userIdsColl: Collection;
  usersColl: Collection;
  appDataColl: Collection;
  remoteStorageColl: Collection;
  activeUsersChangedDispatcher = new EventDispatcher();
  anonLogins: { [key: string]: number } = {};

  lastSeens: { [key: string]: number } = {};

  lastActives: string[] = [];

  debounceSendActiveUsersToAll = typDeb(this.sendActiveUsers.bind(this));

  constructor(ls: LoginSetup) {
    this.appDb = ls.appDb;
    this.api = ls.api;
    this.sseServer = ls.sseServer;
    this.userIdsColl = this.appDb.collection("userids", {
      onConnect: this.userIdsConnected.bind(this),
    });
    this.usersColl = this.appDb.collection("users", {
      onConnect: this.usersConnected.bind(this),
    });
    this.appDataColl = this.appDb.collection("appdata", {
      onConnect: this.appDataConnected.bind(this),
    });
    this.remoteStorageColl = this.appDb.collection("remotestorage", {});

    this.mount();
  }

  async userIdsConnected() {
    return Promise.resolve(true);
  }

  async usersConnected() {
    return Promise.resolve(true);
  }

  async appDataConnected() {
    await this.appDataColl.getAll();

    for (const key in APP_CONF.apps) {
      this.appDataColl.docs[key] = new AppData({
        name: key,
        targzUrl: APP_CONF.apps[key].targzUrl,
      });
    }

    return Promise.resolve(true);
  }

  getActiveUserIds() {
    const now = Date.now();
    return Object.keys(this.lastSeens).filter(
      (id) => now - this.lastSeens[id] < 2 * LOGIN_INTERVAL
    );
  }

  getUsersByIds(ids: string[]): User[] {
    return ids.map((id) => new User(this.usersColl.docs[id]));
  }

  getActivUsers(): User[] {
    return this.getUsersByIds(this.getActiveUserIds());
  }

  sendActiveUsersEvent() {
    const ev = {
      kind: "activeusers",
      activeUsers: this.getActivUsers().map((user) =>
        user.cloneLight().serialize()
      ),
    };

    return ev;
  }

  sendActiveUsers() {
    this.sseServer.sendEventToAllConsumers(this.sendActiveUsersEvent());
  }

  checkActivesChanged() {
    const actives = this.getActiveUserIds();

    if (!areStringArraysEqual(actives, this.lastActives)) {
      this.activeUsersChangedDispatcher.dispatch({ actives });
      this.debounceSendActiveUsersToAll();
      this.sseServer.sendEventToAllConsumers({
        kind: "announce",
        announce: `Active users changed, ${actives.length} user(s) online.`,
      });
    }

    this.lastActives = actives;
  }

  setUser(res: any, user: User) {
    this.lastSeens[user.id] = Date.now();

    this.checkActivesChanged();

    res.json(user.serialize());
  }

  setRandUser(res: any) {
    const token = uid();
    const id = uid();
    const username = randUserName(MAX_USERNAME_LENGTH);

    this.userIdsColl.setDocById(token, {
      id,
    });

    const user = new User({
      id,
      username,
    });

    user.token = "?";

    this.usersColl.setDocById(id, user.serialize());

    user.token = token;

    this.setUser(res, user);
  }

  getLichessAccount(token: string) {
    return new Promise(async (resolve) => {
      const accountResp = await fetchJson({
        url: `${lichessHost}/api/account`,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (accountResp.ok) {
        const account = accountResp.json;

        if (account.error) {
          resolve({ error: account.error });
        } else {
          resolve({ account });
        }
      } else {
        resolve({ error: "Fetch Error" });
      }
    });
  }

  async login(req: any, res: any) {
    const token = req.body.token;
    const existingToken = await this.userIdsColl.getDocById(token, "lr");

    if (existingToken) {
      const userId = existingToken.id;

      const existingUser = await this.usersColl.getDocById(userId, "lr");

      if (existingUser) {
        const user = new User(existingUser);

        user.token = token;

        this.setUser(res, user);

        if (user.lichessCheckedAt && !user.lichessProfile) return;

        if (Date.now() - user.lichessCheckedAt > CHECK_LICHESS_PROFILE_AFTER) {
          const account: any = await this.getLichessAccount(token);
          if (!account.error) {
            user.id = userId;
            user.lichessProfile = account.account;
            this.usersColl.setDocById(userId, user.serialize());
          }
        }

        return;
      } else {
        console.error("fatal, token exists without user");

        this.setRandUser(res);

        return;
      }
    }

    const account: any = await this.getLichessAccount(token);

    if (account.error) {
      // https://stackoverflow.com/questions/10849687/express-js-how-to-get-remote-client-address
      const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

      console.log("anon login from ip", ip);

      if (this.anonLogins[ip]) {
        this.anonLogins[ip]++;
        if (this.anonLogins[ip] > MAX_ANON_LOGINS_FROM_IP) {
          res.json({
            error: `Exceeded max anon logins from ip quota ( ${MAX_ANON_LOGINS_FROM_IP} ) .`,
          });
          return;
        }
      } else {
        this.anonLogins[ip] = 1;
      }

      this.setRandUser(res);
    } else {
      const lichessProfile = account.account;

      const userId = lichessProfile.id;
      const username = lichessProfile.username;

      this.userIdsColl.setDocById(token, {
        id: userId,
      });

      const userDoc = await this.usersColl.getDocById(userId, "lr");
      const user = userDoc
        ? new User(userDoc)
        : new User({
            id: userId,
            username,
            lichessCheckedAt: Date.now(),
          });

      user.lichessProfile = lichessProfile;

      user.token = "?";

      this.usersColl.setDocById(userId, user.serialize());

      user.token = token;

      this.setUser(res, user);
    }
  }

  checkLogin(req: any) {
    return new Promise(async (resolve) => {
      const token = req.body.token || req.body.USER_TOKEN;
      const existingToken = await this.userIdsColl.getDocById(token, "lr");

      if (!existingToken) {
        resolve({ error: "Not Autherticated User", status: "token not found" });

        return;
      }

      const userId = existingToken.id;
      const existingUser = await this.usersColl.getDocById(userId, "lr");

      if (!existingUser) {
        resolve({ error: "Not Autherticated User", status: "user not found" });

        return;
      }

      const user = new User(existingUser);

      resolve({ user });
    });
  }

  mount() {
    this.api.setCheckLogin(this.checkLogin.bind(this));

    this.api.post("/login", (req: any, res: any) => {
      this.login(req, res);
    });

    this.api.post("/getactiveusers", (req: any, res: any) => {
      res.json(this.sendActiveUsersEvent());
    });

    this.api.post("/getallusers", async (req: any, res: any) => {
      const allUsers = await this.usersColl.getAll();
      res.json({ POSSIBLE_TITLES, allUsers });
    });

    this.api.postAdmin("/settitle", async (req: any, res: any) => {
      const { id, title } = req.body.user;
      const user = await this.usersColl.getDocById(id, "lr");
      if (!user) {
        res.json({ error: "no such user" });
        return;
      }
      user.title = title;
      const setUserResult = await this.usersColl.setDocById(id, user);
      res.json({ user, setUserResult });
    });

    this.api.postAdmin("/deluser", async (req: any, res: any) => {
      const id = req.body.user.id || req.body.user.userId;
      const delResult = await this.usersColl.deleteOneById(id);
      res.json({ delResult });
    });

    this.api.postAdmin("/delusers", (req: any, res: any) => {
      Promise.all([
        this.userIdsColl.drop(),
        this.usersColl.drop(),
        this.remoteStorageColl.drop(),
      ]).then((result: any) => {
        res.json(result);

        process.exit(0);
      });
    });

    this.api.postAuth("/setremotestorage", async (req: any, res: any) => {
      const userId = req.user.id;
      const { key, value } = req.body;
      const stored = await this.remoteStorageColl.getDocById(userId, "lr");
      const storage = stored || {};
      storage[key] = value;
      this.remoteStorageColl.setDocById(userId, storage).then((result) => {
        res.json(result);
      });
    });

    this.api.postAuth("/getremotestorage", async (req: any, res: any) => {
      const userId = req.user.id;
      const { key, defOpt, getAll } = req.body;
      const def = defOpt || {};
      const stored = await this.remoteStorageColl.getDocById(userId, "lr");
      if (stored !== undefined) {
        const value = getAll ? stored : stored[key];
        if (value !== undefined) {
          res.json({ value });
        } else {
          res.json({ value: def });
        }
      } else {
        res.json({ value: def });
      }
    });

    this.api.postAdmin("/getappdata", (req: any, res: any) => {
      res.json(this.appDataColl.getAllLocalSync());
    });

    this.api.postAdmin("/addappdata", (req: any, res: any) => {
      const appData = new AppData(req.body.appData);
      this.appDataColl
        .setDocById(appData.name, appData.serialize())
        .then((result: any) => {
          res.json(this.appDataColl.getAllLocalSync());
        });
    });

    this.api.postAdmin("/deployapp", async (req: any, res: any) => {
      console.log("deployapp", req.body);

      const appMan = new HerokuAppManager();

      await appMan.init();

      const appData = new AppData(req.body.appData);

      appMan.deployApp(appData.name, {
        deployTo: req.body.herokuAccountName,
        targzUrl: appData.targzUrl,
      });

      res.json(this.appDataColl.getAllLocalSync());
    });

    this.api.postAdmin("/cancelbuild", async (req: any, res: any) => {
      const { appName, buildId } = req.body;

      console.log("cancel build", req.body, appName, buildId);

      const appMan = new HerokuAppManager();

      await appMan.init();

      const cancelResult = await appMan.cancelBuild(appName, buildId).then();

      res.json(cancelResult);
    });

    this.api.postAdmin("/setstack", async (req: any, res: any) => {
      const { app, stack } = req.body;

      const appName = app.name;

      console.log("set stack", req.body, appName, stack);

      const appMan = new HerokuAppManager();

      await appMan.init();

      const setStackResult = await appMan.setStack(appName, stack).then();

      res.json(setStackResult);
    });

    this.api.postAdmin("/cli", async (req: any, res: any) => {
      const commandLine = req.body.commandLine || "";
      const args = commandLine.split(" ");
      const argv = require("minimist")(args);
      console.log(argv);
      const result = await interpreter(argv);
      res.json({ result });
    });

    setInterval(this.checkActivesChanged.bind(this), LOGIN_INTERVAL / 2);

    return this;
  }
}
