// class component

import {
  ref,
  onMounted,
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

export const QUARTZ_DIGIT_SEGMENTS = {
  top: [0, 2, 3, 5, 6, 7, 8, 9],
  rightupper: [0, 1, 2, 3, 7, 8, 9],
  rightlower: [0, 1, 3, 4, 5, 6, 7, 8, 9],
  bottom: [0, 2, 3, 5, 6, 8, 9],
  leftlower: [0, 2, 6, 8],
  leftupper: [0, 4, 5, 6, 8, 9],
  middle: [2, 3, 4, 5, 6, 8, 9],
};

export class QuartzDigit {
  refs: any = {};

  constructor() {}

  renderFunction() {
    return h(
      "div",
      { class: "quartzdigit" },
      h(
        "div",
        { class: "grid" },
        QUARTZ_SEGMENTS.map((seg: string) => {
          return h("div", {
            ref: this.refs[seg],
            class: [seg],
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
        st.backgroundColor = hasSeg ? "#f00" : "#ddd";
      }, 100 * i++);
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
      },
      setup(props: any) {
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
