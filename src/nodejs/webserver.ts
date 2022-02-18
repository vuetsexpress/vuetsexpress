import express from "express";
import { Router } from "./utils";
import { SseServer } from "./sse";
import { Client } from "./mongodb";
import { Static } from "./static";
import { Manager } from "./manager";
import { Login } from "./login";
import { Chat } from "./chat";
import { Chess } from "./chess";
import { MINUTE, SECOND } from "../shared/time";
import {
  PORT,
  APP_DISPOSITION,
  IS_PROD,
  MIGRATE_INTERVAL_MINUTE,
  CURRENT_GIT_BRANCH,
} from "./config";
import { DEFAULT_APP_URL } from "./heroku";
import fetch from "node-fetch";

////////////////////////////////////////////////////////////////////

export function mountWebServer() {
  const APP_NAME = "vuetsexpress";

  const app = express();

  const router = new Router().mount("/", app);
  const api = new Router().mount("/api", app);

  new Static().mount(router);

  const sseServer = new SseServer().mount(api);

  const manager = new Manager().mount(api);

  const client = new Client();

  const appDb = client.db(APP_NAME);

  const login = new Login({
    appDb,
    api,
    sseServer,
  });

  new Chat({
    appDb,
    api,
    sseServer,
  });

  new Chess({
    appDb,
    api,
    sseServer,
    login,
  });

  ////////////////////////////////////////////////////////////////////
  // global routes

  api.postAdmin("/deldb", (req: any, res: any) => {
    console.log("deleting database");
    appDb.drop().then((result: any) => {
      res.json(result);

      process.exit(0);
    });
  });

  ////////////////////////////////////////////////////////////////////
  // init app

  const initItems: any[] = [];

  initItems.push(manager.init());
  initItems.push(client.connect());

  function init() {
    return new Promise((resolve) => {
      Promise.all(initItems)
        .then((initResult) => {
          resolve(initResult);
        })
        .catch((err) => {
          resolve({ error: err });
        });
    });
  }

  ////////////////////////////////////////////////////////////////////

  function migrate() {
    manager.appMan.migrateAll().then((result: any) => {
      console.log("migrate result", result);
      setTimeout(migrate, MIGRATE_INTERVAL_MINUTE * MINUTE);
    });
  }

  ////////////////////////////////////////////////////////////////////
  // start server

  init().then((initResult) => {
    //console.log({ initResult });

    if (IS_PROD) {
      console.log(
        "setting migrate interval",
        MIGRATE_INTERVAL_MINUTE,
        "minute(s)"
      );
      setInterval(
        () => manager.appMan.migrateAll(),
        MIGRATE_INTERVAL_MINUTE * MINUTE
      );

      console.log("setting keep alive interval", DEFAULT_APP_URL);
      setInterval(() => fetch(DEFAULT_APP_URL), 10 * MINUTE);
    }

    app.listen(PORT, () => {
      console.log(
        `< ${APP_NAME} > < ${APP_DISPOSITION} > < branch [ ${CURRENT_GIT_BRANCH} ] > listening on port < ${PORT} >`
      );

      if (IS_PROD) {
        setTimeout(migrate, 5 * SECOND);
      }
    });
  });
}
