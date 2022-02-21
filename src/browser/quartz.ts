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
export const DEFAULT_SEGMENT_DISABLED_COLOR = "#ddd";
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
};

export class QuartzDigit {
  refs: any = {};
  props: QuartzDigitProps;

  constructor() {}

  get totalWidth() {
    return this.props.segmentWidth * 2 + this.props.segmentLength * 1;
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
            "grid-template-columns": `${this.props.segmentWidth}px ${this.props.segmentLength}px ${this.props.segmentWidth}px`,
            "grid-template-rows": `${this.props.segmentWidth}px ${this.props.segmentLength}px ${this.props.segmentWidth}px ${this.props.segmentLength}px ${this.props.segmentWidth}px`,
          },
        },
        QUARTZ_SEGMENTS.map((seg: string) => {
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

  build(number: number) {
    let i = 1;
    for (let seg of QUARTZ_SEGMENTS) {
      const ref = this.refs[seg];
      const el = ref._rawValue;
      const st = el.style;
      const hasSeg = QUARTZ_DIGIT_SEGMENTS[seg].includes(number);
      setTimeout(() => {
        st.backgroundColor = hasSeg
          ? this.props.segmentActiveColor
          : this.props.segmentDisabledColor;
        st.boxShadow = hasSeg
          ? `0 0 ${px(this.props.segmentWidth)} ${
              this.props.segmentActiveColor
            }`
          : "none";
      }, this.props.transDelay * i++);
    }
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
      },
      setup(props: any) {
        self.props = props;

        QUARTZ_SEGMENTS.forEach((seg) => (self.refs[seg] = ref(0)));

        onMounted(() => {
          watchEffect(() => {
            const number = props.number;
            self.build(number);
          });
        });

        return self.renderFunction.bind(self);
      },
    });
  }
}

export class Quartz {
  react = reactive({});

  constructor() {}

  renderFunction() {
    return h("div", { class: "" }, [h(new QuartzDigit().defineComponent())]);
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
