import _ from "lodash";

import { Chess } from "./chessops/chess";
import { Move } from "./chessops/types";
import { DepthItem } from "./index";

import {
  Atomic,
  Antichess,
  Crazyhouse,
  Horde,
  KingOfTheHill,
  RacingKings,
  ThreeCheck,
} from "./chessops/variant";

import { parseSan, makeSan } from "./chessops/san";

import { makeFen, parseFen } from "./chessops/fen";

import { parseUci, makeUci, makeSquare } from "./chessops/util";

import { chessgroundDests } from "./chessops/compat";

import { Blob, User, desNum } from "../shared/models";

/////////////////////////////////////////////////////////////////////

export { chessgroundDests };

export const VARIANT_DISPLAY_NAMES: { [variant: string]: string } = {
  chess: "Standard",
  antichess: "Antichess",
  atomic: "Atomic",
  crazyhouse: "Crazyhouse",
  horde: "Horde",
  kingofthehill: "King of The Hill",
  racingkings: "Racing Kings",
  "3check": "Three Check",
};

export const SEVEN_TAG_ROASTER = [
  "Event",
  "Site",
  "Date",
  "Round",
  "White",
  "Black",
  "Result",
];

export type Uci = string;
export type San = string;
export type Variant = string;
export type Fen = string;
export type GameNodeId = string;
export type Shape = string;

export function guessChessopsVariant(variant: string): Variant {
  const reduced = variant.toLowerCase().replace(/[ -]+/g, "");
  if ("3check,threecheck".match(new RegExp(reduced))) return "3check";
  if ("atomic".match(new RegExp(reduced))) return "atomic";
  if ("kingofthehill".match(new RegExp(reduced))) return "kingofthehill";
  if ("horde".match(new RegExp(reduced))) return "horde";
  if ("antichess,losers,giveaway".match(new RegExp(reduced)))
    return "antichess";
  if ("crazyhouse".match(new RegExp(reduced))) return "crazyhouse";
  if ("racingkings".match(new RegExp(reduced))) return "racingkings";
  return "chess";
}

export const PROMOTION_PIECES = ["q", "r", "b", "n", "k"];
export const PROMOTION_PIECE_NAMES = [
  "queen",
  "rook",
  "bishop",
  "knight",
  "king",
];
export const PROMOTION_PIECES_EXT = [""].concat(PROMOTION_PIECES);

export const MOVE_RATINGS = [
  "forcedwin", // 10
  "winning", // 9
  "exclam", // 8
  "good", // 7

  "promising", // 6
  "stable", // 5
  "experimental", // 4

  "bad", // 3
  "losing", // 2
  "forcedloss", // 1

  "unrated", // 0
].reverse();

export function storeKey(variant: Variant, fen: Fen): string {
  const fenParts = fen.split(" ");
  const takeFenParts = variant === "3check" ? 5 : 4;
  const fenKey = fenParts.slice(0, takeFenParts).join("_");
  const storeKey = variant + "__" + fenKey;
  return storeKey;
}

type PgnParseState = "init" | "head" | "body";

function splitPgn(pgnsStr: string) {
  const pgns: string[] = [];
  let state: PgnParseState = "init";
  let head: string[] = [];
  let body: string[] = [];
  pgnsStr = pgnsStr.replace(/\r/g, "");
  for (let line of (pgnsStr + "\n\n").split(/\n/)) {
    if (state === "init") {
      if (line.length && line.substring(0, 1) === "[") {
        state = "head";
        head.push(line);
      } else {
        state = "body";
        body.push(line);
      }
    } else if (state === "head") {
      if (line.length && line.substring(0, 1) === "[") {
        head.push(line);
      } else {
        state = "body";
      }
    } else {
      if (line.length) {
        body.push(line);
      } else {
        state = "init";
        const bodyJoined = body.join("\n");
        pgns.push(head.join("\n") + "\n\n" + bodyJoined);
        console.info(
          `split pgn ok, num headers ${head.length}, body size ${bodyJoined.length}`
        );
        head = [];
        body = [];
      }
    }
  }
  return pgns;
}

// Pos_ is an abstraction of a chess position
export class Pos_ {
  pos: Chess;

