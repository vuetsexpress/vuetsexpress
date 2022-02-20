import {
  createApp,
  defineComponent,
  h,
  reactive,
  ref,
} from "vue/dist/vue.esm-browser.prod";
import { hotReload, post, setLogger } from "./api";
import {
  textInput,
  link,
  centeredFlex,
  confirm,
  alertJson,
  alertError,
  confirmButton,
  globalReact,
  remoteStorage,
} from "./misc";

import OauthWidget from "./oauthwidget";
import { ConfigNode } from "./configeditor";
import { Tabs } from "./tabs";
import { EventConsumer } from "./sse";
import { WebLogger } from "./logger";
import { DEFAULT_REPO_URL, CHAT_MESSAGE_MAX_LENGTH } from "../shared/config";
import { Board } from "./board";
import { randomQuote } from "../shared/quotes";
import { CreateSeek, ShowSeek, showUser, ShowMatch } from "./createseek";
import { Seek, Match } from "../shared/models";
import { headSort } from "../shared/utils";

//////////////////////////////////////////////////////////////////////

export const logger = new WebLogger();
setLogger(logger.logger);

export const react = reactive({
  activeUsers: [],
  messages: [],
  header: "",
});

//////////////////////////////////////////////////////////////////////

export function setQuote() {
  const [quote, by] = randomQuote(150, 40);
  react.header = `" ${quote} " <span style="font-weight:bold; color:#0f0;">${by}</span>`;
}

setInterval(() => {
  setQuote();
}, 30000);

setQuote();

//////////////////////////////////////////////////////////////////////

export function setSeeks(ev: any) {
  if (typeof ev !== "object") return;

  globalReact.seeks = (ev.seeks || []).map((s: any) => new Seek(s));
}

export function setMatches(ev: any) {
  if (typeof ev !== "object") return;

  globalReact.matches = (ev.matches || []).map((m: any) => new Match(m));
}

export function setMessages(ev: any) {
  if (typeof ev !== "object") return;

  react.messages = ev.messages || [];
}

export function delSeek(s: Seek, ev: any) {
  post("msg", s.setDelete(ev.ctrlKey).serialize()).then((result: any) => {
    alertError(result);
  });
}

//////////////////////////////////////////////////////////////////////

new EventConsumer({
  logger: logger.logger,
  logFilter: (ev: any) => {
    if (["tick", "setpingdelay", "seeks", "activeusers"].includes(ev.kind))
      return false;
    return true;
  },
  eventCallback: (ev: any) => {
    if (ev.kind === "activeusers") {
      react.activeUsers = ev.activeUsers;

      return;
    }

    if (ev.kind === "chat") {
      setMessages(ev);

      return;
    }

    if (ev.kind === "seeks") {
      setSeeks(ev);

      return;
    }

    if (ev.kind === "matches") {
      setMatches(ev);

      return;
    }

    if (ev.kind === "announce") {
      globalReact.announce = ev.announce;

      return;
    }
  },
}).mount();

//////////////////////////////////////////////////////////////////////

const tabs = new Tabs("contentmiddle", [
  { caption: "Analysis", id: "analysisboard", icon: "search" },
  {
    caption: "Profile",
    id: "profile",
    icon: "profile",
    iconbutton: "iconbutton2",
  },
  { caption: "Seek", id: "createseek" },
  { caption: "Match", id: "match" },
  { caption: "Config", id: "config", adminOnly: true },
  { caption: "Logs", id: "logs", adminOnly: true },
]);

//////////////////////////////////////////////////////////////////////

const analysisBoard = new Board();
const analysisBoardComp = h(analysisBoard.defineComponent());

const analysisboard = h(
  "div",
  {
    style: {
      padding: "5px",
    },
    onClick: (ev: any) => {
      if (ev.ctrlKey && confirm("delete analysis", "delanalysis")) {
        post("delanalysis").then((result: any) => {
          alertError(result);
        });
      }
    },
  },
  analysisBoardComp
);

const profile = () =>
  h(
    "div",
    {
      onClick: (ev: any) => {
        if (ev.ctrlKey && confirm("delete users", "delusers")) {
          post("delusers").then((result: any) => {
            alertError(result);
          });
        }
      },
      class: "profilecont",
    },
    [
      h(
        "button",
        {
          class: "login",
          onClick: () => {
            const token = window.prompt("Token");
            if (token) {
              localStorage.setItem("USER_TOKEN", `${token}`);
              document.location.reload();
            }
          },
        },
        "Login With Token"
      ),
      h(
        "button",
        {
          class: "reveal",
          style: {
            backgroundColor: globalReact.revealToken ? "#afa" : "#faa",
          },
          onClick: () => {
            globalReact.revealToken = !globalReact.revealToken;
          },
        },
        globalReact.revealToken ? "Hide Token" : "Reveal Token"
      ),
      h("hr"),
      globalReact.revealToken
        ? [
            h(
              "div",
              {},
              textInput({
                width: 400,
                copy: true,
                forceValue: globalReact.user.token,
              })
            ),
            h("hr"),
          ]
        : undefined,
      [
        globalReact.user.lichessProfile
          ? h(
              "div",
              { class: "profileinfo" },
              link(
                globalReact.user.lichessProfileUrl(),
                "User has lichess profile."
              )
            )
          : h(
              "div",
              { class: ["profileinfo", "none"] },
              "User has no lichess profile."
            ),
        globalReact.user.lichessProfile
          ? h("table", { class: "perfs" }, [
              h("tr", { class: "head" }, [
                h("td", {}, "Category"),
                h("td", {}, "Rating"),
                h("td", {}, "RD"),
                h("td", {}, "Progress"),
                h("td", {}, "Games"),
              ]),
              globalReact
                .getPerfs()
                .map((perf: any) =>
                  h("tr", {}, [
                    h("td", {}, perf.cat),
                    h("td", {}, perf.rating),
                    h("td", {}, perf.rd),
                    h("td", {}, perf.prog),
                    h("td", {}, perf.games),
                  ])
                ),
            ])
          : undefined,
      ],
    ]
  );

