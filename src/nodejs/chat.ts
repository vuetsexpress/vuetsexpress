import { Db, Collection } from "./mongodb";
import { Router } from "./utils";
import { SseServer } from "./sse";
import _ from "lodash";
import { ChatMessage } from "../shared/models";
import {
  MAX_CHAT_MESSAGES,
  DISCARD_CHAT_MESSAGE_AFTER,
  CHAT_TIME_QUOTA,
} from "./config";
import { SECOND } from "../shared/time";
import { CHAT_MESSAGE_MAX_LENGTH } from "../shared/config";

/////////////////////////////////////////////////////////////////

export type ChatSetup = {
  appDb: Db;
  api: Router;
  sseServer: SseServer;
};

export class Chat {
  appDb: Db;
  api: Router;
  sseServer: SseServer;
  messagesColl: Collection;

  debounceSendMessagesToAll = _.debounce(this.sendMessages.bind(this), 3000);

  constructor(cs: ChatSetup) {
    this.appDb = cs.appDb;
    this.api = cs.api;
    this.sseServer = cs.sseServer;
    this.messagesColl = this.appDb.collection("chat", {
      onConnect: this.messagesConnected.bind(this),
    });

    this.mount();
  }

  async messagesConnected() {
    await this.messagesColl.getAll();
  }

  getSortedMessages() {
    const messages = this.messagesColl
      .getAllLocalSync()
      .sort((a: any, b: any) => a.createdAt - b.createdAt);

    return messages;
  }

  sendMessagesEvent() {
    const messages = this.getSortedMessages();

    const ev = {
      kind: "chat",
      messages,
    };

    return ev;
  }

  sendMessages() {
    this.sseServer.sendEventToAllConsumers(this.sendMessagesEvent());
  }

  checkMessagesFunc() {
    return new Promise((resolve) => {
      const messages = this.getSortedMessages();
      if (messages.length) {
        const message = new ChatMessage(messages[0]);
        if (message.age() > DISCARD_CHAT_MESSAGE_AFTER) {
          this.messagesColl.deleteOneById(message.id).then((result: any) => {
            resolve(true);
          });
          return;
        } else if (messages.length > MAX_CHAT_MESSAGES) {
          this.messagesColl
            .deleteOneById(messages[messages.length - 1].id)
            .then((result: any) => {
              resolve(true);
            });
          return;
        } else {
          resolve(false);
          return;
        }
      } else {
        resolve(false);
        return;
      }
    });
  }

  async checkMessages() {
    const deleted = await this.checkMessagesFunc();

    if (deleted) {
      this.sendMessages();
      setTimeout(this.checkMessages.bind(this), SECOND);
    } else {
      setTimeout(this.checkMessages.bind(this), 10 * SECOND);
    }
  }

  mount() {
    this.api.postAuth("/chat", async (req: any, res: any) => {
      const user = req.lightUser;

      if (this.messagesColl.getAllLocalSync().length > MAX_CHAT_MESSAGES * 2) {
        res.json({ error: "Chat Max Size Exceeded" });

        return;
      }

      const exceeded = CHAT_TIME_QUOTA.exceeded(
        this.getSortedMessages(),
        (doc) => {
          return doc.user.id === user.id;
        }
      );

      if (exceeded) {
        res.json({ error: "Chat Quota Exceeded" });

        return;
      }

      const message = req.body.message;

      if (message.length > CHAT_MESSAGE_MAX_LENGTH) {
        res.json({
          error: `Chat Message Too Long ( Length ${message.length} , Allowed ${CHAT_MESSAGE_MAX_LENGTH} )`,
        });

        return;
      }

      const chatMessage = new ChatMessage({
        message,
        user,
      });

      await this.messagesColl.setDocById(
        chatMessage.id,
        chatMessage.serialize()
      );

      this.sendMessages();

      res.json({ ok: true });
    });

    this.api.post("/getchat", (req: any, res: any) => {
      res.json(this.sendMessagesEvent());
    });

    this.api.postAdmin("/delchat", (req: any, res: any) => {
      this.messagesColl.drop().then((result) => {
        this.sendMessages();

        res.json(result);
      });
    });

    this.api.postAdmin("/deletemessage", (req: any, res: any) => {
      this.messagesColl.deleteOneById(req.body.id).then((result) => {
        this.sendMessages();

        res.json(result);
      });
    });

    setTimeout(this.checkMessages.bind(this), 10 * SECOND);

    return this;
  }
}