  constructor() {
    // initialize to standard chess starting position
    this.pos = Chess.default();
  }

  checkedKingUci(): string {
    const ctx = this.pos.ctx();
    const hasCheckers = ctx.checkers.nonEmpty();
    if (hasCheckers && ctx.king !== undefined) {
      return makeSquare(ctx.king) as string;
    }
    return "";
  }

  get rules(): Variant {
    return this.pos.rules;
  }

  get variant(): Variant {
    return this.rules;
  }

  rawLegalUcis() {
    return Array.from(chessgroundDests(this.pos).entries())
      .map((entry) => entry[1].map((dest) => `${entry[0]}${dest}`))
      .flat();
  }

  chessgroundDests() {
    return chessgroundDests(this.pos);
  }

  setVariant(variant: Variant) {
    switch (variant) {
      case "atomic":
        this.pos = Atomic.default();
        break;
      case "antichess":
        this.pos = Antichess.default();
        break;
      case "crazyhouse":
        this.pos = Crazyhouse.default();
        break;
      case "horde":
        this.pos = Horde.default();
        break;
      case "kingofthehill":
        this.pos = KingOfTheHill.default();
        break;
      case "racingkings":
        this.pos = RacingKings.default();
        break;
      case "3check":
      case "threecheck":
        this.pos = ThreeCheck.default();
        break;
      default:
        this.pos = Chess.default();
    }
    return this;
  }

  setFen(fen: Fen) {
    const setupResult = parseFen(fen);

    if (setupResult.isErr) {
      return this;
    }

    const setup = setupResult.value;

    let posResult = undefined;

    const variant = this.pos.rules;

    switch (variant) {
      case "atomic":
        posResult = Atomic.fromSetup(setup);
        break;
      case "antichess":
        posResult = Antichess.fromSetup(setup);
        break;
      case "crazyhouse":
        posResult = Crazyhouse.fromSetup(setup);
        break;
      case "horde":
        posResult = Horde.fromSetup(setup);
        break;
      case "kingofthehill":
        posResult = KingOfTheHill.fromSetup(setup);
        break;
      case "racingkings":
        posResult = RacingKings.fromSetup(setup);
        break;
      case "3check":
        posResult = ThreeCheck.fromSetup(setup);
        break;
      default:
        posResult = Chess.fromSetup(setup);
    }

    if (posResult === undefined) return this;

    if (posResult.isErr) return this;

    this.pos = posResult.value;

    return this;
  }

  reportFen() {
    return makeFen(this.pos.toSetup());
  }

  sanToMove(san: San): Move | undefined {
    return parseSan(this.pos, san);
  }

  moveToSan(move: Move) {
    return makeSan(this.pos, move);
  }

  uciToMove(uci: Uci): Move | undefined {
    const move = parseUci(uci);
    return move;
  }

  moveToUci(move: Move) {
    return makeUci(move);
  }

  play(move: Move) {
    this.pos.play(move);
    return this;
  }

  playSan(san: San) {
    const move = this.sanToMove(san);
    if (move === undefined) return this;
    return this.play(move);
  }

  playUci(uci: Uci) {
    const move = this.uciToMove(uci);
    if (move === undefined) return this;
    return this.play(move);
  }

  sanToUci(san: San): Uci | undefined {
    const move = this.sanToMove(san);
    if (move === undefined) return undefined;
    return this.moveToUci(move);
  }

  uciToSan(uci: Uci): San | undefined {
    const move = this.uciToMove(uci);
    if (move === undefined) return undefined;
    return this.moveToSan(move);
  }

  toString() {
    return `[Pos ${this.pos.rules} ${this.reportFen()}]`;
  }

  legalsForUci(uci: Uci) {
    return PROMOTION_PIECES_EXT.filter((pp) => {
      const move = this.uciToMove(`${uci}${pp}`);
      if (move === undefined) return false;
      const legal = this.pos.isLegal(move, this.pos.ctx());
      return legal;
    }).map((pp) => `${uci}${pp}`);
  }

  isUciLegal(uci: Uci): boolean {
    return this.legalsForUci(uci).length > 0;
  }

  isSanLegal(san: San): boolean {
    const uci = this.sanToUci(san);
    if (uci === undefined) return false;
    return this.isUciLegal(uci);
  }

