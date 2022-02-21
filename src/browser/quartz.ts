// class component

import {
  watchEffect,
  h,
  reactive,
  defineComponent,
} from "vue/dist/vue.esm-browser.prod";

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

export class QuartzDigit {
  react = reactive({
    number: 0,
    top: false,
    rightupper: false,
    rightlower: false,
    bottom: false,
    leftlower: false,
    leftupper: false,
    middle: false,
  });

  constructor() {}

  renderFunction() {
    return h(
      "div",
      { class: "quartzdigit" },
      h(
        "div",
        { class: "grid" },
        QUARTZ_SEGMENTS.map((seg: string) =>
          h("div", {
            style: { backgroundColor: this.react[seg] ? "#f00" : "#eee" },
            class: [seg],
          })
        )
      )
    );
  }

  calcReactFromNumber(number: number) {
    this.react.top = [0, 2, 3, 5, 6, 7, 8, 9].includes(number);
    this.react.rightupper = [0, 1, 2, 3, 7, 8, 9].includes(number);
    this.react.rightlower = [0, 1, 3, 4, 5, 6, 7, 8, 9].includes(number);
    this.react.bottom = [0, 2, 3, 5, 6, 8, 9].includes(number);
    this.react.leftlower = [0, 2, 6, 8].includes(number);
    this.react.leftupper = [0, 4, 5, 6, 8, 9].includes(number);
    this.react.middle = [2, 3, 4, 5, 6, 8, 9].includes(number);
  }

  defineComponent() {
    const self = this;
    return defineComponent({
      props: {
        number: {
          type: Number,
          default: 0,
        },
      },
      setup(props: any) {
        watchEffect(() => {
          const number = props.number;
          self.calcReactFromNumber(number);
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
