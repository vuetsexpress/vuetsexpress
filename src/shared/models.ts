import { uid } from "./utils";
import {
  DEFAULT_VARIANT_KEY,
  DEFAUL_VARIANT_DISPLAY_NAME,
  DEFAULT_VARIANT_ALIAS_REGEX,
  DEFAULT_RATED,
  CHESSOPS_VARIANT_KEYS,
  DEFAULT_ROUNDS,
} from "./config";
import {
  DEFAULT_LOGIN_INTERVAL,
  DEFAULT_APP_NAME_DEFAULT,
  DEFAULT_TARGZ_URL,
} from "../shared/config";
import { Game_, Game, WHITE, BLACK } from "../chessops/index";

//////////////////////////////////////////////////////////

export type CHESSOPS_VARIANT_KEY = typeof CHESSOPS_VARIANT_KEYS[number];

export type Blob = { [key: string]: any };

export type JsonSerializable = Blob | string | number | boolean;

export const SERIALIZABLE_KINDS = [
  "timecontrol",
  "seek",
  "chatmessage",
  "user",
  "variant",
  "serializabletemplate",
  "match",
  "appdata",
] as const;

export type SERIALIZABLE_KIND = typeof SERIALIZABLE_KINDS[number];

//////////////////////////////////////////////////////////

export function desNum(blob: Blob, key: string, def: number) {
  if (typeof blob !== "object") return def;
  const value = blob[key];
  if (typeof value !== "number") return def;
  return value;
}

export function desStr(blob: Blob, key: string, def: string) {
  if (typeof blob !== "object") return def;
  const value = blob[key];
  if (typeof value !== "string") return def;
  return value;
}

//////////////////////////////////////////////////////////

export abstract class Serializable<T> {
  kind: SERIALIZABLE_KIND;
  id = uid();
  createdAt = Date.now();

  static fromBlob<T>(blob: Blob): Serializable<T> | undefined {
    if (blob) {
      const kind = blob.kind as SERIALIZABLE_KIND;
      switch (kind) {
        case "timecontrol":
          return new TimeControl(blob) as unknown as Serializable<T>;
        case "seek":
          return new Seek(blob) as unknown as Serializable<T>;
        case "chatmessage":
          return new ChatMessage(blob) as unknown as Serializable<T>;
        case "user":
          return new User(blob) as unknown as Serializable<T>;
        case "variant":
          return new Variant() as unknown as Serializable<T>;
        case "serializabletemplate":
          return new SerializableTemplate() as unknown as Serializable<T>;
        case "match":
          return new Match(blob) as unknown as Serializable<T>;
        default:
          return undefined;
      }
    } else {
      return undefined;
    }
  }

  constructor(kind: SERIALIZABLE_KIND) {
    this.kind = kind;
  }

  sameIdAs(s: Serializable<any>) {
    return s.id === this.id;
  }

  abstract serializeFunc(): Blob;

  abstract deserializeFunc(blob?: Blob): void;

  deserialize(blob?: Blob): T {
    if (!blob) return this as unknown as T;

    if (typeof blob === "object") {
      this.id = blob.id || this.id;
      this.createdAt = blob.createdAt || this.createdAt;

      this.deserializeFunc(blob);
    }

    return this as unknown as T;
  }

  serialize(): Blob {
    const blob = this.serializeFunc();

    blob.kind = this.kind;
    blob.id = this.id;
    blob.createdAt = this.createdAt;

    return blob;
  }
}

//////////////////////////////////////////////////////////

export class Variant extends Serializable<Variant> {
  chessopsKey: CHESSOPS_VARIANT_KEY = DEFAULT_VARIANT_KEY;
  displayName = "Variant";
  aliasRegex = "variant";

  static fromChessopsKey(chessopsKey: CHESSOPS_VARIANT_KEY) {
    return (
      ALLOWED_VARIANTS.find((v) => v.chessopsKey === chessopsKey) ||
      DEFAULT_VARIANT
    );
  }

  constructor(
    chessopsKey?: CHESSOPS_VARIANT_KEY,
    displayName?: string,
    aliasRegex?: string
  ) {
    super("variant");
    this.chessopsKey = chessopsKey || this.chessopsKey;
    this.displayName = displayName || this.displayName;
    this.aliasRegex = aliasRegex || this.aliasRegex;
  }

  serializeFunc() {
    return {
      chessopsKey: this.chessopsKey,
      displayName: this.displayName,
    };
  }

  deserializeFunc(blob: Blob) {
    this.chessopsKey = blob.chessopsKey || this.chessopsKey;
    this.displayName = blob.displayName || this.displayName;
  }
}

/////////////////////////////////////////////////////////

export const DEFAULT_VARIANT = new Variant(
  DEFAULT_VARIANT_KEY,
  DEFAUL_VARIANT_DISPLAY_NAME,
  DEFAULT_VARIANT_ALIAS_REGEX
);

