import { MongoClient } from "mongodb";
import { Logger, areStringArraysEqual } from "../shared/utils";
import { IS_DEV } from "./config";
import { CRYPTENV } from "./crypto";

////////////////////////////////////////////////////////////////////////

export const DEFAULT_MONGODB_URI_DEFAULT = "mongodb://localhost:27017";

export const DEFAULT_MONGODB_URI = IS_DEV
  ? DEFAULT_MONGODB_URI_DEFAULT
  : CRYPTENV.MONGODB_URI || DEFAULT_MONGODB_URI_DEFAULT;

export type MongoConfig = {
  MONGODB_URI?: string;
  logger?: Logger;
};

export const DEFAULT_MONGO_CONFIG: MongoConfig = {
  MONGODB_URI: DEFAULT_MONGODB_URI,
  logger: new Logger({ owner: "mongoclient" }),
};

////////////////////////////////////////////////////////////////////////

export class Client {
  config: MongoConfig = DEFAULT_MONGO_CONFIG;
  logger = new Logger({ owner: "mongoclient" });

  client: any = undefined;

  dbs: Db[] = [];

  constructor(configOpt?: MongoConfig) {
    if (configOpt) this.config = { ...DEFAULT_MONGO_CONFIG, ...configOpt };

    if (this.config.logger) {
      this.logger = this.config.logger;
    }

    const uri = this.config.MONGODB_URI || DEFAULT_MONGODB_URI;

    this.client = new MongoClient(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    } as any);
  }

  listDbs() {
    return this.client.db().admin().listDatabases();
  }

  connect() {
    return new Promise((resolve) => {
      this.client.connect((err: any) => {
        if (err) {
          const report = {
            status: "MongoDb connection failed",
            error: err,
            success: false,
          };
          this.logger.log(report);
          resolve(report);
        } else {
          this.logger.log({ mongoDbConnected: true });
          Promise.all(
            [this.listDbs()].concat(this.dbs.map((db) => db.onConnect()))
          ).then((result) => {
            resolve({
              error: false,
              success: true,
              onConnect: result.slice(1),
              dbs: JSON.stringify(
                result[0].databases.map((db: any) => db.name)
              ),
            });
          });
        }
      });
    });
  }

  db(name: string) {
    const db = new Db(name, this);
    this.dbs.push(db);
    return db;
  }
}

type Doc = { [key: string]: any };
type DocOpt = Doc | undefined;

type GetDocStrategy = "l" | "lr";

export type CollectionConfig = {
  onConnect?: any;
};

export const DEFAULT_COLLECTION_CONFIG: CollectionConfig = {};

export class Collection {
  name: string;
  parentDb: Db;
  collection: any;
  config: CollectionConfig = DEFAULT_COLLECTION_CONFIG;
  docs: { [id: string]: Doc } = {};
  getAllPerformed = false;
  lastIds: string[] = [];

  constructor(name: string, parentDb: Db, configOpt?: CollectionConfig) {
    this.name = name;
    this.parentDb = parentDb;
    this.collection = parentDb.db.collection(name);
    if (configOpt) this.config = { ...DEFAULT_COLLECTION_CONFIG, ...configOpt };
  }

  docIds() {
    return Object.keys(this.docs);
  }

  idsChanged() {
    const ids = this.docIds();
    const changed = areStringArraysEqual(ids, this.lastIds);
    this.lastIds = ids;
    return changed;
  }

  drop() {
    return new Promise((resolve) => {
      this.collection.drop().then((result: any) => {
        this.docs = {};

        resolve(result);
      });
    });
  }

  getDocByIdLocalSync(id: string) {
    return this.docs[id];
  }

  private getDocByIdLocal(id: string): Promise<DocOpt> {
    return Promise.resolve(this.getDocByIdLocalSync(id));
  }

  private getDocByIdRemote(id: string): Promise<DocOpt> {
    return new Promise((resolve) => {
      this.collection.findOne({ _id: id }).then((result: any) => {
        if (result) {
          this.docs[id] = result;
          resolve(result);
        } else {
          delete this.docs[id];
          resolve(undefined);
        }
      });
    });
  }

