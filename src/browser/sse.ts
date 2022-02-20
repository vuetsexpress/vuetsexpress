import {
  uid,
  SSE_DEFAULT_DROP_DELAY,
  SSE_DEFAULT_TICK_DELAY,
  Logger,
} from "../shared/utils";

import { get } from "./api";

//////////////////////////////////////////////////////////////

export type EventConsumerConfig = {
  endpoint?: string;
  id?: string;
  name?: string;
  description?: string;
  pingDelay?: number;
  tickDelay?: number;
  logger?: Logger;
  eventCallback?: any;
  logFilter?: (ev: any) => boolean;
};

export class EventConsumer {
  endpoint = "events";
  id = uid();
  name = "eventconsumer";
  description = "eventconsumer";
  pingDelay = SSE_DEFAULT_DROP_DELAY / 2;
  tickDelay = SSE_DEFAULT_TICK_DELAY;
  lastTick = Date.now();
  logger: Logger = new Logger({ owner: this.name });
  eventCallback: any = (ev: any) => {};
  source: any;
  logFilter = (ev: any) => true;

  constructor(eccOpt?: EventConsumerConfig) {
    if (eccOpt) {
      this.endpoint = eccOpt.endpoint || this.endpoint;
      this.id = eccOpt.id || this.id;
      this.name = eccOpt.name || this.name;
      this.description = eccOpt.description || this.description;
      this.pingDelay = eccOpt.pingDelay || this.pingDelay;
      this.tickDelay = eccOpt.tickDelay || this.tickDelay;
      this.logger = eccOpt.logger || this.logger;
      this.eventCallback = eccOpt.eventCallback || ((ev: any) => {});
      this.logFilter = eccOpt.logFilter || this.logFilter;
    }
  }

  endPointUrl() {
    return `/api/${this.endpoint}/?id=${this.id}&name=${this.name}&description=${this.description}`;
  }

  pingUrl() {
    return `${this.endpoint}/ping/?id=${this.id}`;
  }

  ping() {
    get(this.pingUrl()).then((pingResult: any) => {});
  }

  checkTick() {
    if (Date.now() - this.lastTick > 2 * this.tickDelay) {
      this.logger.log({ timedOut: this.id }, this.name);
      this.source.close();
      this.id = uid();
      this.mount();
    }
  }

  mount() {
    this.source = new EventSource(this.endPointUrl());

    this.source.onopen = () => {
      //this.logger.log({ sourceOpened: this.id }, this.name);

      this.lastTick = Date.now();
    };

    this.source.onerror = () => {
      this.logger.log({ sourceFailed: this.id }, this.name);
    };

    this.source.onmessage = (ev: any) => {
      const data = JSON.parse(ev.data);

      const kind = data.kind;

      if (kind === "setpingdelay") {
        this.pingDelay = data.pingDelay;

        if (this.logFilter(data)) this.logger.log(data, this.name);

        setInterval(this.ping.bind(this), this.pingDelay);
        setInterval(this.checkTick.bind(this), this.tickDelay);

        return;
      }

      if (kind === "tick") {
        if (this.logFilter(data)) this.logger.log(data, this.name);

        this.lastTick = Date.now();

        return;
      }

      if (kind === "drop") {
        this.logger.log(data, this.name);

        this.mount();

        return;
      }

      if (this.logFilter(data)) this.logger.log({ event: data }, this.name);

      this.eventCallback(data);
    };

    return this;
  }
}