  allLegalUcis() {
    return this.rawLegalUcis()
      .map((uci) => this.legalsForUci(uci))
      .flat();
  }

  allLegalSans() {
    const rawLegalSans = this.allLegalUcis().map((uci) => this.uciToSan(uci));
    const legalSans = _.uniq(rawLegalSans);
    return legalSans;
  }
}

export function Pos() {
  return new Pos_();
}

export type RichLegalSan = {
  san: San | undefined;
  uci: Uci | undefined;
  rating: string;
  class: string;
  isMainline: boolean;
  isVariation: boolean;
  weights: number[];
};

function compareRichLegalSans(a: RichLegalSan, b: RichLegalSan): number {
  if (a.weights[0] != b.weights[0]) return a.weights[0] - b.weights[0];

  if (a.weights[1] != b.weights[1]) return a.weights[1] - b.weights[1];

  if (a.weights[2] != b.weights[2]) return a.weights[2] - b.weights[2];

  return (a.san || "").localeCompare(b.san || "");
}

export const POSSIBLE_GAME_RESULTS = [-1, 0, 1] as const;

export type GameResult = typeof POSSIBLE_GAME_RESULTS[number];
export const DEFAULT_GAME_RESULT: GameResult = 0;

export class Game_ {
  variant: Variant;
  pos: Pos_;
  root: GameNode_;
  current: GameNode_;
  nodes: { [id: string]: GameNode_ };
  headers: { [id: string]: string };
  props: { [id: string]: any };
  players: User[] = [new User(), new User()];
  result: GameResult = DEFAULT_GAME_RESULT;
  terminated: boolean = false;

  constructor() {
    this.fromProps({});
  }

  mergeGame(g: Game_) {
    this.toBegin();
    g.toBegin();
    let ptr = g.current;
    do {
      ptr = ptr.next();
      if (ptr.genSan) {
        this.playSan(ptr.genSan);
      }
    } while (!ptr.isTerminal);
  }

  mergePgn(pgnsStr: string) {
    const pgns = splitPgn(pgnsStr);
    if (!pgns.length) {
      console.error("could not merge empty pgn");
      return;
    }
    for (let pgn of pgns) {
      const g = Game();
      g.parsePgn(pgn);
      this.mergeGame(g);
    }
  }