  async getDocById(id: string, gds: GetDocStrategy): Promise<DocOpt> {
    const local = await this.getDocByIdLocal(id);
    if (local !== undefined || gds === "l") return Promise.resolve(local);
    return this.getDocByIdRemote(id);
  }

  private setDocByIdLocal(id: string, set: Doc): Promise<any> {
    return new Promise(async (resolve) => {
      const local = await this.getDocByIdLocal(id);
      if (local !== undefined) {
        this.docs[id] = { ...local, ...set };
      } else {
        this.docs[id] = set;
      }
      resolve({ coll: this.name, id, set });
    });
  }

  private setDocByIdRemote(id: string, set: Doc): Promise<any> {
    return new Promise((resolve) => {
      this.collection
        .updateOne(
          { _id: id },
          {
            $set: set,
          },
          {
            upsert: true,
          }
        )
        .then((result: any) => {
          if (this.docs[id] !== undefined) {
            this.docs[id] = { ...this.docs[id], ...set };
          } else {
            this.docs[id] = set;
          }
          resolve(result);
        })
        .catch((err: any) => {
          resolve(err);
        });
    });
  }

  setDocById(id: string, set: Doc): Promise<any> {
    return this.setDocByIdRemote(id, set);
  }

  private deleteOneByIdLocal(id: string): Promise<any> {
    if (this.docs[id]) {
      delete this.docs[id];
    }
    return Promise.resolve({ deleted: id });
  }

  private deleteOneByIdRemote(id: string): Promise<any> {
    return new Promise((resolve) => {
      this.collection.deleteOne({ _id: id }).then((result: any) => {
        resolve(result);
      });
    });
  }

  async deleteOneById(id: string): Promise<any> {
    await this.deleteOneByIdLocal(id);
    return this.deleteOneByIdRemote(id);
  }

  private getAllLocal(): Promise<Doc[]> {
    return Promise.resolve(Object.keys(this.docs).map((id) => this.docs[id]));
  }

  getAllLocalSync() {
    return Object.keys(this.docs).map((id) => this.docs[id]);
  }

  private getAllRemote(): Promise<Doc[]> {
    return new Promise((resolve) => {
      this.collection.find({}).toArray((err: any, result: any) => {
        if (err) {
          resolve([]);
        }

        resolve(result);
      });
    });
  }

  getAll(): Promise<Doc[]> {
    if (this.getAllPerformed) return this.getAllLocal();
    return new Promise((resolve) => {
      this.getAllRemote().then((docs) => {
        this.docs = {};
        for (const doc of docs) {
          this.docs[doc["_id"]] = doc;
        }
        this.getAllPerformed = true;
        resolve(docs);
      });
    });
  }

  onConnect() {
    return new Promise(async (resolve) => {
      let onConnectResult;
      if (this.config.onConnect) {
        onConnectResult = await this.config.onConnect();
      }
      const report = { coll: this.name, connected: true, onConnectResult };
      //this.parentDb.parentClient.logger.log(report, "mongocoll");
      resolve(report);
    });
  }
}

export type DbConfig = {};

export const DEFAULT_DB_CONFIG: DbConfig = {};

export class Db {
  name: string;
  parentClient: Client;

  config: DbConfig = DEFAULT_DB_CONFIG;

  db: any;

  collections: Collection[] = [];

  constructor(name: string, parentClient: Client, configOpt?: DbConfig) {
    this.name = name;
    this.parentClient = parentClient;
    if (configOpt) this.config = { ...DEFAULT_DB_CONFIG, configOpt };
    this.db = this.parentClient.client.db(name);
  }

  drop() {
    return new Promise((resolve) => {
      this.db.dropDatabase().then((result: any) => {
        resolve(result);
      });
    });
  }

  collection(name: string, configOpt?: CollectionConfig) {
    const coll = new Collection(name, this, configOpt);
    this.collections.push(coll);
    return coll;
  }

  onConnect() {
    return new Promise((resolve) => {
      /*this.parentClient.logger.log(
        { db: this.name, connecting: true },
        "mongodb"
      );*/

      Promise.all(this.collections.map((coll) => coll.onConnect())).then(
        (result) => {
          resolve(result);
        }
      );
    });
  }
}
