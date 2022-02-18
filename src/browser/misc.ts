import { h, reactive, ref } from "vue/dist/vue.esm-browser.prod";
import { post } from "./api";
import { JsonSerializable, User, Match, Seek } from "../shared/models";
import { MAX_STORED_SEEKS, DEFAULT_APP_DISPLAY_NAME } from "../shared/config";

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