const createSeek = new CreateSeek();
const createseek = h(createSeek.defineComponent());

const matchComp = new ShowMatch();
const match = centeredFlex(h(matchComp.defineComponent()));

const conf = new ConfigNode("config");
const config = h(conf.defineComponent(), {
  onUpload: (ev: any) => {
    post("setconfig", { config: conf.serialize(conf) }).then((result) => {
      alertJson(result);
    });
  },
});

const logs = h("div", { class: "logscont" }, [
  h("div", { class: "controls" }, [
    confirmButton("Delete Db", "delete entire databse", "deldb", function () {
      post("deldb").then((result: any) => {
        alertError(result);
      });
    }),
    h("input", {
      class: "cli",
      type: "text",
      onKeyup: (ev: any) => {
        if (ev.keyCode === 13) {
          const commandLine = ev.target.value;
          ev.target.value = "";
          post("cli", { commandLine }).then((result: any) => {
            //alertError(result)
          });
        }
      },
    }),
  ]),
  h("div", { class: "weblogger" }, h(logger.defineComponent())),
]);

const contentMiddleDispatch = {
  analysisboard,
  profile,
  createseek,
  match,
  config,
  logs,
};

//////////////////////////////////////////////////////////////////////

const topHeader = () =>
  centeredFlex(h("div", { style: { color: "#ff0" }, innerHTML: react.header }));

const headerLeft = () =>
  centeredFlex(h("div", { class: "title" }, globalReact.appDisplayName));

const headerMiddle = () => h(tabs.defineComponent());

const headerRightRef = ref(0);

//////////////////////////////////////////////////////////////////////

function indexOnLogin() {
  post("getglobalconfig").then((result: any) => {
    conf.setFromBlob(result.content);
  });

  post("getactiveusers").then((result: any) => {
    const activeUsers = result.activeUsers;
    if (Array.isArray(activeUsers)) {
      react.activeUsers = result.activeUsers;
    }
  });

  post("getchat").then((result: any) => {
    setMessages(result);
  });

  post("getseeks").then((result: any) => {
    setSeeks(result);
  });

  post("getmatches").then((result: any) => {
    setMatches(result);
  });

  remoteStorage.mount();
}

//////////////////////////////////////////////////////////////////////

const headerRight = () =>
  h(OauthWidget, {
    logger: logger.logger,
    watch: headerRightRef,
    onLogin: indexOnLogin,
  });

const contentLeftTop = () =>
  h(
    "div",
    {},
    react.activeUsers.map((user: any) => showUser(user))
  );

const chatInput = () =>
  h("input", {
    class: "chatinput",
    type: "text",
    maxlength: CHAT_MESSAGE_MAX_LENGTH,
    onKeyup: (ev: any) => {
      if (ev.keyCode === 13) {
        const message = ev.target.value;
        ev.target.value = "";
        post("chat", { message }).then((result: any) => {
          alertError(result);
        });
      }
    },
  });

const chatMessagesProps = () => ({
  class: "chatmessages",
  onClick: (ev: any) => {
    if (ev.ctrlKey && confirm("delete chat", "delchat")) {
      post("delchat", {}).then((result: any) => {
        alertError(result);
      });
    }
  },
});

const chatMessagesNode = () =>
  react.messages
    .slice()
    .reverse()
    .map((message: any) =>
      h("div", {}, [
        h("div", { class: "username" }, message.user.username),
        h(
          "div",
          {
            class: "message",
            onClick: (ev: any) => {
              ev.stopPropagation();
              if (
                ev.ctrlKey &&
                confirm(`delete message < ${message.message} >`, "del")
              ) {
                ev.stopPropagation();

                post("deletemessage", { id: message.id }).then(
                  (result: any) => {
                    alertError(result);
                  }
                );
              }
            },
          },
          message.message
        ),
      ])
    );

const contentLeftBottom = () => [
  h("div", chatMessagesProps(), chatMessagesNode()),
  chatInput(),
];

