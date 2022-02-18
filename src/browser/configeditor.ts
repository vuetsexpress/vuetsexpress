import { defineComponent, h, reactive } from "vue/dist/vue.esm-browser.prod";

//////////////////////////////////////////////////////////////

export class ConfigNode {
  key: string = "";
  value: string = "";
  leaf: boolean = false;
  parent: ConfigNode | undefined = undefined;
  childs: ConfigNode[] = [];
  react = reactive({ key: 0 });
  context: any = undefined;
  expanded: boolean = false;

  constructor(key: string, init?: any, parent?: ConfigNode) {
    const self = this;
    self.key = key;
    self.parent = parent;
    self.deserialize(self, init);
  }

  deserialize(self: any, init?: any) {
    self.childs = [];
    self.leaf = false;
    self.value = "";
    if (typeof init === "object") {
      for (const key in init) {
        self.childs.push(new ConfigNode(key, init[key], self));
      }
    }
    if (typeof init === "string") {
      self.value = init;
      self.leaf = true;
    }
    self.react.key++;
  }

  setFromBlob(blob?: any) {
    const self = this;
    self.deserialize(self, blob);
  }

  addNode(self: any) {
    const key = window.prompt("Key");
    if (key) {
      const existingChild = self.getChildByKey(self, key);
      if (existingChild) {
        window.alert("Key Already Exists");
      } else {
        self.childs.push(new ConfigNode(key, {}, self));
        self.react.key++;
      }
    }
  }

  delNodeByKey(self: any, key: string) {
    self.childs = self.childs.filter((child: any) => child.key !== key);
    self.react.key++;
  }

  delNode(self: any) {
    if (self.parent) {
      self.parent.delNodeByKey(self.parent, self.key);
    } else {
      window.alert("Not Allowed");
    }
  }

  addLeaf(self: any) {
    const key = window.prompt("Key");
    if (key) {
      const existingChild = self.getChildByKey(self, key);

      if (existingChild) {
        window.alert("Key Already Exists");
      } else {
        const value = window.prompt("Value");
        self.childs.push(new ConfigNode(key, value || "", self));
        self.react.key++;
      }
    }
  }

  serialize(self: any) {
    const blob = self.leaf ? self.value : {};
    self.childs.forEach((child: any) => {
      blob[child.key] = child.serialize(child);
    });
    return blob;
  }

  editValue(self: any) {
    const value = window.prompt("Value", self.value);

    if (typeof value !== "string") return;

    self.value = value || "";

    self.react.key++;
  }

  getChildByKey(self: any, key: string) {
    return self.childs.find((child: any) => child.key === key);
  }

  getChildIndexByKey(self: any, key: string) {
    return self.childs.findIndex((child: any) => child.key === key);
  }

  deleteChildByKey(self: any, key: string) {
    self.childs = self.childs.filter((child: any) => child.key !== key);
  }

  editChildKey(self: any, key: string) {
    const newKey = window.prompt("Key", key);

    if (typeof newKey === "string") {
      if (!newKey.length) {
        window.alert("Empty Key");
        return;
      }

      const existingChild = self.getChildByKey(self, newKey);

      if (existingChild) {
        window.alert("Key Already Exists");
      } else {
        const index = self.getChildIndexByKey(self, key);
        self.childs[index].key = newKey;
        self.react.key++;
      }
    }
  }

  editKey(self: any) {
    if (self.parent) {
      self.parent.editChildKey(self.parent, self.key);
    } else {
      window.alert("Not Allowed");
    }
  }

  setExpanded(self: any, expanded: boolean) {
    self.expanded = expanded;
    self.react.key++;
  }

  expandWidget(self: any) {
    if (!this.childs.length) {
      return undefined;
    }

    return self.expanded
      ? h(
          "button",
          {
            class: "collapse",
            onClick: () => {
              self.setExpanded(self, false);
            },
          },
          "-"
        )
      : h(
          "button",
          {
            class: "expand",
            onClick: () => {
              self.setExpanded(self, true);
            },
          },
          "+"
        );
  }

  renderFunction() {
    const self = this;
    return self.leaf
      ? h(
          "div",
          { key: self.react.key, class: "confignode" },
          h("div", { class: "leaf" }, [
            h("div", { class: "key" }, self.key),
            h(
              "button",
              {
                class: "editvalue",
                onClick: () => {
                  self.editValue(self);
                },
              },
              "Edit Value"
            ),
            h(
              "button",
              {
                class: "editkey",
                onClick: () => {
                  self.editKey(self);
                },
              },
              "Edit Key"
            ),
            h(
              "button",
              {
                class: "deletevalue",
                onClick: () => {
                  self.delNode(self);
                },
              },
              "Delete Value"
            ),
            h("div", { class: "value" }, self.value),
          ])
        )
      : h("div", { key: self.react.key, class: "confignode" }, [
          h("div", { class: "controls" }, [
            self.expandWidget(self),
            h("div", { class: "key" }, self.key),
            h(
              "button",
              {
                class: "addleaf",
                onClick: () => {
                  self.addLeaf(self);
                },
              },
              "Add Leaf"
            ),
            h(
              "button",
              {
                class: "addnode",
                onClick: () => {
                  self.addNode(self);
                },
              },
              "Add Node"
            ),
            h(
              "button",
              {
                class: "editkey",
                onClick: () => {
                  self.editKey(self);
                },
              },
              "Edit Key"
            ),
            h(
              "button",
              {
                class: "delnode",
                onClick: () => {
                  self.delNode(self);
                },
              },
              "Delete Node"
            ),
            self.parent
              ? undefined
              : h(
                  "button",
                  {
                    onClick: () => {
                      self.context.emit("upload", self.serialize(self));
                    },
                    class: "upload",
                  },
                  "Upload"
                ),
          ]),
          h(
            "div",
            { class: "childs" },
            self
              .sortedChilds(self)
              .map((child: any) => h(child.defineComponent(), {}))
          ),
        ]);
  }

  sortedChilds(self: any) {
    if (!self.expanded) {
      return [];
    }
    return self.childs.slice().sort((a: any, b: any) => {
      if (a.leaf !== b.leaf) {
        return a.leaf ? 1 : -1;
      }
      return a.key.localeCompare(b.key);
    });
  }

  defineComponent() {
    const self = this;
    return defineComponent({
      setup(props: any, context: any) {
        self.context = context;
        return self.renderFunction.bind(self);
      },
    });
  }
}
