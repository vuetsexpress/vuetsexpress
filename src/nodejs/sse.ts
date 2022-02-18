import { Router } from "./utils";

import {
  uid,
  SSE_DEFAULT_DROP_DELAY,
  SSE_DEFAULT_TICK_DELAY,
  Logger,
} from "../shared/utils";

//////////////////////////////////////////////////////////////////

export const SSE_DEFAULT_RECONNECT_DELAY = 10000;
export const SSE_DEFAULT_LOGGER = new Logger({ owner: "sseserver" });

//////////////////////////////////////////////////////////////////

export type EventConsumer = {
  id: string;
  name: string;
  description: string;
  lastSeen: number;
  res: any;
};

export type SseSetup = {
  endpoint?: string;
  reconnectDelay?: number;
  dropDelay?: number;
  tickDelay?: number;
  logger?: Logger;
};

export const DEFAULT_SSE_SETUP: SseSetup = {
  endpoint: "events",
  reconnectDelay: SSE_DEFAULT_RECONNECT_DELAY,
  dropDelay: SSE_DEFAULT_DROP_DELAY,
  tickDelay: SSE_DEFAULT_TICK_DELAY,
  logger: SSE_DEFAULT_LOGGER,
};

export class SseServer {
  setup: SseSetup = DEFAULT_SSE_SETUP;
  consumers: EventConsumer[] = [];
  router = new Router();
  logger: Logger = SSE_DEFAULT_LOGGER;

  constructor(sseSetupOpt?: SseSetup) {
    if (sseSetupOpt) {
      this.setup = { ...DEFAULT_SSE_SETUP, ...sseSetupOpt };
    }
    this.logger = this.setup.logger || SSE_DEFAULT_LOGGER;
  }

  handler(req: any, res: any) {
    // register consumer
    const ec = {
      id: req.query.id || uid(),
      name: req.query.name || "anoneventconsumer",
      description: req.query.description || "unknowneventconsumer",
      lastSeen: Date.now(),
      res,
    };

    //this.logger.log(`registered event consumer ${ec.id}`);

    this.consumers.push(ec);

    // setup event source
    res.set({
      "Cache-Control": "no-cache",
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
    });

    res.flushHeaders();

    // tell the client to retry every this.setup.reconnectDelay seconds if connectivity is lost
    res.write(`retry: ${this.setup.reconnectDelay}\n\n`);

    // communicate ping delay to consumer
    this.sendEventRes(res, {
      kind: "setpingdelay",
      pingDelay: (this.setup.dropDelay || SSE_DEFAULT_DROP_DELAY) / 2,
    });
  }

  sendEventRes(res: any, ev: any) {
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  }

  sendEventToSingleConsumer(ec: EventConsumer, ev: any) {
    this.sendEventRes(ec.res, ev);
  }

  sendEventToAllConsumers(ev: any) {
    this.consumers.forEach((ec) => this.sendEventToSingleConsumer(ec, ev));
  }

  checkDrop() {
    const now = Date.now();
    this.consumers = this.consumers.filter((ec) => {
      const elapsed = now - ec.lastSeen;
      const drop = elapsed > (this.setup.dropDelay || SSE_DEFAULT_DROP_DELAY);
      if (drop) {
        this.logger.warn(`dropping ${ec.id}`);
        this.sendEventToSingleConsumer(ec, { kind: "drop", elapsed });
      }
      return !drop;
    });
  }

  getConsumerById(id: string) {
    return this.consumers.find((ec) => ec.id === id);
  }

  pingHandler(req: any, res: any) {
    const id = req.query.id;

    if (!id) {
      res.json({ error: `no id submitted in query` });
      return;
    }

    const ec = this.getConsumerById(id);

    if (ec) {
      ec.lastSeen = Date.now();

      res.json({ pong: id });
    } else {
      res.json({ error: `no consumer registered with id ${id}` });
    }
  }

  tick() {
    this.sendEventToAllConsumers({ kind: "tick", time: Date.now() });
  }

  mount(router: any) {
    this.router = router;

    this.router.get(`/${this.setup.endpoint}`, this.handler.bind(this));
    this.router.get(
      `/${this.setup.endpoint}/ping`,
      this.pingHandler.bind(this)
    );

    setInterval(this.checkDrop.bind(this), this.setup.dropDelay);
    setInterval(this.tick.bind(this), this.setup.tickDelay);

    return this;
  }
}
