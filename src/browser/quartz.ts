// class component

import {
  ref,
  onMounted,
  watchEffect,
  h,
  reactive,
  defineComponent,
} from "vue/dist/vue.esm-browser.prod";

import { px } from "./misc";
import { Duration } from "../shared/time";

//////////////////////////////////////////////////////

export const QUARTZ_SEGMENTS = [
  "top",
  "rightupper",
  "rightlower",
  "bottom",
  "leftlower",
  "leftupper",
  "middle",
] as const;

export type QuartzSegment = typeof QUARTZ_SEGMENTS[number];

export const QUARTZ_DIGIT_SEGMENTS = {
  top: [0, 2, 3, 5, 6, 7, 8, 9],
  rightupper: [0, 1, 2, 3, 7, 8, 9],
  rightlower: [0, 1, 3, 4, 5, 6, 7, 8, 9],
  bottom: [0, 2, 3, 5, 6, 8, 9],
  leftlower: [0, 2, 6, 8],
  leftupper: [0, 4, 5, 6, 8, 9],
  middle: [2, 3, 4, 5, 6, 8, 9],
};

export const DEFAULT_SEGMENT_WIDTH = 20;
export const DEFAULT_SEGMENT_LENGTH = 100;
export const DEFAULT_TRANSITION_DELAY = 45;
export const DEFAULT_SEGMENT_ACTIVE_COLOR = "#f00";
export const DEFAULT_SEGMENT_DISABLED_COLOR = "#bbb";
export const DEFAULT_BACKGROUND_COLOR = "#aaa";
export const DEFAULT_SEGMENT_RADIUS = 10;
export const DEFAULT_PADDING = 10;
export const DEFAULT_TRANSITION = 0.7;

export type QuartzDigitProps = {
  number: number;
  segmentWidth: number;
  segmentLength: number;
  transDelay: number;
  segmentActiveColor: string;
  segmentDisabledColor: string;
  backgroundColor: string;
  segmentRadius: number;
  padding: number;
  transition: number;
  separator: boolean;
  separatorWidthScale: number;
};

export class QuartzDigit {
  refs: any = {};
  props: QuartzDigitProps;

  constructor() {}

  get totalWidth() {
    return (
      this.props.segmentWidth * 2 +
      this.props.segmentLength *
        (this.props.separator ? this.props.separatorWidthScale : 1)
    );
  }

  get totalHeight() {
    return this.props.segmentWidth * 3 + this.props.segmentLength * 2;
  }

  renderFunction() {
    return h(
      "div",
      {
        class: "quartzdigit",
        style: {
          "background-color": `${this.props.backgroundColor} !important`,
          padding: px(this.props.padding),
        },
      },
      h(
        "div",
        {
          class: "grid",
          style: {
            "max-width": px(this.totalWidth),
            "max-height": px(this.totalHeight),
            "grid-template-columns": `${this.props.segmentWidth}px ${
              this.props.separator
                ? this.props.segmentLength * this.props.separatorWidthScale
                : this.props.segmentLength
            }px ${this.props.segmentWidth}px`,
            "grid-template-rows": `${this.props.segmentWidth}px ${this.props.segmentLength}px ${this.props.segmentWidth}px ${this.props.segmentLength}px ${this.props.segmentWidth}px`,
          },
        },
        this.props.separator
          ? ["top", "bottom"].map((name) =>
              h(
                "div",
                { class: "middle" + name },
                h("div", {
                  style: {
                    width: px(this.props.segmentWidth * 2),
                    height: px(this.props.segmentWidth),
                    borderRadius: px(this.props.segmentWidth / 2),
                    backgroundColor:
                      this.props.number < 0
                        ? this.props.segmentDisabledColor
                        : this.props.segmentActiveColor,
                    boxShadow:
                      this.props.number < 0
                        ? "none"
                        : `0 0 ${px(this.props.segmentWidth)} ${
                            this.props.segmentActiveColor
                          }`,
                  },
                })
              )
            )
          : QUARTZ_SEGMENTS.map((seg: string) => {
              return h("div", {
                ref: this.refs[seg],
                class: [seg],
                style: {
                  "border-radius": px(this.props.segmentRadius),
                  transition: `all ${this.props.transition}s`,
                },
              });
            })
      )
    );
  }

  setNumber(number: number) {
    try {
      let i = 1;
      for (let seg of QUARTZ_SEGMENTS) {
        const ref = this.refs[seg];
        const el = ref._rawValue;
        const st = el.style;
        const hasSeg = QUARTZ_DIGIT_SEGMENTS[seg].includes(number);
        setTimeout(() => {
          try {
            st.backgroundColor = hasSeg
              ? this.props.segmentActiveColor
              : this.props.segmentDisabledColor;
            st.boxShadow = hasSeg
              ? `0 0 ${px(this.props.segmentWidth)} ${
                  this.props.segmentActiveColor
                }`
              : "none";
          } catch (err) {}
        }, this.props.transDelay * i++);
      }
    } catch (err) {}
  }

