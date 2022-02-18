import { spawn } from "child_process";

import _ from "lodash";

export const MATE_SCORE = 10000;
export const PV_MAX_LENGTH = 5;
export const INFINITE = -1;

let VERBOSE = false;

function log(content: string) {
  if (VERBOSE) console.log(content);
}

export type Commands = string | Array<string>;

import { Pos, Variant, Fen, Uci, San } from "./chessops";

export type GoPayload = {
  variant?: Variant;
  fen?: Fen;
  depth?: number;
  multipv?: number;
  bestmoveCallback?: (info: AnalysisInfo) => void;
  pvMaxLength?: number;
};

export type ScoreType = "cp" | "mate";
export type ScoreValue = Number;
export type ScoreNumerical = Number;

export type PvItem = {
  multipv: number;
  parsedPv: string;
  pvUcis: Uci[];
  pvSans: San[];
  scoreType: ScoreType;
  scoreValue: Number;
  scoreNumerical: ScoreNumerical;
  depth: number;
};

export class DepthItem {
  pvItems: PvItem[];
  depth: number;
  multipv: number;

  constructor(propsOpt?: any) {
    this.fromProps(propsOpt);
  }

  fromProps(propsOpt: any) {
    const props = propsOpt || {};
    this.pvItems = props.pvItems || [];
    this.depth = props.depth || 0;
    this.multipv = props.multipv || 1;
    return this;
  }

  serialize(): any {
    return {
      pvItems: this.pvItems,
      depth: this.depth,
      multipv: this.multipv,
    };
  }

  stringify(): string {
    return JSON.stringify(this.serialize());
  }

  parse(json: string) {
    if (!json) return this.fromProps({});
    return this.fromProps(JSON.parse(json));
  }

  get completed() {
    return _.compact(this.pvItems).length == this.multipv;
  }
}

export type EngineState = "preparing" | "ready" | "stopping" | "running";

export type AnalysisInfo = {
  state: EngineState;
  variant: Variant;
  analyzedFen: Fen;
  multipv: number;
  depthItems: DepthItem[];
  highestCompletedDepth: DepthItem | undefined;
  infoString: string;
  currentMultipv: number;
  currentDepth: number;
  currentScoreType: ScoreType;
  currentScoreValue: number;
  currentScoreNumerical: ScoreNumerical;
  pvMaxLength: number;
  bestmove: string;
  ponder: string;
};

export type SendAnalysisInfo = (info: AnalysisInfo) => void;

export abstract class UciEngine {
  abstract spawn(): UciEngine;
  abstract kill(): void;
  abstract writeCommand(command: string): void;
  abstract get me(): string;
  sendAnalysisInfo: SendAnalysisInfo;
  goPayload: GoPayload | undefined;
  deferredPayload: GoPayload | undefined;

  options: { [name: string]: string[] };

  shouldGo: boolean;

  analysisInfo: AnalysisInfo;

  compileAndSendAnalysisInfo() {
    const completed = this.analysisInfo.depthItems.filter(
      (depthItem) => depthItem.completed
    );

    this.analysisInfo.highestCompletedDepth = _.last(completed);

    const clone: AnalysisInfo = JSON.parse(
      JSON.stringify(this.analysisInfo)
    ) as AnalysisInfo;

    this.sendAnalysisInfo(clone);
  }

  constructor(sendAnalysisInfo: SendAnalysisInfo) {
    this.sendAnalysisInfo = sendAnalysisInfo;

    this.options = {};

    this.shouldGo = false;

    this.analysisInfo = {
      state: "preparing",
      variant: "chess",
      analyzedFen: "",
      depthItems: [],
      highestCompletedDepth: new DepthItem(),
      currentDepth: 0,
      currentMultipv: 1,
      infoString: "",
      multipv: 0,
      currentScoreType: "cp",
      currentScoreValue: 0,
      currentScoreNumerical: 0,
      pvMaxLength: PV_MAX_LENGTH,
      bestmove: "",
      ponder: "",
    };
  }

  checkShouldGo() {
    if (this.shouldGo) {
      if (this.deferredPayload !== undefined) {
        console.log("go deferred", this.deferredPayload);

        this.go(this.deferredPayload as GoPayload);
      }
    }
  }

