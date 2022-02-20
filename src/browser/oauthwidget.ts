import { Oauth } from "./oauth";
import { post } from "./api";
import {
  defineComponent,
  h,
  onMounted,
  onBeforeUnmount,
  reactive,
  ref,
  nextTick,
} from "vue/dist/vue.esm-browser.prod";
import { Logger } from "../shared/utils";
import { alertError, globalReact } from "./misc";
import { User } from "../shared/models";
import { showUser } from "./createseek";

///////////////////////////////////////////////////////////////////////////

export function setAdminPass() {
  const pass = window.prompt("Admin Pass");

  if (pass) {
    localStorage.setItem("ADMIN_PASS", pass);
  }

  document.location.reload();
}

///////////////////////////////////////////////////////////////////////////

export default defineComponent({
  props: {
    logger: {
      type: Object,
      default: () => new Logger({ owner: "oauthwidget" }),
    },
    watch: {},
    onLogin: {},
  },
  setup(props: any) {
    const oauth = new Oauth();
    const react = reactive({
      key: 0,
      admin: false,
      scale: 1,
    });
    const contRef = ref(0);

    function checkAdmin() {
      post("checkadmin").then((result: any) => {
        react.key++;
        if (result.error) {
          react.admin = false;
          globalReact.isAdmin = false;
        } else {
          react.admin = true;
          globalReact.isAdmin = true;
        }
        //props.logger.log({ admin: !!react.admin }, "oauthwidgetcheckadmin");
      });
    }

    let firstLogin = true;

    function login() {
      post("login", { token: localStorage.getItem("USER_TOKEN") }).then(
        (result: any) => {
          alertError(result);

          if (result.error) return;

          const user = new User(result);
          if (user) {
            globalReact.user = user;
            localStorage.setItem("USER_TOKEN", user.token);

            if (firstLogin) {
              //props.logger.log({ login: user.serialize() }, "oauthwidgetlogin");
              if (props.onLogin) {
                props.onLogin();
              }
            }

            firstLogin = false;
          }

          setTimeout(login, user.LOGIN_INTERVAL);
        }
      );
    }

    let co: any, wo: any;

    onMounted(async () => {
      await oauth.init();

      login();

      checkAdmin();

      function scale() {
        const cw = props.watch._rawValue.clientWidth;
        const ww = contRef._rawValue.clientWidth;

        if (cw < ww) {
          react.scale = cw / ww;
        } else {
          react.scale = 1;
        }
      }

      nextTick(() => {
        // https://stackoverflow.com/questions/43813731/how-to-trigger-an-event-when-element-is-resized-in-vue-js
        co = new ResizeObserver(scale).observe(props.watch._rawValue);
        wo = new ResizeObserver(scale).observe(contRef._rawValue);
      });
    });

    onBeforeUnmount(() => {
      // https://stackoverflow.com/questions/43813731/how-to-trigger-an-event-when-element-is-resized-in-vue-js
      if (co) co.unobserve(props.watch._rawValue);
      if (wo) wo.unobserve(contRef._rawValue);
    });

    return () => {
      return h(
        "div",
        {
          class: "oauthwidget",
          style: { transform: `scale(${react.scale})` },
          key: react.key,
          ref: contRef,
          id: "contref",
        },
        [
          h("div", { class: "cont" }, [
            h(
              "button",
              {
                class: "login",
                onClick: (ev: any) => {
                  if (ev.ctrlKey) {
                    setAdminPass();
                  } else {
                    oauth.login();
                  }
                },
              },
              "Login"
            ),
            h(
              "button",
              {
                class: "logout",
                onClick: () => {
                  localStorage.clear();
                  oauth.logout();
                  localStorage.clear();
                },
              },
              "Logout"
            ),
            showUser(globalReact.user),
            react.admin ? h("div", { class: "admin" }, "A") : undefined,
          ]),
        ]
      );
    };
  },
});
