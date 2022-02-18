import { Logger, LogItem, LogDisposition } from "../shared/utils";

import { h, reactive, defineComponent } from "vue/dist/vue.esm-browser.prod";

////////////////////////////////////////////////////////////////

export class WebLogger {
  logger = new Logger({
    owner: "weblogger",
    changeCallback: this.change.bind(this),
  });

  react = reactive({
    key: 0,
  });

  constructor() {}

  change() {
    this.react.key++;
  }

  renderFunction() {
    return h("div", { class: "logger" }, [
      h(
        "div",
        { class: "cont", key: this.react.key },
        this.logger.buffer.map((li) =>
          h(
            "pre",
            {
              class: ["logitem", li.disposition],
            },
            li.asText()
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