  parsePgn(pgnsStr: string) {
    const pgns = splitPgn(pgnsStr);
    if (!pgns.length) {
      console.error("could not parse empty pgn");
      return;
    }
    const pgn = pgns[0];
    this.clearHeaders();
    let body = "";
    for (let line of pgn.split(/[\n\r]+/)) {
      const headerMatch = line.match(/^\[([^ ]+) "([^"]+)"\]/);
      if (headerMatch) {
        this.setHeader(headerMatch[1], headerMatch[2]);
      } else {
        body += line + " ";
      }
    }
    let variationMatch = body.match(/\([^\(\)]+\)/);
    while (variationMatch) {
      body = body.replace(variationMatch[0], "");
      variationMatch = body.match(/\([^\(\)]+\)/);
    }
    body = body.replace(/\{[^\}]*\}/g, "");
    body = body.replace(/[0-9]+[\.]+/g, "");
    body = body.replace(/[\?\!]+/g, "");
    body = body.replace(/1\-0|0\-1|1\/2\-1\/2\|\*/g, "");
    let moves = body.split(/[ ]+/).filter((move) => move.length);
    const oldHeaders = this.headers;
    this.setVariant(
      guessChessopsVariant(this.headers["Variant"] || "chess"),
      this.headers["FEN"]
    );
    this.headers = oldHeaders;
    moves.forEach((san) => this.playSan(san));
    return this;
  }

  clearHeaders() {
    this.headers = {};
  }

  getHeader(tag: string, def: string) {
    return this.headers[tag] || def;
  }

  setHeader(tag: string, value: string) {
    this.headers[tag] = value;
  }

  reportHeader(tag: string): string {
    return `[${tag} "${this.getHeader(tag, "?")}"]`;
  }

  reportHeaders(): string {
    const headers = [];
    for (let tag of SEVEN_TAG_ROASTER) {
      headers.push(this.reportHeader(tag));
    }
    this.headers["Variant"] = VARIANT_DISPLAY_NAMES[this.variant];
    this.headers["FEN"] = this.root.fen;
    for (let tag in this.headers) {
      if (!SEVEN_TAG_ROASTER.find((test) => tag == test)) {
        headers.push(this.reportHeader(tag));
      }
    }
    return headers.join("\n");
  }

  reportPgn(headers: boolean): string {
    const rootBlackTurn = !this.root.fen.match(" w ");
    const pgn: any = [];
    const fullMove = parseInt(this.root.fen.split(" ")[5]) as number;
    const sans = this.current.id
      .split("_")
      .slice(1)
      .forEach((san: any, i: number) => {
        if (i == 0) {
          if (rootBlackTurn) {
            pgn.push(`${fullMove}..`);
          } else {
            pgn.push(`${fullMove}.`);
          }
        } else {
          if (rootBlackTurn) {
            if (i % 2 == 1) {
              pgn.push(`${(i + 1) / 2 + fullMove}.`);
            }
          } else {
            if (i % 2 == 0) {
              pgn.push(`${i / 2 + fullMove}.`);
            }
          }
        }
        pgn.push(san);
      });
    const pgnMoves = pgn.join(" ");
    if (headers) {
      return this.reportHeaders() + "\n\n" + pgnMoves;
    }
    return pgnMoves;
  }

  chessgroundDests() {
    return this.pos.chessgroundDests();
  }

  storeKey() {
    return storeKey(this.variant, this.pos.reportFen());
  }

  getChildNodes(): GameNode_[] {
    return this.current.getChildNodes();
  }

  richLegalSans(): RichLegalSan[] {
    const childNodes = _.fromPairs(
      this.getChildNodes().map((node, i) => {
        node.index = i;
        return [node.genSan, node];
      })
    );

    return this.pos
      .allLegalSans()
      .map((san) => {
        const node = childNodes[san || ""];
        const weights = this.current.weights[san || ""] || [0, 0, 0];
        const rls: RichLegalSan = {
          san: san,
          uci: this.pos.sanToUci(san || ""),
          rating: MOVE_RATINGS[weights[1]] || "unrated",
          class: "richlegalsan",
          isMainline: node ? node.index === 0 : false,
          isVariation: node ? node.index > 0 : false,
          weights,
        };

        if (rls.isMainline) rls.class += " mainline";
        if (rls.isVariation) rls.class += " variation";
        rls.class += " " + rls.rating;

        return rls;
      })
      .sort(compareRichLegalSans)
      .reverse();
  }

  get playing() {
    return !this.terminated;
  }

  fromProps(props: Blob) {
    this.nodes = {};

    this.variant = props.variant || "chess";

    this.pos = Pos().setVariant(this.variant);

    if (typeof props === "object") {
      if (props.fen) this.pos.setFen(props.fen);

      if (props.nodes) {
        for (const id in props.nodes) {
          this.nodes[id] = GameNode(this).fromProps(props.nodes[id]);
        }
      }

      if (props.root && props.nodes) {
        this.root = this.nodes[props.root.id];
      } else {
        this.root = GameNode(this).fromProps({
          fen: this.pos.reportFen(),
          id: "*",
        });
      }

      if (props.current && props.nodes) {
        this.current = this.nodes[props.current.id];
      } else {
        this.current = this.root;
      }

      this.headers = props.headers || {};

      this.props = props.props || {};

      const result = desNum(props, "result", DEFAULT_GAME_RESULT) as GameResult;
      if (POSSIBLE_GAME_RESULTS.includes(result)) {
        this.result = result;
      }

      this.terminated = !!props.terminated;
    }

    this.nodes[this.root.id] = this.root;

    this.pos.setFen(this.current.fen);

    return this;
  }

  serialize(): any {
    const nodesSerialized: any = {};
    for (const id in this.nodes) {
      nodesSerialized[id] = this.nodes[id].serialize();
    }
    return {
      variant: this.variant,
      root: this.root.serialize(),
      current: this.current.serialize(),
      nodes: nodesSerialized,
      headers: this.headers,
      props: this.props,
    };
  }

  stringify(): string {
    return JSON.stringify(this.serialize());
  }

  pretty(): string {
    return JSON.stringify(this.serialize(), null, 2);
  }

  parse(json: string): Game_ {
    if (!json) {
      return this.fromProps({});
    }
    const blob = JSON.parse(json);
    this.fromProps(blob);
    return this;
  }

  reportFen(): Fen {
    return this.pos.reportFen();
  }

  prev(): GameNode_ {
    return this.current.prev();
  }

  next(): GameNode_ {
    return this.current.next();
  }

  setCurrent(node: GameNode_): Game_ {
    this.current = node;
    this.pos.setFen(this.current.fen);
    return this;
  }

  selectId(id: GameNodeId): Game_ {
    if (id in this.nodes) {
      this.current = this.nodes[id];
    }
    return this.setCurrent(this.current);
  }

  back(): boolean {
    const id = this.current.id;
    this.setCurrent(this.prev());
    return id !== this.current.id;
  }

  toBegin(): boolean {
    let ok = false;
    while (this.back()) {
      ok = true;
    }
    return ok;
  }

  forward(): boolean {
    const id = this.current.id;
    this.setCurrent(this.next());
    return id !== this.current.id;
  }

  toEnd(): boolean {
    let ok = false;
    while (this.forward()) {
      ok = true;
    }
    return ok;
  }

  del(): boolean {
    const oldId = this.current.id;
    const san = this.current.genSan || "";
    if (!this.back()) return false;
    const len = oldId.length;
    for (const id in this.nodes) {
      if (id.substring(0, len) === oldId) {
        delete this.nodes[id];
      }
    }
    this.current.setPriority(san, 0);
    return true;
  }

  mainLine(): GameNode_[] {
    let ptr = this.root;
    let line = [];
    do {
      line.push(ptr);
      if (ptr.isTerminal) {
        return line;
      }
      ptr = ptr.next();
    } while (true);
  }

  setVariant(variant: Variant, fen: Fen | undefined): Game_ {
    this.fromProps({
      variant,
      fen,
    });
    return this;
  }

  playSans(sans: San[]): Game_ {
    sans.forEach((san) => this.playSan(san));
    return this;
  }

  playSansStr(sans: string): Game_ {
    this.playSans(sans.split(" "));
    return this;
  }

  playSan(san: San): boolean {
    if (!this.pos.isSanLegal(san)) return false;
    const uci = this.pos.sanToUci(san);
    this.pos.playSan(san);
    const newId = this.current.id + "_" + san;
    const oldCurrent = this.current;
    if (this.nodes[newId]) {
      this.current = this.nodes[newId];
    } else {
      this.current = GameNode(this).fromProps({
        fen: this.reportFen(),
        genUci: uci,
        genSan: san,
        id: newId,
      });
      this.nodes[newId] = this.current;
    }
    oldCurrent.bringForwardChild(san);
    return true;
  }

  playUci(uci: Uci): boolean {
    if (!this.pos.isUciLegal(uci)) return false;
    const san = this.pos.uciToSan(uci);
    if (san === undefined) return false;
    return this.playSan(san);
  }

  clone() {
    return Game().parse(this.stringify());
  }
}

