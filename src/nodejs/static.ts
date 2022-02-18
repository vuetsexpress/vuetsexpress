import { Router, readFile } from "./utils";
import { APP_DISPOSITION, IS_DEV, APP_DISPLAY_NAME } from "./config";
import { MINUTE, SECOND } from "../shared/time";

/////////////////////////////////////////////////////////////////////

export class Static {
  router = new Router();

  constructor() {}

  mount(router: Router) {
    this.router = router;

    this.router.get("/", (req: any, res: any) => {
      //this.router.sendView(res, "index.html");
      const index = readFile(this.router.viewPath("index.html"), "Index");
      const CLIENT_APP_CONF = {
        APP_DISPOSITION,
        HOT_RELOAD_INTERVAL: IS_DEV ? 1 * SECOND : 2 * MINUTE,
        APP_DISPLAY_NAME,
      };
      const patched = index.replace(
        "//APP_CONF",
        `const APP_CONF = ${JSON.stringify(CLIENT_APP_CONF, null, 2)};`
      );
      res.send(patched);
    });

    this.router.get("/man", (req: any, res: any) => {
      this.router.sendView(res, "man.html");
    });

    this.router.get("/allusers", (req: any, res: any) => {
      this.router.sendView(res, "allusers.html");
    });

    this.router.get("/utils.js", (req: any, res: any) => {
      this.router.sendView(res, "utils.js");
    });

    this.router.get("/favicon.ico", (req: any, res: any) => {
      this.router.sendView(res, "favicon.ico");
    });

    this.router.get("/favicon.png", (req: any, res: any) => {
      this.router.sendView(res, "favicon.png");
    });

    this.router.get("/client.js", (req: any, res: any) => {
      this.router.sendDist(res, "client.js");
    });

    if (IS_DEV) {
      this.router.get("/client.js.map", (req: any, res: any) => {
        this.router.sendDist(res, "client.js.map");
      });
    }

    this.router.get("/style.css", (req: any, res: any) => {
      this.router.sendDist(res, "style.css");
    });

    this.router.get("/style.css.map", (req: any, res: any) => {
      this.router.sendDist(res, "style.css.map");
    });

    this.router.get("/vue.js", (req: any, res: any) => {
      this.router.sendModule(res, "vue/dist/vue.global.prod.js");
    });

    this.router.get("/maple.css", (req: any, res: any) => {
      this.router.sendModule(res, "@publishvue/chessground/assets/maple.css");
    });
  }
}