  defineComponent() {
    const self = this;

    return defineComponent({
      props: {
        number: {
          type: Number,
          default: 0,
        },
        segmentWidth: {
          type: Number,
          default: DEFAULT_SEGMENT_WIDTH,
        },
        segmentLength: {
          type: Number,
          default: DEFAULT_SEGMENT_LENGTH,
        },
        transDelay: {
          type: Number,
          default: DEFAULT_TRANSITION_DELAY,
        },
        segmentActiveColor: {
          type: Number,
          default: DEFAULT_SEGMENT_ACTIVE_COLOR,
        },
        segmentDisabledColor: {
          type: Number,
          default: DEFAULT_SEGMENT_DISABLED_COLOR,
        },
        backgroundColor: {
          type: String,
          default: DEFAULT_BACKGROUND_COLOR,
        },
        segmentRadius: {
          type: Number,
          default: DEFAULT_SEGMENT_RADIUS,
        },
        padding: {
          type: Number,
          default: DEFAULT_PADDING,
        },
        transition: {
          type: Number,
          default: DEFAULT_TRANSITION,
        },
        separator: {
          type: Boolean,
          default: false,
        },
        separatorWidthScale: {
          type: Number,
          default: 1 / 5,
        },
      },
      setup(props: any) {
        self.props = props;

        QUARTZ_SEGMENTS.forEach((seg) => (self.refs[seg] = ref(0)));

        onMounted(() => {
          watchEffect(() => {
            const number = props.number;
            self.setNumber(number);
          });
        });

        return self.renderFunction.bind(self);
      },
    });
  }
}

export type QuartzDigitGroupProps = {
  digitProps: QuartzDigitProps;
  numDigits: number;
  leadingZeros: boolean;
  number: number;
};

export class QuartzDigitGroup {
  props: QuartzDigitGroupProps;
  quartzDigits: QuartzDigit[] = [];
  leadingZeros: boolean = false;

  constructor() {}

  genDigits() {
    const qd = this.quartzDigits.map((digit, i) =>
      h(digit.defineComponent(), {})
    );

    return qd;
  }

  renderFunction() {
    return h(
      "div",
      { class: "quartzdigitgroup" },
      h("div", { class: "cont" }, this.genDigits())
    );
  }

  setNumber(number: number) {
    try {
      let num = number;
      let done = false;
      for (let i = 0; i < this.props.numDigits; i++) {
        if (number < 0) {
          this.quartzDigits[this.props.numDigits - i - 1].setNumber(-1);
        } else {
          const curr = num % 10;
          this.quartzDigits[this.props.numDigits - i - 1].setNumber(
            done ? -1 : curr
          );
          num -= curr;
          num /= 10;
          if (num === 0 && !this.leadingZeros) {
            done = true;
          }
        }
      }
    } catch (err) {}
  }

  defineComponent() {
    const self = this;
    return defineComponent({
      props: {
        digitProps: {
          type: Object,
          default: () => ({}),
        },
        numDigits: {
          type: Number,
          default: 2,
        },
        leadingZeros: {
          type: Boolean,
          default: false,
        },
        number: {
          type: Number,
          default: 0,
        },
      },
      setup(props: any) {
        self.props = props;

        self.quartzDigits = Array(self.props.numDigits)
          .fill(0)
          .map(() => new QuartzDigit());

        onMounted(() => {
          watchEffect(() => {
            const number = self.props.number;
            self.setNumber(number);
          });
        });

        return self.renderFunction.bind(self);
      },
    });
  }
}

export type QuartzDurationProps = {
  digitProps: QuartzDigitProps;
  durationMs: number;
};

export class QuartzDuration {
  props: QuartzDurationProps;

  groups: QuartzDigitGroup[] = [];

  seps: QuartzDigit[] = [0, 1].map((i) => new QuartzDigit());

  constructor() {}

  renderFunction() {
    return h(
      "div",
      { class: "quartzduration" },
      h(
        "div",
        {
          class: "cont",
          style: {
            border: `solid 10px #777`,
          },
        },
        [
          h(this.groups[0].defineComponent()),
          h(this.seps[0].defineComponent(), { separator: true }),
          h(this.groups[1].defineComponent()),
          h(this.seps[1].defineComponent(), { separator: true }),
          h(this.groups[2].defineComponent()),
        ]
      )
    );
  }

  setDurationMs(durationMs: number) {
    try {
      const dur = new Duration(durationMs);

      this.groups[0].setNumber(dur.hours || -1);
      this.groups[1].leadingZeros = dur.hours > 0;
      this.seps[0].props.number = dur.hours > 0 ? 1 : -1;
      this.groups[1].setNumber(dur.minutes || -1);
      this.groups[2].leadingZeros = dur.minutes > 0;
      this.seps[1].props.number = dur.minutes > 0 ? 1 : -1;
      this.groups[2].setNumber(dur.seconds);
    } catch (err) {}
  }

  defineComponent() {
    const self = this;

    return defineComponent({
      props: {
        digitProps: {
          type: Object,
          default: () => {},
        },
        durationMs: {
          type: Number,
          default: 0,
        },
      },
      setup(props: any) {
        self.props = props;

        self.groups = [
          new QuartzDigitGroup(),
          new QuartzDigitGroup(),
          new QuartzDigitGroup(),
        ];

        onMounted(() => {
          watchEffect(() => {
            const durationMs = self.props.durationMs;
            self.setDurationMs(durationMs);
          });
        });

        return self.renderFunction.bind(self);
      },
    });
  }
}