export const ALLOWED_VARIANTS = [
  new Variant("chess", "Standard", "^chess|standard"),
  new Variant("antichess", "Antichess", "^anti|giveaway|give away|loser"),
  DEFAULT_VARIANT,
  //new Variant("crazyhouse", "Crazyhouse", "crazy"),
  new Variant("horde", "Horde", "horde"),
  new Variant(
    "kingofthehill",
    "King of the Hill",
    "king of the hill|kingofthehill"
  ),
  new Variant("racingkings", "Racing Kings", "racing kings|racingkings"),
  new Variant("3check", "Three Check", "3check|three check|threecheck"),
];

/////////////////////////////////////////////////////////

export const POSSIBLE_TITLES = [
  "",
  "ATCM",
  "ATM",
  "ATIM",
  "ATGM",
  "ATSGM",
] as const;
export type Title = typeof POSSIBLE_TITLES[number];

export class User extends Serializable<User> {
  username = "?";
  lichessCheckedAt = 0;
  lichessProfile = undefined;
  LOGIN_INTERVAL = DEFAULT_LOGIN_INTERVAL;
  token: string = "";
  title: Title = "";

  constructor(blob?: Blob) {
    super("user");
    this.deserialize(blob);
  }

  lichessProfileUrl() {
    return `https://lichess.org/@/${this.username}`;
  }

  clone() {
    return new User(this.serialize());
  }

  cloneLight() {
    const user = this.clone();
    user.lichessProfile = undefined;
    return user;
  }

  deserializeFunc(blob: Blob) {
    this.username = blob.username || this.username;
    this.lichessCheckedAt = blob.lichessCheckedAt || 0;
    this.lichessProfile = blob.lichessProfile;
    this.LOGIN_INTERVAL = blob.LOGIN_INTERVAL || this.LOGIN_INTERVAL;
    this.token = blob.token || this.token;
    this.title = blob.title || this.title;
  }

  serializeFunc() {
    return {
      username: this.username,
      lichessCheckedAt: this.lichessCheckedAt,
      lichessProfile: this.lichessProfile,
      LOGIN_INTERVAL: this.LOGIN_INTERVAL,
      token: this.token,
      title: this.title,
    };
  }
}

/////////////////////////////////////////////////////////

export class ChatMessage extends Serializable<ChatMessage> {
  message = "message";
  createdAt = Date.now();
  user = new User({});

  constructor(blob?: Blob) {
    super("chatmessage");
    this.deserialize(blob);
  }

  age() {
    return Date.now() - this.createdAt;
  }

  deserializeFunc(blob: Blob) {
    this.message = blob.message || this.message;
    this.createdAt = blob.createdAt || this.createdAt;
    this.user = this.user.deserialize(blob.user);
  }

  serializeFunc() {
    return {
      message: this.message,
      createdAt: this.createdAt,
      user: this.user.serialize(),
    };
  }
}

//////////////////////////////////////////////////////////

export class TimeControl extends Serializable<TimeControl> {
  initial: number = 180;
  increment: number = 2;

  constructor(blob?: Blob) {
    super("timecontrol");
    this.deserialize(blob);
  }

  display() {
    return `${this.initial / 60} + ${this.increment}`;
  }

  serializeFunc() {
    return {
      initial: this.initial,
      increment: this.increment,
    };
  }

  deserializeFunc(blob: Blob) {
    this.initial = desNum(blob, "initial", this.initial);
    this.increment = desNum(blob, "increment", this.increment);
  }
}

//////////////////////////////////////////////////////////

export class Seek extends Serializable<Seek> {
  user: User = new User();
  acceptor: User | undefined;
  tc: TimeControl = new TimeControl({});
  variant: Variant = DEFAULT_VARIANT;
  rounds = 1;
  rated: boolean = DEFAULT_RATED;
  del = false;
  parentMatch: Match | undefined;

  constructor(blob?: Blob) {
    super("seek");
    this.deserialize(blob);
  }

  hasUser(user: User) {
    if (this.user.sameIdAs(user)) return true;
    if (this.acceptor) {
      return this.acceptor.sameIdAs(user);
    } else {
      return false;
    }
  }

  setDelete(del: boolean) {
    this.del = del;
    return this;
  }

  deserializeFunc(blob: Blob) {
    this.user = new User(blob.user);
    this.acceptor = blob.acceptor ? new User(blob.acceptor) : undefined;
    this.tc = new TimeControl(blob.tc);
    this.variant =
      Variant.fromChessopsKey(
        blob.variant?.chessopsKey || DEFAULT_VARIANT_KEY
      ) || this.variant;
    this.rounds = blob.rounds || this.rounds;
    this.rated = blob.rated || this.rated;
    if (blob.rated === false) this.rated = false;
    this.del = !!blob.del;
  }

