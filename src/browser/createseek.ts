import {
  SUPPORTED_TIME_CONTROLS,
  DEFAULT_TIME_CONTROL,
} from "../shared/cconfig";
import {
  DEFAULT_VARIANT_KEY,
  DEFAULT_RATED,
  ALLOWED_ROUNDS,
  DEFAULT_ROUNDS,
} from "../shared/config";
import { ALLOWED_VARIANTS, Seek, User, Variant, Match } from "../shared/models";

import {
  h,
  reactive,
  defineComponent,
  onMounted,
} from "vue/dist/vue.esm-browser.prod";
import {
  alertError,
  centeredFlex,
  globalReact,
  Labeled,
  remoteStorage,
  DigitalClock,
} from "./misc";
import { post } from "./api";
import { Board } from "./board";
import { Game, Game_ } from "../chessops";

///////////////////////////////////////////////////////////////////////////

export function showUser(user: User) {
  return h(
    "div",
    { class: "showuser" },
    h("div", { class: "sucont" }, [
      user.title ? h("div", { class: "title" }, user.title) : undefined,
      h("div", { class: "suusername" }, user.username),
    ])
  );
}

export class ShowSeek {
  seek = new Seek({});
  hideUser: boolean;
  onClick: any;
  onDelete: any;

  setOnClick(onClick: any) {
    this.onClick = onClick;
    return this;
  }

  setOnDelete(onDelete: any) {
    this.onDelete = onDelete;
    return this;
  }

  constructor(seek: Seek, hideUser?: boolean) {
    this.seek = seek;
    this.hideUser = !!hideUser;
  }

  renderFunction() {
    return h(
      "div",
      { class: "showseek" },
      h(
        "div",
        {
          onClick: (ev: any) => {
            if (this.onClick) {
              this.onClick(this.seek, ev);
            }
          },
          class: "cont",
        },
        [
          this.seek.parentMatch
            ? h("div", { class: "ismatch" }, "MATCH")
            : h("div", { class: "isseek" }, "SEEK"),
          this.hideUser ? undefined : showUser(this.seek.user),
          this.hideUser
            ? undefined
            : this.seek.acceptor
            ? [
                h("div", { class: "hyphen" }, " vs. "),
                showUser(this.seek.acceptor),
              ]
            : undefined,
          h("div", { class: "variant" }, this.seek.variant.displayName),
          h("div", { class: "timecontrol" }, this.seek.tc.display()),
          h(
            "div",
            { class: "rounds" },
            this.seek.parentMatch
              ? `( ${this.seek.parentMatch.round} / ${this.seek.rounds} )`
              : `( ${this.seek.rounds} )`
          ),
          h("div", { class: "rated" }, this.seek.rated ? "Rated" : "Casual"),
          this.onDelete
            ? h(
                "div",
                {
                  onClick: (ev: any) => {
                    ev.stopPropagation();
                    this.onDelete(this.seek);
                  },
                  class: ["delete", "deletecursor"],
                },
                "X"
              )
            : undefined,
        ]
      )
    );
  }

  defineComponent() {
    const self = this;
    return defineComponent({
      setup() {
        return self.renderFunction.bind(self);
      },
    });
  }
}

export class CreateSeek {
  id: string;
  react = reactive({
    variant: DEFAULT_VARIANT_KEY,
    tcId: DEFAULT_TIME_CONTROL.id,
    rated: DEFAULT_RATED,
    rounds: DEFAULT_ROUNDS,
  });

  constructor(id?: string) {
    this.id = id || "createseek";
  }

  createSeek(seek: Seek) {
    post("msg", seek.serialize()).then((result: any) => {
      if (result.error) {
        window.alert(result.error);
      }
    });
  }