export function Game() {
  return new Game_();
}

export class GameNode_ {
  id: GameNodeId;
  fen: Fen;
  genUci: Uci;
  genSan: San;
  weights: { [san: string]: number[] };
  comment: string;
  shapes: Shape[];
  analysis: DepthItem | undefined;
  index: number;

  parentGame: Game_;

  constructor(parentGame: Game_) {
    this.parentGame = parentGame;
    this.fromProps({});
  }

  chessgroundDests() {
    const pos = Pos();
    pos.setVariant(this.parentGame.variant);
    pos.setFen(this.fen);
    return pos.chessgroundDests();
  }

  storeKey() {
    return storeKey(this.parentGame.variant, this.fen);
  }

  clone() {
    return GameNode(this.parentGame).parse(this.stringify());
  }

  fromProps(props: any) {
    this.id = props.id;
    this.fen = props.fen;
    this.genUci = props.genUci;
    this.genSan = props.genSan;
    this.weights = props.weights || {};
    this.comment = props.comment || "";
    this.shapes = props.shapes || [];
    this.analysis = props.analysis
      ? new DepthItem().fromProps(props.analysis)
      : undefined;
    return this;
  }

  serialize(): any {
    return {
      id: this.id,
      fen: this.fen,
      genUci: this.genUci,
      genSan: this.genSan,
      weights: this.weights,
      comment: this.comment,
      shapes: this.shapes,
      analysis: this.analysis ? this.analysis.serialize() : undefined,
    };
  }