  processLine(line: string) {
    log(`${this.me} > ${line}`);

    if (this.analysisInfo.state === "preparing") {
      if (line.match(/^uciok/)) {
        this.analysisInfo.state = "ready";
        console.log("engine ready", this.options);
        this.checkShouldGo();
        return;
      } else {
        if (line.match(/^option/)) {
          const parts = line.split(/option | type | default | min | max /);
          const name = parts[1];
          const value = parts.slice(2);
          this.options[name] = value;
        }
      }
    }

    if (!line.match(/^info |^bestmove/)) return;

    const infoStringMatch = line.match(/^info string (.*)/);

    if (infoStringMatch) {
      this.analysisInfo.infoString = infoStringMatch[1];
      return this.compileAndSendAnalysisInfo();
    }

    const bestmoveMatch = line.match(/^bestmove(.*)/);

    if (bestmoveMatch) {
      const parts = bestmoveMatch[1].split(" ");

      const bestmove = parts.length > 1 ? parts[1] : "";
      const ponder = parts.length > 3 ? parts[3] : "";

      console.log("bestmove", bestmove, "ponder", ponder);

      this.analysisInfo.state = "ready";
      this.analysisInfo.bestmove = bestmove;
      this.analysisInfo.ponder = ponder;

      if (this.goPayload?.bestmoveCallback) {
        this.goPayload.bestmoveCallback(this.analysisInfo);
      }

      this.compileAndSendAnalysisInfo();

      this.checkShouldGo();
    }

    const depthMatch = line.match(/depth ([0-9]+)/);

    if (depthMatch) this.analysisInfo.currentDepth = parseInt(depthMatch[1]);

    const multipvMatch = line.match(/multipv ([0-9]+)/);

    if (multipvMatch)
      this.analysisInfo.currentMultipv = parseInt(multipvMatch[1]);

    const scoreCpMatch = line.match(/score cp ([\-0-9]+)/);

    if (scoreCpMatch) {
      this.analysisInfo.currentScoreType = "cp";
      this.analysisInfo.currentScoreValue = parseInt(scoreCpMatch[1]);
      this.analysisInfo.currentScoreNumerical =
        this.analysisInfo.currentScoreValue;
    }

    const scoreMateMatch = line.match(/score mate ([\-0-9]+)/);

    if (scoreMateMatch) {
      this.analysisInfo.currentScoreType = "mate";
      this.analysisInfo.currentScoreValue = parseInt(scoreMateMatch[1]);
      this.analysisInfo.currentScoreNumerical =
        this.analysisInfo.currentScoreValue >= 0
          ? MATE_SCORE - (this.analysisInfo.currentScoreValue as number)
          : -MATE_SCORE - (this.analysisInfo.currentScoreValue as number);
    }

    const pvMatch = line.match(/ pv (.+)$/);

    if (pvMatch) {
      const parsedPv = pvMatch[1];

      const pvUcis = _.take(parsedPv.split(" "), this.analysisInfo.pvMaxLength);

      const pos = Pos()
        .setVariant(this.analysisInfo.variant)
        .setFen(this.analysisInfo.analyzedFen);

      let san = "dummy";
      let i = 0;

      const pvSans = [];

      while (san && i < pvUcis.length) {
        const uci = pvUcis[i];
        const san = pos.uciToSan(uci);
        if (san) {
          pvSans.push(san);
          pos.playSan(san);
        }
        i++;
      }

      const pvItem = {
        multipv: this.analysisInfo.currentMultipv,
        parsedPv,
        pvUcis,
        pvSans,
        scoreType: this.analysisInfo.currentScoreType,
        scoreValue: this.analysisInfo.currentScoreValue,
        scoreNumerical: this.analysisInfo.currentScoreNumerical,
        depth: this.analysisInfo.currentDepth,
      };

      const depthItem =
        this.analysisInfo.depthItems[this.analysisInfo.currentDepth] ||
        new DepthItem({
          depth: this.analysisInfo.currentDepth,
          multipv: this.analysisInfo.multipv,
        });

      depthItem.pvItems[this.analysisInfo.currentMultipv] = pvItem;

      this.analysisInfo.depthItems[this.analysisInfo.currentDepth] = depthItem;
    }

    this.compileAndSendAnalysisInfo();
  }

  processStdout(chunk: string) {
    chunk = chunk.replace(/\r/, "");
    const lines = chunk.split("\n");
    lines
      .filter((line) => line.length)
      .forEach((line) => this.processLine(line));
  }

  processStderr(err: string) {
    log(`${this.me} >> error ${err}`);
  }