  renderFunction() {
    return h("div", { class: "createseek" }, [
      h("div", { class: "controls" }, [
        Labeled(
          "Variant",
          h(
            "select",
            {
              style: { color: "#007" },
              onChange: (ev: any) => {
                this.react.variant = ev.target.value;
              },
            },
            ALLOWED_VARIANTS.map((v) =>
              h(
                "option",
                {
                  value: v.chessopsKey,
                  selected: v.chessopsKey === this.react.variant,
                },
                v.displayName
              )
            )
          )
        ),
        Labeled(
          "Time Control",
          h(
            "select",
            {
              style: { color: "#070", "font-weight": "bold" },
              onChange: (ev: any) => {
                this.react.tcId = ev.target.value;
              },
            },
            SUPPORTED_TIME_CONTROLS.map((tc) =>
              h(
                "option",
                { value: tc.id, selected: tc.id === this.react.tcId },
                tc.display()
              )
            )
          )
        ),
        Labeled(
          "Rounds",
          h(
            "select",
            {
              style: { color: "#700" },
              onChange: (ev: any) => {
                this.react.rounds = ev.target.value;
              },
            },
            ALLOWED_ROUNDS.map((r) =>
              h("option", { value: r, selected: this.react.rounds === r }, r)
            )
          )
        ),
        Labeled(
          "Rated",
          h("input", {
            onChange: (ev: any) => {
              this.react.rated = ev.target.checked;
            },
            type: "checkbox",
            checked: this.react.rated,
          })
        ),
        h(
          "button",
          {
            class: "create",
            onClick: () => {
              const tc = SUPPORTED_TIME_CONTROLS.find(
                (tc) => tc.id === this.react.tcId
              );
              const seek = new Seek({
                variant: Variant.fromChessopsKey(this.react.variant),
                tc,
                rated: this.react.rated,
                rounds: this.react.rounds,
              });
              remoteStorage.unshiftCreatedSeek(this.id, seek);
              this.createSeek(seek);
            },
          },
          "Create"
        ),
      ]),
      h("hr"),
      h(
        "div",
        { class: "showseek" },
        remoteStorage.getCreatedSeeks(this.id).map((cs: any) =>
          h(
            new ShowSeek(cs, true)
              .setOnClick(() => {
                this.createSeek(cs);
              })
              .setOnDelete(() => {
                remoteStorage.deleteCreatedSeek(this.id, cs.id);
              })
              .defineComponent()
          )
        )
      ),
    ]);
  }

  defineComponent() {
    const self = this;
    return defineComponent({
      setup() {
        return self.renderFunction.bind(self);
      },
    });
  }
}

export type ShowMatchReact = {
  match: Match;
  currentGame: Game_;
  clockScale: number;
};

export class ShowMatch {
  topClock = new DigitalClock();
  bottomClock = new DigitalClock();

  react: ShowMatchReact = reactive({
    match: new Match(),
    currentGame: Game(),
    clockScale: 0.2,
  }) as ShowMatchReact;

  board: Board = new Board().setScale(0.55);
  showSeek() {
    return new ShowSeek(this.react.match.seek);
  }

  constructor() {}

  setMatch(match: Match) {
    this.react.match = match;
    this.react.match.setSelectedGameChangedCallback(
      this.selectedGameChanged.bind(this)
    );
    this.topClock.setTime(0, 3);
    this.bottomClock.setTime(0, 3);
    return this;
  }

  selectedGameChanged() {
    this.react.currentGame = this.react.match.selectedGame.clone();
    this.board.setGame(this.react.currentGame);
    this.board.setFlip(this.react.match.shouldFlip(globalReact.user));
    console.log("game", this.react.currentGame);
  }

  get match() {
    return this.react.match;
  }

  topPlayerRight() {
    if (this.match.started) return undefined;

    return h(
      "button",
      {
        class: "red",
        onClick: () => {
          post("abortmatch", { id: this.match.id }).then((result: any) => {
            alertError(result);
          });
        },
      },
      "Abort"
    );
  }

  renderFunction() {
    return h("div", { class: "showmatch" }, [
      h("div", { class: "grid" }, [
        h(
          "div",
          { class: "topplayername" },
          centeredFlex(showUser(this.react.match.topPlayer(globalReact.user)))
        ),
        h(
          "div",
          { class: "topplayerright" },
          centeredFlex(this.topPlayerRight())
        ),
        h("div", { class: "boardcont" }, h(this.board.defineComponent())),
        h(
          "div",
          { class: "topplayer" },
          centeredFlex(
            h(this.topClock.defineComponent(), {
              style: { transform: `scale(${this.react.clockScale})` },
            })
          )
        ),
        h("div", { class: "games" }, []),
        h(
          "div",
          { class: "middle" },
          centeredFlex(h(this.showSeek().defineComponent()))
        ),
        h("div", { class: "controls" }, []),
        h(
          "div",
          { class: "bottomplayer" },
          centeredFlex(
            h(this.bottomClock.defineComponent(), {
              style: { transform: `scale(${this.react.clockScale})` },
            })
          )
        ),
        h(
          "div",
          { class: "bottomplayername" },
          centeredFlex(
            showUser(this.react.match.bottomPlayer(globalReact.user))
          )
        ),
        h("div", { class: "bottomplayerright" }, []),
      ]),
    ]);
  }

  defineComponent() {
    const self = this;
    return defineComponent({
      setup() {
        onMounted(() => {});

        return self.renderFunction.bind(self);
      },
    });
  }
}