  serializeFunc() {
    return {
      user: this.user.cloneLight().serialize(),
      acceptor: this.acceptor ? this.acceptor.serialize() : undefined,
      tc: this.tc.serialize(),
      variant: this.variant.serialize(),
      rounds: this.rounds,
      rated: this.rated,
      del: this.del,
    };
  }
}

//////////////////////////////////////////////////////////

export class SerializableTemplate extends Serializable<SerializableTemplate> {
  // properties

  constructor(blob?: Blob) {
    super("serializabletemplate");
    this.deserialize(blob);
  }

  deserializeFunc(blob: Blob) {
    // deserialize class specific properties
  }

  serializeFunc() {
    // serialize class specific properties
    return {};
  }
}

//////////////////////////////////////////////////////////

export class Match extends Serializable<Match> {
  // properties
  seek: Seek = new Seek();
  round: number = 1;
  games: Game_[] = Array(DEFAULT_ROUNDS).fill(Game());
  terminated: boolean = false;
  selected: number | undefined = undefined;
  selectedGameChangedCallback: any = () => {};

  constructor(blob?: Blob) {
    super("match");
    this.deserialize(blob);
    this.selectGame();
  }

  get started() {
    return !this.games[0].empty;
  }

  setSelectedGameChangedCallback(callback: any) {
    this.selectedGameChangedCallback = callback;
    this.selectedGameChangedCallback();
    return this;
  }

  get rounds() {
    return this.seek.rounds;
  }

  setSeek(seek: Seek) {
    this.seek = seek;
    for (let round = 0; round < this.rounds; round++) {
      const game = Game().setVariant(this.seek.variant.chessopsKey, undefined);
      if (round % 2 == 0) {
        game.players[WHITE] = this.user;
        game.players[BLACK] = this.acceptor as User;
      } else {
        game.players[BLACK] = this.user;
        game.players[WHITE] = this.acceptor as User;
      }
      this.games[round] = game;
    }
    return this;
  }

  get user() {
    return this.seek.user;
  }

  get acceptor() {
    return this.seek.acceptor;
  }

  get currentGame(): Game_ {
    return this.games[this.round];
  }

  get selectedGame(): Game_ {
    if (this.selected === undefined) {
      return this.currentGame;
    }

    return this.games[this.selected];
  }

  selectGame(selected?: number) {
    this.selected = selected;
    this.selectedGameChangedCallback();
  }

  opponentOf(user: User): User | undefined {
    if (this.hasUser(user)) {
      if (this.user.sameIdAs(user)) {
        return this.acceptor;
      } else {
        return this.user;
      }
    } else {
      return undefined;
    }
  }

  shouldFlip(me: User) {
    const opponent = this.opponentOf(me);
    if (opponent === undefined) {
      return false;
    } else {
      if (this.user.sameIdAs(me)) {
        return false;
      } else {
        return true;
      }
    }
  }

  gameForRound(round?: number) {
    if (round === undefined) return this.currentGame;
    return this.games[round];
  }

  topPlayer(me: User, round?: number): User {
    const opponent = this.opponentOf(me);
    if (opponent === undefined) {
      return this.gameForRound(round).players[BLACK];
    } else {
      return opponent;
    }
  }

  bottomPlayer(me: User, round?: number): User {
    const opponent = this.opponentOf(me);
    if (opponent === undefined) {
      return this.gameForRound(round).players[WHITE];
    } else {
      return me;
    }
  }

  hasUser(user: User) {
    const hasUser = this.seek.hasUser(user);

    return hasUser;
  }

  get playing() {
    return !this.terminated;
  }

  deserializeFunc(blob: Blob) {
    // deserialize class specific properties
    this.seek = new Seek(blob.seek);
    this.seek.parentMatch = this;
    this.round = desNum(blob, "round", this.round);
    if (Array.isArray(blob.games))
      this.games = blob.games.map((game) => Game().fromProps(game));
    this.terminated = !!blob.terminated;
  }

  serializeFunc() {
    // serialize class specific properties
    return {
      seek: this.seek.serialize(),
      round: this.round,
      games: this.games.map((game) => game.serialize()),
      terminated: this.terminated,
    };
  }
}

//////////////////////////////////////////////////////////

export class AppData extends Serializable<AppData> {
  // properties
  name: string = DEFAULT_APP_NAME_DEFAULT;
  targzUrl: string = DEFAULT_TARGZ_URL;

  constructor(blob?: Blob) {
    super("appdata");
    this.deserialize(blob);
  }

  deserializeFunc(blob: Blob) {
    // deserialize class specific properties
    this.name = desStr(blob, "name", DEFAULT_APP_NAME_DEFAULT);
    this.targzUrl = desStr(blob, "targzUrl", DEFAULT_TARGZ_URL);
  }

  serializeFunc() {
    // serialize class specific properties
    return {
      name: this.name,
      targzUrl: this.targzUrl,
    };
  }
}

//////////////////////////////////////////////////////////
