import {
  defineComponent,
  h,
  onMounted,
  reactive,
  ref,
  nextTick,
} from "vue/dist/vue.esm-browser.prod";

import { Chessground } from "@publishvue/chessground";
import { px } from "./misc";
import { uid, typDeb, shortDeb } from "../shared/utils";
import { Game } from "../chessops";
import { post } from "./api";
import _ from "lodash";
import { CHESSOPS_VARIANT_KEY, ALLOWED_VARIANTS } from "../shared/models";
import { DEFAULT_VARIANT_KEY } from "../shared/config";

////////////////////////////////////////////////////////////////////////////

export class Board {
  id = uid();
  board: any;
  react = reactive({
    size: 360,
    scale: 0.6,
    game: Game().setVariant(DEFAULT_VARIANT_KEY, undefined),
    uploadPending: true,
  });
  debouncerUpload = typDeb(this.upload.bind(this));
  innerConteinerRef = ref(0);

  constructor() {}

  setScale(scale: number) {
    this.react.scale = scale;
    return this;
  }

  debounceUpload() {
    this.debouncerUpload();
    this.react.uploadPending = true;
  }

  upload() {
    post("storeanalysis", { game: this.react.game.serialize() }).then(
      (result: any) => {
        if (result.error) {
          //window.alert(result.error);
        } else {
          this.react.uploadPending = false;
        }
      }
    );
  }

  setVariant(variant: CHESSOPS_VARIANT_KEY) {
    this.react.game.setVariant(variant, undefined);
    this.setUp();
  }

  renderFunction() {
    const innerContainer = h("div", {
      ref: this.innerConteinerRef,
      style: { width: px(this.react.size), height: px(this.react.size) },
      class: ["maplebackground", "is2d"],
    });

    const outerContainer = h(
      "div",
      { style: { width: px(this.react.size), height: px(this.react.size) } },
      [innerContainer]
    );

    const tobeginButton = h(
      "button",
      {
        class: "yellow",
        onClick: () => {
          this.react.game.toBegin();
          this.setUp();
        },
      },
      "<<"
    );

    const backButton = h(
      "button",
      {
        class: ["green", "wide"],
        onClick: () => {
          this.react.game.back();
          this.setUp();
        },
      },
      "<"
    );

    const forwardButton = h(
      "button",
      {
        class: ["green", "wide"],
        onClick: () => {
          this.react.game.forward();
          this.setUp();
        },
      },
      ">"
    );

    const toendButton = h(
      "button",
      {
        class: "yellow",
        onClick: () => {
          this.react.game.toEnd();
          this.setUp();
        },
      },
      ">>"
    );

    const delButton = h(
      "button",
      {
        class: "red",
        onClick: () => {
          this.react.game.del();
          this.setUp();
        },
      },
      "X"
    );

    const resetButton = h(
      "button",
      {
        class: "veryred",
        onClick: () => {
          this.setVariant(this.react.game.variant);
        },
      },
      "R"
    );

    const selectVariantCombo = h(
      "select",
      {
        onChange: (ev: any) => {
          this.setVariant(ev.target.value);
        },
        style: {
          "margin-left": px(8),
          "font-size": px(17),
          "font-family": "monospace",
          "margin-right": px(20),
          "background-color": this.react.uploadPending ? "#fdd" : "#dfd",
        },
      },
      ALLOWED_VARIANTS.map((v) =>
        h(
          "option",
          {
            value: v.chessopsKey,
            selected: v.chessopsKey === this.react.game.variant,
          },
          v.displayName
        )
      )
    );

    const controlsContainer = h(
      "div",
      {
        style: {
          transform:
            this.react.size >= 400
              ? "scale(1)"
              : `scale(${this.react.size / 440})`,
        },
        class: "controlscont",
      },
      [
        selectVariantCombo,
        tobeginButton,
        backButton,
        forwardButton,
        toendButton,
        delButton,
        resetButton,
      ]
    );

    const vertContainer = h("div", { class: "vertcont" }, [
      outerContainer,
      controlsContainer,
    ]);

    const board = h("div", { class: "board" }, [vertContainer]);

    return board;
  }

  movePlayed(orig: string, dest: string) {
    const uci = orig + dest;

    const legals = this.react.game.pos.legalsForUci(uci);

    if (legals.length) {
      const playUci = legals[0];

      this.react.game.playUci(playUci);

      this.setUp();
    } else {
      window.alert("Illegal Move");

      this.setUp(true);
    }
  }

  makeBoard() {
    try {
      this.board = Chessground(this.innerConteinerRef._rawValue);

      this.board.set({
        movable: {
          events: {
            after: (orig: string, dest: string) => this.movePlayed(orig, dest),
          },
        },
      });
    } catch (err) {
      console.warn("could not create board");
    }
  }

  highlightMove(uci?: string) {
    if (!uci) {
      this.board.set({ lastMove: undefined });
    } else {
      this.board.set({
        lastMove: [uci.substring(0, 2), uci.substring(2, 4)],
      });
    }
  }

  setUp(skipUpload?: boolean) {
    this.board.set({ fen: this.react.game.reportFen() });

    this.highlightMove(this.react.game.current.genUci);

    if (!skipUpload) this.debounceUpload();
  }

  onResize() {
    const size = Math.floor((window.innerHeight * this.react.scale) / 8) * 8;

    this.react.size = size;

    this.makeBoard();

    this.setUp(true);
  }

  getAnalysis() {
    post("getanalysis", {}).then((result: any) => {
      if (result.error) {
        //window.alert(result.error);
      } else if (result.game) {
        this.react.game.fromProps(result.game);
        this.react.uploadPending = false;

        this.setUp(true);
      }
    });
  }

  debResize = shortDeb(this.onResize.bind(this));

  onMounted() {
    window.addEventListener("resize", () => {
      this.debResize();
    });

    setTimeout(this.getAnalysis.bind(this), 2000);

    nextTick(() => {
      this.onResize();
    });
  }

  defineComponent() {
    const self = this;
    return defineComponent({
      setup() {
        onMounted(() => {
          self.onMounted.bind(self)();
        });

        return self.renderFunction.bind(self);
      },
    });
  }
}
