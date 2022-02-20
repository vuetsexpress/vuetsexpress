import {
  h,
  reactive,
  ref,
  defineComponent,
} from "vue/dist/vue.esm-browser.prod";
import { post } from "./api";
import { JsonSerializable, User, Match, Seek } from "../shared/models";
import { MAX_STORED_SEEKS, DEFAULT_APP_DISPLAY_NAME } from "../shared/config";
import { min } from "lodash";

////////////////////////////////////////////////////////////

export class GlobalReact {
  isAdmin: boolean = false;
  user: User = new User();
  revealToken: boolean = false;
  matches: Match[] = [];
  seeks: Seek[] = [];
  announce: string = "Announcements will be shown here ...";
  appDisplayName: string =
    APP_CONF.APP_DISPLAY_NAME || DEFAULT_APP_DISPLAY_NAME;

  getPerfs() {
    if (this.user.lichessProfile) {
      const perfs = [];
      const perfsBlob = ((this.user.lichessProfile as any).perfs as any) || {};
      for (const key in perfsBlob) {
        perfs.push({ ...perfsBlob[key], ...{ cat: key } });
      }
      return perfs;
    } else {
      return [];
    }
  }
}

export const globalReactReactive = reactive(new GlobalReact());

export class RemoteStorage {
  tabData: { [key: string]: { selectedTabId?: string } } = {};
  createdSeeks: { [key: string]: Seek[] } = {};

  constructor() {}

  mount() {
    getRemote("", {}, true).then((blob: any) => {
      const value = blob.value;
      this.tabData = value.tabData || {};
      this.createdSeeks = {};
      if (value.createdSeeks) {
        for (const id in value.createdSeeks) {
          const seeksBlob = value.createdSeeks[id];
          this.createdSeeks[id] = seeksBlob.map((blob: any) => new Seek(blob));
        }
      }
    });
  }

  getTabData(id: string) {
    const tabData = this.tabData[id];
    if (!tabData) {
      this.tabData[id] = {};
    }
    return this.tabData[id];
  }

  storeTabData() {
    setRemote("tabData", this.tabData);
  }

  setSelectedTabId(id: string, selectedTabId: string) {
    this.getTabData(id).selectedTabId = selectedTabId;
    this.storeTabData();
  }

  getSelectedTabId(id: string): string {
    return this.getTabData(id).selectedTabId || "";
  }

  getCreatedSeeks(id: string): Seek[] {
    const createdSeeks = this.createdSeeks[id];
    return createdSeeks || [];
  }

  storeCreatedSeeks() {
    const ser: any = {};
    for (const id in this.createdSeeks) {
      ser[id] = this.createdSeeks[id].map((seek) => seek.serialize());
    }
    setRemote("createdSeeks", ser);
  }

  setCreatedSeeks(id: string, seeks: Seek[]) {
    this.createdSeeks[id] = seeks;
    this.storeCreatedSeeks();
  }

  deleteCreatedSeek(id: string, seekId: string) {
    const createdSeeks = this.createdSeeks[id];
    if (createdSeeks) {
      this.createdSeeks[id] = createdSeeks.filter((seek) => seek.id !== seekId);
      this.storeCreatedSeeks();
    }
  }

  unshiftCreatedSeek(id: string, seek: Seek) {
    const createdSeeks = this.createdSeeks[id] || [];
    createdSeeks.unshift(seek);
    while (createdSeeks.length > MAX_STORED_SEEKS) {
      createdSeeks.pop();
    }
    this.createdSeeks[id] = createdSeeks;
    this.storeCreatedSeeks();
  }
}

export const remoteStorageReactive = reactive(new RemoteStorage());

export const globalReact = globalReactReactive as GlobalReact;
export const remoteStorage = remoteStorageReactive as RemoteStorage;

////////////////////////////////////////////////////////////

export function setLocal(key: string, value: any) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getLocal(key: string, def: any) {
  const stored = localStorage.getItem(key);

  if (stored !== null && stored !== undefined) {
    try {
      const value = JSON.parse(stored);
      return value;
    } catch (err: any) {
      return def;
    }
  } else {
    return def;
  }
}

export function setRemote(key: string, value: JsonSerializable | undefined) {
  return new Promise((resolve) => {
    post("setremotestorage", { key, value }).then((result: any) => {
      resolve(result);
    });
  });
}

export function getRemote(
  key: string,
  def?: JsonSerializable,
  getAll?: boolean
) {
  return new Promise((resolve) => {
    post("getremotestorage", { key, def, getAll }).then((result: any) => {
      resolve(result);
    });
  });
}

////////////////////////////////////////////////////////////

export function link(href: string, captionOpt?: string, targetOpt?: string) {
  const caption = captionOpt || href;
  const target = targetOpt || "_blank";
  return h(
    "div",
    { class: "link" },
    h("a", { href, rel: "noopener noreferrer", target }, caption)
  );
}

export function Labeled(label: string, content: any) {
  return h("div", { class: "labeled" }, [
    h("div", { class: "cont" }, [
      h("div", { class: "label" }, label),
      h("div", { class: "content" }, content),
    ]),
  ]);
}

export function confirmButton(
  caption: string,
  action: string,
  phrase: string,
  callback: any
) {
  return h(
    "button",
    {
      onClick: () => {
        if (confirm(action, phrase)) callback();
      },
      class: "red",
    },
    caption
  );
}

export function centeredFlex(content: any) {
  return h(
    "div",
    {
      style: {
        padding: "1px !important",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
      },
    },
    content
  );
}

export type TextInputConfig = {
  submit?: boolean;
  copy?: boolean;
  forceValue?: string;
  width?: number;
};