  processClose(message: string) {
    log(`${this.me} >>> exited ${message}`);
  }

  issueCommand(commands: Commands) {
    if (typeof commands === "string") {
      commands = [commands];
    }

    commands.forEach((command) => {
      log(`${this.me} < ${command}`);

      this.writeCommand(command);
    });
  }

  setoption(name: string, value: string | Number) {
    const command = `setoption name ${name} value ${value}`;
    this.issueCommand(command);
  }

  position(fen?: Fen) {
    let command = `position startpos`;
    if (fen) {
      command = `position fen ${fen}`;
    }
    this.issueCommand(command);
  }

  go(payload: GoPayload) {
    if (this.analysisInfo.state !== "ready") {
      this.deferredPayload = payload;
      console.log("deferred", this.deferredPayload);
      this.shouldGo = true;
      if (this.analysisInfo.state === "running") {
        this.issueCommand("stop");
        this.analysisInfo.state = "stopping";
      }
      return;
    }

    this.goPayload = payload;

    const pos = Pos().setVariant(payload.variant || "chess");
    const fen = payload.fen || pos.reportFen();
    pos.setFen(fen);
    const variant = pos.variant;
    const analyzedFen = pos.reportFen();
    let multipv = payload.multipv || 1;
    const numLegals = pos.allLegalSans().length;
    if (numLegals < multipv) multipv = numLegals;
    if (multipv === 0) return;
    const pvMaxLength = payload.pvMaxLength || PV_MAX_LENGTH;
    this.analysisInfo = {
      state: this.analysisInfo.state,
      variant,
      analyzedFen,
      depthItems: [],
      highestCompletedDepth: undefined,
      currentDepth: 0,
      currentMultipv: 1,
      infoString: "",
      multipv,
      currentScoreType: "cp",
      currentScoreValue: 0,
      currentScoreNumerical: 0,
      pvMaxLength,
      bestmove: "",
      ponder: "",
    };
    let uciVariant = variant;
    if (variant === "antichess") uciVariant = "giveaway";
    if (variant === "3check") uciVariant = "threecheck";
    this.setoption("UCI_Variant", uciVariant);
    this.position(analyzedFen);
    const options = [];
    let command = `go`;
    if (payload.depth) {
      if (payload.depth === INFINITE) {
        command = `go infinite`;
      } else {
        options.push({ name: "depth", value: payload.depth });
      }
    }
    this.setoption("MultiPV", multipv);
    if (options.length)
      command +=
        " " + options.map((option) => `${option.name} ${option.value}`);
    this.analysisInfo.state = "running";
    this.shouldGo = false;
    this.issueCommand(command);
  }

  stop() {
    this.shouldGo = false;

    if (this.analysisInfo.state !== "running") {
      return;
    }

    this.analysisInfo.state = "stopping";

    this.issueCommand("stop");
  }
}

export class UciEngineNode extends UciEngine {
  executable: string;
  process: any;

  constructor(executable: string, sendAnalysisInfo: SendAnalysisInfo) {
    super(sendAnalysisInfo);
    this.executable = executable;
    this.process = null;
  }

  spawn(): UciEngine {
    this.process = spawn(this.executable);

    this.process.stdout.on("data", (data: any) => {
      this.processStdout(data.toString());
    });

    this.process.stderr.on("data", (data: any) => {
      this.processStderr(`${data}`);
    });

    this.process.on("close", (code: any) => {
      this.processClose(`with code ${code}`);
    });

    this.issueCommand("uci");

    return this;
  }

  kill() {
    this.process.kill();
    this.process = null;
  }

  get me() {
    return this.executable;
  }

  writeCommand(command: string) {
    this.process.stdin.write(command + "\n");
  }
}

/*export class UciEngineBrowser extends UciEngine {
  executable: string;
  process: any;

  constructor(executable: string, sendAnalysisInfo: SendAnalysisInfo) {
    super(sendAnalysisInfo);
    this.executable = executable;
    this.process = null;
  }

  spawn(): UciEngine {
    this.process = new Worker(this.executable);

    this.process.onmessage = (message: any) => {
      this.processStdout(message.data);
    };

    return this;
  }

  kill() {
    this.process.terminate();
    this.process = null;
  }

  get me() {
    return this.executable;
  }

  writeCommand(command: string) {
    this.process.postMessage(command);
  }
}*/