const contentMiddle = () =>
  ["logs", "createseek", "match", "config", "profile"].includes(
    tabs.effSelectedTabId()
  )
    ? typeof (contentMiddleDispatch as any)[tabs.effSelectedTabId()] !==
      "function"
      ? (contentMiddleDispatch as any)[tabs.effSelectedTabId()]
      : (contentMiddleDispatch as any)[tabs.effSelectedTabId()]()
    : centeredFlex((contentMiddleDispatch as any)[tabs.effSelectedTabId()]);

const contentRightTopSeeks = () => {
  const sorted = headSort(globalReact.seeks, (s: Seek) =>
    s.user.sameIdAs(globalReact.user)
  ) as Seek[];
  return sorted.map((s: any, i) => [
    !globalReact.user.sameIdAs(s.user) && i > 0
      ? globalReact.user.sameIdAs(sorted[i - 1].user)
        ? h("hr", { class: "tophr" })
        : undefined
      : undefined,
    h(
      new ShowSeek(s)
        .setOnClick((s: Seek, ev: any) => {
          ev.stopPropagation();
          delSeek(s, ev);
        })
        .defineComponent(),
      {
        class: {
          own: s.user.sameIdAs(globalReact.user),
        },
      }
    ),
  ]);
};

const contentRightTop = () =>
  h(
    "div",
    {
      onClick: (ev: any) => {
        if (ev.ctrlKey && confirm("delete seeks", "delseeks")) {
          post("delseeks").then((result: any) => {
            alertError(result);
          });
        }
      },
    },
    contentRightTopSeeks()
  );

const contentRightBottomMatches = () => {
  const sorted = headSort(globalReact.matches, (m: Match) =>
    m.hasUser(globalReact.user)
  ) as Match[];
  return sorted.map((m: any, i) => [
    !m.hasUser(globalReact.user) && i > 0
      ? sorted[i - 1].hasUser(globalReact.user)
        ? h("hr", { class: "tophr" })
        : undefined
      : undefined,
    h(
      new ShowSeek(m.seek)
        .setOnClick((s: Seek, ev: any) => {
          ev.stopPropagation();
          // TODO
        })
        .defineComponent(),
      {
        class: {
          own: m.hasUser(globalReact.user),
        },
      }
    ),
  ]);
};

const contentRightBottom = () =>
  h(
    "div",
    {
      onClick: (ev: any) => {
        if (ev.ctrlKey && confirm("delete matches", "delmatches")) {
          post("delmatches").then((result: any) => {
            alertError(result);
          });
        }
      },
    },
    contentRightBottomMatches()
  );

//const footerLeft = () => centeredFlex("footer left");

const footerMiddle = () =>
  centeredFlex(h("div", { innerHTML: globalReact.announce }));

//const footerRight = () => centeredFlex("footer right");

const bottomFooter = () =>
  centeredFlex([
    link(DEFAULT_REPO_URL, "Source on GitHub"),
    link("/allusers", "All Users"),
    globalReact.isAdmin ? link("/man", "Manager") : undefined,
  ]);

const index = defineComponent({
  setup() {
    return () => {
      const indexNode = h("div", { class: "app" }, [
        h("div", { class: "grid" }, [
          h(
            "div",
            {
              class: "topheader",
              onClick: (ev: any) => {
                if (ev.ctrlKey) {
                  alertJson(APP_CONF);
                }
              },
            },
            topHeader()
          ),
          h("div", { class: ["header", "left"] }, headerLeft()),
          h("div", { class: ["header", "middle"] }, headerMiddle()),
          h(
            "div",
            {
              class: ["header", "right"],
              ref: headerRightRef,
              id: "headerrightref",
            },
            headerRight()
          ),
          h("div", { class: ["content", "left", "top"] }, contentLeftTop()),
          h(
            "div",
            { class: ["content", "left", "bottom"] },
            contentLeftBottom()
          ),
          h(
            "div",
            {
              class: ["content", "middle"],
              style: {
                overflow:
                  tabs.effSelectedTabId() === "logs"
                    ? "initial"
                    : "scroll !important",
              },
            },
            contentMiddle()
          ),
          h("div", { class: ["content", "right", "top"] }, contentRightTop()),
          h(
            "div",
            { class: ["content", "right", "bottom"] },
            contentRightBottom()
          ),
          //h("div", { class: ["footer", "left"] }, footerLeft()),
          h("div", { class: ["footer", "middle"] }, footerMiddle()),
          //h("div", { class: ["footer", "right"] }, footerRight()),
          h("div", { class: "bottomfooter" }, bottomFooter()),
        ]),
      ]);
      return indexNode;
    };
  },
  template: "index",
});

//////////////////////////////////////////////////////////////////////

const app = createApp(index);

app.mount("#app");

//////////////////////////////////////////////////////////////////////

setTimeout(() => {
  const welcomeElement = document.getElementById("welcome") as any;

  welcomeElement.style.display = "none";

  const appContElement = document.getElementById("appcont") as any;

  appContElement.style.display = "initial";

  hotReload();
}, 3000);