  stringify(): string {
    return JSON.stringify(this.serialize());
  }

  parse(json: string): GameNode_ {
    if (!json) {
      return this.fromProps({});
    }
    const blob: any = JSON.parse(json);
    return this.fromProps(blob);
  }

  prevId(): GameNodeId {
    if (this.id === "*") return this.id;
    const sans = this.id.split("_");
    sans.pop();
    return sans.join("_");
  }

  getMaxPriority() {
    let max: number = 0;
    _.toPairs(this.weights).forEach((pair) => {
      if (pair[1][0] > max) max = pair[1][0];
    });
    return max;
  }

  getMinPriority() {
    let min: number = 0;
    _.toPairs(this.weights).forEach((pair) => {
      if (min == 0) {
        if (pair[1][0] > 0) min = pair[1][0];
      } else {
        if (pair[1][0] > 0 && pair[1][0] < min) min = pair[1][0];
      }
    });
    return min;
  }

  normalizePriorities(): GameNode_ {
    const minPriority = this.getMinPriority();
    if (minPriority <= 1) return this;
    Object.keys(this.weights).forEach((san: San) => {
      const priority = this.getPriority(san);
      if (priority > 0) this.setPriority(san, priority - minPriority + 1);
    });
    return this;
  }

  clearPriorities(): GameNode_ {
    Object.keys(this.weights).forEach((san: San) => {
      this.setPriority(san, 0);
    });
    return this;
  }

  bringForwardChild(san: San): GameNode_ {
    this.setPriority(san, this.getMaxPriority() + 1);
    this.normalizePriorities();
    return this;
  }

  get isTerminal(): boolean {
    return this.getChildNodes().length === 0;
  }

  getNode(id: GameNodeId): GameNode_ {
    return this.parentGame.nodes[id];
  }

  getNodeForSan(san: San): GameNode_ {
    return this.parentGame.nodes[this.id + "_" + san];
  }

  next(): GameNode_ {
    if (this.isTerminal) return this;
    return this.getChildNodes()[0];
  }

  get isRoot(): boolean {
    return this.id === "*";
  }

  prev(): GameNode_ {
    return this.getNode(this.prevId());
  }

  get displaySan(): San {
    if (this.isRoot) return "*";
    return this.genSan;
  }

  getChildNodes() {
    const childLen = this.id.split("_").length + 1;
    return Object.keys(this.parentGame.nodes)
      .filter((id) => {
        const idParts = id.split("_");
        if (idParts.length != childLen) return false;
        return _.take(idParts, childLen - 1).join("_") === this.id;
      })
      .map((id) => this.getNode(id))
      .sort((a, b) => b.getPrevPriority() - a.getPrevPriority());
  }

  getWeightsForSan(san: San): number[] {
    if (this.weights[san]) return this.weights[san];
    this.weights[san] = [0, 0, 0];
    return this.weights[san];
  }

  getWeight(san: San, index: number): number {
    return this.getWeightsForSan(san)[index];
  }

  setWeight(san: San, index: number, weight: number): GameNode_ {
    this.getWeightsForSan(san)[index] = weight;
    return this;
  }

  getPriority(san: San) {
    return this.getWeight(san, 0);
  }

  getPrevPriority(): number {
    return this.prev().getPriority(this.genSan);
  }

  setPriority(san: San, weight: number) {
    return this.setWeight(san, 0, weight);
  }

  getMyWeight(san: San) {
    return this.getWeight(san, 1);
  }

  setMyWeight(san: San, weight: number) {
    return this.setWeight(san, 1, weight);
  }

  getOppWeight(san: San) {
    return this.getWeight(san, 2);
  }

  setOppWeight(san: San, weight: number) {
    return this.setWeight(san, 2, weight);
  }
}

export function GameNode(parentGame: Game_) {
  return new GameNode_(parentGame);
}
