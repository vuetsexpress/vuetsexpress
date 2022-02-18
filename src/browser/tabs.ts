import { h, reactive, defineComponent } from "vue/dist/vue.esm-browser.prod";
import { setRemote, getRemote, globalReact, remoteStorage } from "./misc";

//////////////////////////////////////////////////////////////////////

export type TabDescriptor = {
  caption: string;
  id: string;
  icon?: string;
  iconbutton?: string;
  adminOnly?: boolean;
};

export class Tabs {
  tabs: TabDescriptor[] = [];
  id: string;

  constructor(id: string, tabs: TabDescriptor[]) {
    this.id = id;
    this.tabs = tabs;
  }
  get selectedTabStorageId() {
    return "selectedtabid/" + this.id;
  }

  filteredTabs() {
    return this.tabs.filter((tab) => !tab.adminOnly || globalReact.isAdmin);
  }

  effSelectedTabId(): string {
    return this.filteredTabs().find(
      (tab) => tab.id === remoteStorage.getSelectedTabId(this.id)
    )
      ? remoteStorage.getSelectedTabId(this.id)
      : this.tabs.length
      ? this.tabs[0].id
      : "";
  }

  renderFunction() {
    return h("div", { class: "tabs" }, [
      h("div", { class: "cont" }, [
        this.filteredTabs().map((tab, i) =>
          tab.icon
            ? h(
                "div",
                {
                  class: {
                    tab: true,
                    selected: this.effSelectedTabId() === tab.id,
                  },
                  style: {
                    border: "none !important",
                  },
                  onClick: (ev: any) => {
                    remoteStorage.setSelectedTabId(this.id, tab.id);
                  },
                },
                h("div", {
                  class: ["icon", tab.icon, tab.iconbutton || "iconbutton"],
                })
              )
            : h(
                "div",
                {
                  class: {
                    tab: true,
                    selected: this.effSelectedTabId() === tab.id,
                  },
                  onClick: (ev: any) => {
                    remoteStorage.setSelectedTabId(this.id, tab.id);
                  },
                },
                tab.caption
              )
        ),
      ]),
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
