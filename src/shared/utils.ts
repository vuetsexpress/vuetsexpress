import _ from "lodash";
import { TYPICAL_DEBUNCE_DELAY, TYPICAL_MAXWAIT_DELAY } from "./config";
import { MINUTE, SECOND } from "./time";

//////////////////////////////////////////////////////////////////////

export const SSE_DEFAULT_DROP_DELAY = 120000;
export const SSE_DEFAULT_TICK_DELAY = 30000;
export const DEFAULT_LOGGER_CAPACITY = 100;

//////////////////////////////////////////////////////////////////////

export function typDeb(callback: any) {
  return _.debounce(callback, TYPICAL_DEBUNCE_DELAY, {
    maxWait: TYPICAL_MAXWAIT_DELAY,
  });
}

export function shortDeb(callback: any) {
  return _.debounce(callback, TYPICAL_DEBUNCE_DELAY / 10, {
    maxWait: TYPICAL_DEBUNCE_DELAY,
  });
}

export function uid() {
  return (
    "uid_" + Date.now().toString(36) + Math.random().toString(36).substring(2)
  );
}

export function areStringSetsEqual(s1: Set<string>, s2: Set<string>) {
  if (s1.size !== s2.size) return false;
  return s1.size === new Set([...s1, ...s2]).size;
}

export function areStringArraysEqual(a1: string[], a2: string[]) {
  return areStringSetsEqual(new Set(a1), new Set(a2));
}

export function headSort(arr: any[], isHead: (el: any) => boolean) {
  const head = arr.filter((el) => isHead(el));
  const tail = arr.filter((el) => !isHead(el));

  return head.concat(tail);
}

export function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function pauseSecond(second: number) {
  return pause(second * SECOND);
}

export function pauseMinute(minute: number) {
  return pause(minute * MINUTE);
}

//////////////////////////////////////////////////////////////////////

export type LoggerConfig = {
  owner: string;
  capacity?: number;
  changeCallback?: any;
  skipConsole?: boolean;
};

export type LogMessage = string | { [key: string]: any };

const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
  owner: "logger",
  capacity: DEFAULT_LOGGER_CAPACITY,
  changeCallback: () => {},
  skipConsole: false,
};

export type LogDisposition =
  | "log"
  | "info"
  | "warn"
  | "error"
  | "success"
  | "failed";

export class LogItem {
  owner: string = "general";
  disposition: LogDisposition = "log";
  message: LogMessage = "log message";
  time: number = Date.now();

  constructor(owner: string, disposition: LogDisposition, message: LogMessage) {
    this.owner = owner;
    this.disposition = disposition;
    this.message = message;
  }

  messageAsText(): string {
    if (typeof this.message === "string") return this.message;
    return JSON.stringify(this.message, null, 2);
  }

  asText() {
    return `< ${this.owner} > [ ${
      this.disposition
    } ] : ${this.messageAsText()} @ ${this.time}`;
  }
}

export class Logger {
  config: LoggerConfig = DEFAULT_LOGGER_CONFIG;
  buffer: LogItem[] = [];

  constructor(lcOpt?: LoggerConfig) {
    if (lcOpt) {
      this.config = { ...DEFAULT_LOGGER_CONFIG, ...lcOpt };
    }
  }

  push(li: LogItem) {
    this.buffer.unshift(li);

    while (
      this.buffer.length > (this.config.capacity || DEFAULT_LOGGER_CAPACITY)
    ) {
      this.buffer.pop();
    }

    if (!this.config.skipConsole) {
      if (li.disposition === "error") {
        console.error(li.asText());
      } else if (li.disposition === "info") {
        console.info(li.asText());
      } else if (li.disposition === "warn") {
        console.warn(li.asText());
      } else {
        console.log(li.asText());
      }
    }

    if (this.config.changeCallback) {
      this.config.changeCallback(li, this.buffer);
    }
  }

  log(message: LogMessage, owner?: string) {
    this.push(new LogItem(owner || this.config.owner, "log", message));
  }

  info(message: LogMessage, owner?: string) {
    this.push(new LogItem(owner || this.config.owner, "info", message));
  }

  warn(message: LogMessage, owner?: string) {
    this.push(new LogItem(owner || this.config.owner, "warn", message));
  }

  error(message: LogMessage, owner?: string) {
    this.push(new LogItem(owner || this.config.owner, "error", message));
  }

  success(message: LogMessage, owner?: string) {
    this.push(new LogItem(owner || this.config.owner, "success", message));
  }

  failed(message: LogMessage, owner?: string) {
    this.push(new LogItem(owner || this.config.owner, "failed", message));
  }
}