export function textInput(configOpt?: TextInputConfig) {
  const config: TextInputConfig = configOpt || {
    submit: false,
    copy: false,
  };

  const inputRef = ref(0);

  function el() {
    return inputRef._rawValue;
  }

  return h(
    "div",
    { class: "textinput" },
    h("div", { class: "cont" }, [
      h("input", {
        type: "text",
        style: { width: config.width ? px(config.width) : "initial" },
        class: "text",
        ref: inputRef,
        value: config.forceValue || "",
      }),
      config.submit
        ? h("button", { class: ["submit", "green"] }, "Submit")
        : undefined,
      config.copy
        ? h(
            "button",
            {
              class: ["copy", "yellow"],
              onClick: () => {
                // https://www.w3schools.com/howto/howto_js_copy_clipboard.asp
                el().focus();
                el().select();
                el().setSelectionRange(0, 99999); // for mobile devices
                navigator.clipboard.writeText(el().value);
              },
            },
            "Copy"
          )
        : undefined,
    ])
  );
}

////////////////////////////////////////////////////////////

export function alertJson(json: any, errorOnly?: boolean) {
  if (errorOnly && !json.error) return;

  window.alert(JSON.stringify(json));
}

export function alertError(json: any) {
  alertJson(json, true);
}

export function px(px: number) {
  return `${px}px`;
}

export function confirm(action: string, phrase: string) {
  const confirm = window.prompt(
    `Are you sure you want to ${action} ? Type "${phrase}" to confirm.`
  );

  const confirmed = confirm === phrase;

  if (confirmed) return true;

  window.alert(`Canceled ${action} .`);

  return false;
}

export const DIGIT_SEGMENTS = [
  [1, 2, 3, 4, 5, 6],
  [2, 3],
  [1, 2, 7, 5, 4],
  [1, 2, 7, 3, 4],
  [6, 7, 2, 3],
  [1, 6, 7, 3, 4],
  [1, 6, 5, 4, 3, 7],
  [1, 2, 3],
  [1, 2, 3, 4, 5, 6, 7],
  [1, 2, 7, 3, 6],
];

export class DigitalClock {
  segments: any = {};

  hasHours: boolean = false;
  hasMinutes: boolean = false;

  react = reactive({
    digitColor: "#007",
    backgroundColor: "#acd",
    key: 0,
  });

  constructor() {
    this.setTimeFunc();
  }

  setSegments(name: string, value: number, hasNonZero: boolean) {
    const on = DIGIT_SEGMENTS[value];

    this.segments[name] = [];

    hasNonZero = hasNonZero || value !== 0;

    for (let i = 0; i < 7; i++) {
      this.segments[name][i] = hasNonZero ? on.includes(i + 1) : false;
    }

    return hasNonZero;
  }

  setSegmentsAll(name: string, value: number, hasNonZero: boolean) {
    const valueLow = value % 10;
    const valueHigh = (value - valueLow) / 10;

    hasNonZero = this.setSegments(name + "HighSegments", valueHigh, hasNonZero);
    hasNonZero = this.setSegments(name + "LowSegments", valueLow, hasNonZero);

    return hasNonZero;
  }

  setTimeFunc(secondsOpt?: number, minutesOpt?: number, hoursOpt?: number) {
    const seconds = secondsOpt === undefined ? 0 : secondsOpt;
    const minutes = minutesOpt === undefined ? 0 : minutesOpt;
    const hours = hoursOpt === undefined ? 0 : hoursOpt;

    this.hasHours = hours > 0;
    this.hasMinutes = minutes > 0;

    let hasNonZero = this.setSegmentsAll("hours", hours, false);
    hasNonZero = this.setSegmentsAll("minutes", minutes, hasNonZero);
    this.setSegmentsAll("seconds", seconds, hasNonZero);

    return hasNonZero;
  }

  setTime(secondsOpt?: number, minutesOpt?: number, hoursOpt?: number) {
    this.setTimeFunc(secondsOpt, minutesOpt, hoursOpt);

    this.react.key++;
  }

  makeSegments(name: string) {
    const segments = [];

    for (let i = 0; i < 7; i++) {
      segments.push(
        h("div", {
          style: { background: this.react.digitColor },
          class: { segment: true, on: this.segments[name][i] },
        })
      );
    }

    return segments;
  }

  renderFunction() {
    return h(
      "div",
      {
        key: this.react.key,
        class: "clockcomp",
        style: {
          borderColor: this.react.digitColor,
          backgroundColor: this.react.backgroundColor,
        },
      },
      h("div", { class: "clock" }, [
        h(
          "div",
          { class: ["digit", "hours"] },
          this.makeSegments("hoursHighSegments")
        ),
        h(
          "div",
          { class: ["digit", "hours"] },
          this.makeSegments("hoursLowSegments")
        ),
        h("div", {
          class: ["separator"],
          style: {
            background: this.hasHours ? this.react.digitColor : "transparent",
          },
        }),
        h(
          "div",
          { class: ["digit", "minutes"] },
          this.makeSegments("minutesHighSegments")
        ),
        h(
          "div",
          { class: ["digit", "minutes"] },
          this.makeSegments("minutesLowSegments")
        ),
        h("div", {
          class: ["separator"],
          style: {
            background: this.hasMinutes ? this.react.digitColor : "transparent",
          },
        }),
        h(
          "div",
          { class: ["digit", "seconds"] },
          this.makeSegments("secondsHighSegments")
        ),
        h(
          "div",
          { class: ["digit", "seconds"] },
          this.makeSegments("secondsLowSegments")
        ),
      ])
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
