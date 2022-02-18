import { Db, Collection } from "./mongodb";
import { Router } from "./utils";
import { SseServer } from "./sse";
import _ from "lodash";
import { User, Match } from "../shared/models";
import { Serializable, Seek } from "../shared/models";
import { MAX_MATCHES_PER_USER, MAX_SEEKS } from "./config";
import { Login } from "./login";
import { typDeb } from "../shared/utils";

///////////////////////////////////////////////////////////////

export type ChessSetup = {
  appDb: Db;
  api: Router;
  sseServer: SseServer;
  login: Login;
};

export class Chess {
  appDb: Db;
  api: Router;
  sseServer: SseServer;
  login: Login;
  analysisColl: Collection;
  seeksColl: Collection;
  matchesColl: Collection;
  debounceSendSeeks = typDeb(this.sendSeeks.bind(this));

  constructor(cs: ChessSetup) {
    this.appDb = cs.appDb;
    this.api = cs.api;
    this.sseServer = cs.sseServer;
    this.login = cs.login;
    this.analysisColl = this.appDb.collection("analysis", {});
    this.seeksColl = this.appDb.collection("seeks", {
      onConnect: () => {
        return this.seeksColl.getAll();
      },
    });
    this.matchesColl = this.appDb.collection("matches", {
      onConnect: () => {
        return this.matchesColl.getAll();
      },
    });

    this.mount();
  }

  getAllSeeks() {
    return this.seeksColl.getAllLocalSync();
  }

  getAllMatches() {
    return this.matchesColl.getAllLocalSync();
  }

  getAllMatchesByUserId(userId: string) {
    const matches = this.matchesColl.getAllLocalSync();
    return matches.filter((match) => match.seek.user.id === userId);
  }

  getAllMatchesByAcceptorId(userId: string) {
    const matches = this.matchesColl.getAllLocalSync();
    return matches.filter((match) => match.seek.acceptor.id === userId);
  }

  getAllMatchesByUserOrAcceptorId(userId: string) {
    const matches = this.matchesColl.getAllLocalSync();
    return matches.filter(
      (match) =>
        match.seek.user.id === userId || match.seek.acceptor.id === userId
    );
  }

  getActiveSeeks() {
    const activeUserIds = this.login.getActiveUserIds();

    const activeSeeks = this.getAllSeeks().filter((s) => {
      if (s.user) {
        return activeUserIds.includes(s.user.id);
      } else {
        console.error("no user in seek", s);
        return false;
      }
    });

    return activeSeeks;
  }

  sendSeeksEvent() {
    return {
      kind: "seeks",
      numAllSeeks: this.getAllSeeks().length,
      seeks: this.getActiveSeeks(),
    };
  }

  sendSeeks() {
    this.sseServer.sendEventToAllConsumers(this.sendSeeksEvent());
  }

  sendMatchesEvent() {
    return {
      kind: "matches",
      matches: this.getAllMatches(),
    };
  }

  sendMatches() {
    this.sseServer.sendEventToAllConsumers(this.sendMatchesEvent());
  }

  async createSeek(req: any, res: any, seek: Seek, user: User) {
    seek.user = user;

    if (seek.del) {
      if (req.isAdmin) {
        const delResult = await this.seeksColl.deleteOneById(seek.id);
        this.sendSeeks();
        res.json({ deleted: true, seekId: seek.id, delResult });
      } else {
        res.json({ error: "Not Admin Authorized" });
      }

      return;
    }

    const existingSeek = this.seeksColl.getDocByIdLocalSync(seek.id);

    if (existingSeek) {
      const delResult = await this.seeksColl.deleteOneById(seek.id);

      if (existingSeek.user.id === user.id) {
        res.json({ seekId: seek.id, delResult });
        this.sendSeeks();
      } else {
        const seek = new Seek(existingSeek);
        const userMatches = this.getAllMatchesByUserOrAcceptorId(user.id);
        if (userMatches.length > MAX_MATCHES_PER_USER) {
          res.json({
            error: `Exceeded max matches per user quota ${MAX_MATCHES_PER_USER} .`,
          });
          return;
        }
        const seekUserMatches = this.getAllMatchesByUserOrAcceptorId(
          seek.user.id
        );
        if (seekUserMatches.length > MAX_MATCHES_PER_USER) {
          res.json({
            error: `Exceeded max matches per seek creator quota ${MAX_MATCHES_PER_USER} .`,
          });
          return;
        }
        seek.acceptor = user;
        const match = new Match();
        match.seek = seek;
        const blob = match.serialize();
        const createMatchResult = await this.matchesColl.setDocById(
          match.id,
          blob
        );
        res.json({ seekId: seek.id, delResult, createMatchResult });
        this.sendSeeks();
        this.sendMatches();
      }
    } else {
      const countOwn = this.seeksColl.getAllLocalSync().filter((doc) => {
        if (doc.user) {
          return doc.user.id === user.id;
        } else {
          console.error("no user in seek", doc);
          return false;
        }
      }).length;
      if (countOwn >= MAX_SEEKS) {
        res.json({ error: `You can create at most ${MAX_SEEKS} seek(s).` });
        return;
      }

      const blob = seek.serialize();
      const createResult = await this.seeksColl.setDocById(seek.id, blob);

      res.json({ createResult, seekId: seek.id });
      this.sendSeeks();
    }
  }
  mount() {
    this.api.postAuth("/msg", (req: any, res: any) => {
      const user = req.user.cloneLight();
      this.api.checkAdmin(req);

      const msgObject = Serializable.fromBlob(req.body);

      if (msgObject === undefined) {
        res.json({ error: "unknown message" });
      } else {
        if (msgObject instanceof Seek) {
          this.createSeek(req, res, msgObject, user);
        }
      }
    });

    this.api.postAuth("/storeanalysis", (req: any, res: any) => {
      const id = req.user.id;

      this.analysisColl
        .setDocById(id, { game: req.body.game })
        .then((result) => {
          res.json(result);
        });
    });

    this.api.postAuth("/getanalysis", (req: any, res: any) => {
      const id = req.user.id;

      this.analysisColl.getDocById(id, "lr").then((result) => {
        if (result) {
          res.json(result);
        } else {
          res.json({ game: false });
        }
      });
    });

    this.api.post("/getseeks", (req: any, res: any) => {
      res.json(this.sendSeeksEvent());
    });

    this.api.post("/getmatches", (req: any, res: any) => {
      res.json(this.sendMatchesEvent());
    });

    this.api.postAdmin("/delseeks", (req: any, res: any) => {
      this.seeksColl.drop().then((result: any) => {
        this.sendSeeks();

        res.json(result);

        process.exit(0);
      });
    });

    this.api.postAdmin("/delmatches", (req: any, res: any) => {
      this.matchesColl.drop().then((result: any) => {
        res.json(result);

        process.exit(0);
      });
    });

    this.api.postAdmin("/delanalysis", (req: any, res: any) => {
      this.analysisColl.drop().then((result: any) => {
        this.sendSeeks();

        res.json(result);

        process.exit(0);
      });
    });

    this.login.activeUsersChangedDispatcher.subsrcibe(
      this.debounceSendSeeks.bind(this)
    );

    return this;
  }
}
