// https://github.com/lichess-org/api/blob/master/example/oauth-app/src/ctrl.ts
import { AccessContext, OAuth2AuthCodePKCE } from "@bity/oauth2-auth-code-pkce";

////////////////////////////////////////////////////////////////

export const lichessHost = "https://lichess.org";
export const clientId = "vuetsexpress";

////////////////////////////////////////////////////////////////

export function clientUrl() {
  const url = new URL(location.href);
  url.search = "";
  return url.href;
}

export class Oauth {
  oauth = new OAuth2AuthCodePKCE({
    authorizationUrl: `${lichessHost}/oauth`,
    tokenUrl: `${lichessHost}/api/token`,
    clientId,
    scopes: [],
    redirectUrl: clientUrl(),
    onAccessTokenExpiry: (refreshAccessToken) => refreshAccessToken(),
    onInvalidGrant: (_retry) => {},
  });

  error?: any;
  accessContext?: AccessContext;

  constructor() {}

  reload() {
    document.location.href = clientUrl();
  }

  async login() {
    // Redirect to authentication prompt.
    await this.oauth.fetchAuthorizationCode();
  }

  get token() {
    return localStorage.getItem("USER_TOKEN");
  }

  async init() {
    return new Promise(async (resolve) => {
      try {
        const hasAuthCode = await this.oauth.isReturningFromAuthServer();
        if (hasAuthCode) {
          this.accessContext = await this.oauth.getAccessToken();
          localStorage.setItem(
            "USER_TOKEN",
            this.accessContext.token?.value || ""
          );
          this.reload();
        } else {
          resolve({ ok: true });
        }
      } catch (err) {
        this.error = err;
        resolve({ error: err });
      }
    });
  }

  account() {
    return new Promise(async (resolve) => {
      const resp = await fetch(`${lichessHost}/api/account`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      const account = await resp.json();

      resolve(account);
    });
  }

  async logout() {
    this.accessContext = undefined;
    this.error = undefined;

    await fetch(`${lichessHost}/api/token`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    localStorage.removeItem("USER_TOKEN");

    this.reload();
  }
}
