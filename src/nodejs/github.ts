import { Octokit } from "octokit";

import { Crypto, CRYPTENV } from "./crypto";

import { syslog } from "./utils";

import { DEFAULT_REPO_OWNER } from "../shared/config";
import { GIT_REPO_NAME } from "./config";
import { Gitlab } from "@gitbeaker/node";

////////////////////////////////////////////////////////////////////////

const crypto = new Crypto();

const MAX_COMMITS_PER_PAGE = 100;

////////////////////////////////////////////////////////////////////////

export function createGitlabRepo(ownerOpt?: string, nameOpt?: string) {
  const owner = ownerOpt || DEFAULT_REPO_OWNER;
  const name = nameOpt || GIT_REPO_NAME;

  const gl = new Gitlab({
    token: CRYPTENV[`${owner.toUpperCase()}_GITLAB_TOKEN_FULL`],
  });

  return new Promise((resolve) => {
    gl.Projects.create({ name })
      .then((result: any) => {
        resolve(result);
      })
      .catch((error: any) => resolve({ error }));
  });
}

function getAllGitHubFullTokens() {
  const envTokenKeys = Object.keys(CRYPTENV).filter((key) =>
    key.match(/_GITHUB_TOKEN_FULL$/)
  );
  const envTokens = envTokenKeys.map((key) => ({
    key,
    envTokenName: key.split("_")[0],
    token: CRYPTENV[key],
  }));
  return envTokens;
}

export class GitHubRepo {
  name: string = "";
  id: number = 0;
  fullName: string = "";
  private: boolean = false;
  repoUrl: string = "";
  stars: number = 0;
  forks: number = 0;
  createdAt: string = "";
  updatedAt: string = "";
  pushedAt: string = "";
  blob: any = {};

  constructor(blob: any) {
    this.name = blob.name;
    this.id = blob.id;
    this.fullName = blob.fullName;
    this.private = blob.private;
    this.repoUrl = blob.html_url;
    this.stars = blob.stargazers_count;
    this.forks = blob.forks;
    this.createdAt = blob.created_at;
    this.updatedAt = blob.updated_at;
    this.pushedAt = blob.pushed_at;
    this.blob = blob;
  }

  serialize() {
    return {
      name: this.name,
      id: this.id,
      fullName: this.fullName,
      private: this.private,
      repoUrl: this.repoUrl,
      stars: this.stars,
      forks: this.forks,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      pushedAt: this.pushedAt,
      //blob: this.blob,
    };
  }
}

type CreateRepoParams = {
  name: string;
  description?: string;
  init?: boolean;
  license?: string;
};

export class GitHubAccount {
  envTokenName: string = "";
  envTokenFullName: string = "";
  token: string = "";
  gitUserName: string = "";
  id: string = "";
  avatarUrl: string = "";
  gitUrl: string = "";
  octokit: any = undefined;
  repos: GitHubRepo[] = [];

  constructor(envTokenName: string) {
    this.envTokenName = envTokenName;
    this.envTokenFullName = this.envTokenName + "_GITHUB_TOKEN_FULL";
    this.token = CRYPTENV[this.envTokenFullName] || "";
  }

  getCommits(repo: string, pageOpt?: number, perPageOpt?: number) {
    const page = pageOpt || 1;
    return new Promise((resolve) => {
      // https://octokit.github.io/rest.js/v18#repos-list-commits
      this.octokit.rest.repos
        .listCommits({
          owner: this.gitUserName,
          repo,
          per_page: perPageOpt || MAX_COMMITS_PER_PAGE,
          page,
        })
        .then((result: any) => {
          resolve(result);
        });
    });
  }

  get gitUserEmail() {
    return `${this.gitUserName}@gmail.com`;
  }

  createOrupdateGitContent(
    repo: string,
    path: string,
    contentBuffer: any,
    sha?: string,
    messageOpt?: string
  ) {
    const content = contentBuffer.toString("base64");
    const message = messageOpt || `Update ${path}`;
    return new Promise((resolve) => {
      try {
        this.octokit.rest.repos
          .createOrUpdateFileContents({
            owner: this.gitUserName,
            repo,
            path,
            message,
            content,
            sha,
            "committer.name": this.gitUserName,
            "committer.email": this.gitUserEmail,
            "author.name": this.gitUserName,
            "author.email": this.gitUserEmail,
          })
          .then((result: any) => {
            resolve(result);
          })
          .catch((error: any) => {
            resolve({ error });
          });
      } catch (error: any) {
        resolve({ error });
      }
    });
  }

  getGitContent(repo: string, path: string) {
    return new Promise((resolve) => {
      try {
        this.octokit.rest.repos
          .getContent({
            owner: this.gitUserName,
            repo,
            path,
          })
          .then((content: any) => {
            resolve({
              content: Buffer.from(content.data.content, "base64"),
              sha: content.data.sha,
            });
          })
          .catch((error: any) => {
            resolve({ error });
          });
      } catch (error: any) {
        resolve({ error });
      }
    });
  }

  upsertGitContent(
    repo: string,
    path: string,
    contentBuffer: any,
    messageOpt?: string
  ) {
    return new Promise((resolve) => {
      this.getGitContent(repo, path).then((content: any) => {
        if (content.error) {
          this.createOrupdateGitContent(
            repo,
            path,
            contentBuffer,
            undefined,
            messageOpt
          ).then((result) => resolve(result));
        } else {
          this.createOrupdateGitContent(
            repo,
            path,
            contentBuffer,
            content.sha,
            messageOpt
          ).then((result) => resolve(result));
        }
      });
    });
  }

  getGitContentDec(repo: string, path: string) {
    return new Promise((resolve) => {
      this.getGitContent(repo, path).then((result: any) => {
        if (result.error) {
          resolve(result);
        } else {
          result.content = crypto.decrypt(result.content.toString());
          resolve(result);
        }
      });
    });
  }

  getGitContentJsonDec(repo: string, path: string, def: any) {
    return new Promise((resolve) => {
      this.getGitContentDec(repo, path).then((result: any) => {
        if (result.error) {
          if (def) {
            resolve(def);
          } else {
            resolve(result);
          }
        } else {
          result.content = JSON.parse(result.content.toString());
          resolve(result);
        }
      });
    });
  }

  upsertGitContentEnc(repo: string, path: string, contentBuffer: any) {
    return this.upsertGitContent(
      repo,
      path,
      Buffer.from(crypto.encrypt(contentBuffer))
    );
  }

  upsertGitContentJsonEnc(repo: string, path: string, blob: any) {
    return this.upsertGitContentEnc(
      repo,
      path,
      Buffer.from(JSON.stringify(blob))
    );
  }

  createRepo(params: CreateRepoParams) {
    const name = params.name;
    const description = params.description || params.name;
    const auto_init = !!params.init;
    const license_template = params.init ? params.license || "MIT" : undefined;

    return new Promise((resolve) => {
      // https://octokit.github.io/rest.js/v18#repos-create-for-authenticated-user
      this.octokit.rest.repos
        .createForAuthenticatedUser({
          name,
          description,
          auto_init,
          license_template,
        })
        .then((result: any) => {
          resolve(result);
        })
        .catch((err: any) => {
          resolve({ error: err });
        });
    });
  }

  deleteRepo(name: string) {
    return new Promise((resolve) => {
      // https://octokit.github.io/rest.js/v18#repos-delete
      this.octokit.rest.repos
        .delete({
          owner: this.gitUserName,
          repo: name,
        })
        .then((result: any) => {
          resolve(result);
        })
        .catch((err: any) => {
          resolve({ error: err });
        });
    });
  }

  forkRepo(gitUserName: string, name: string) {
    return new Promise((resolve) => {
      // https://octokit.github.io/rest.js/v18#repos-create-fork
      this.octokit.rest.repos
        .createFork({
          owner: gitUserName,
          repo: name,
        })
        .then((result: any) => {
          resolve(result);
        })
        .catch((err: any) => {
          resolve({ error: err });
        });
    });
  }

  getRepos() {
    return new Promise((resolve) => {
      // https://octokit.github.io/rest.js/v18#repos-list-for-authenticated-user
      this.octokit.rest.repos
        .listForAuthenticatedUser({ per_page: 100 })
        .then((result: any) => {
          if (result.data) {
            this.repos = result.data.map((repo: any) => new GitHubRepo(repo));

            this.repos.sort((a, b) => a.name.localeCompare(b.name));

            resolve(this.repos.map((repo) => repo.serialize()));
          } else {
            syslog("ERROR", "could not get repos for", this.gitUserName);

            resolve([]);
          }
        })
        .catch((err: any) => {
          resolve([]);
        });
    });
  }

  init() {
    return new Promise((resolve) => {
      this.octokit = new Octokit({ auth: this.token });

      this.octokit.rest.users
        .getAuthenticated()
        .then((result: any) => {
          if (result.status === 200) {
            const acc = result.data;
            this.gitUserName = acc.login;
            this.id = acc.id;
            this.avatarUrl = acc.avatar_url;
            this.gitUrl = acc.html_url;
            this.getRepos().then((result) => {
              resolve(this.serialize());
            });
          } else {
            resolve({ error: result.status });
          }
        })
        .catch((err: any) => {
          resolve({ error: err });
        });
    });
  }

  serialize() {
    return {
      envTokenName: this.envTokenName,
      gitUserName: this.gitUserName,
      id: this.id,
      avatarUrl: this.avatarUrl,
      gitUrl: this.gitUrl,
      repos: this.repos.map((repo) => repo.serialize()),
    };
  }
}

export class GitHubAccountManager {
  accounts: GitHubAccount[] = [];
  constructor() {}
  getAccountByGitUserName(gitUserName: string) {
    return this.accounts.find((acc) => acc.gitUserName === gitUserName);
  }
  serialize() {
    return {
      accounts: this.accounts.map((acc) => acc.serialize()),
    };
  }
  createRepo(ownerOpt?: string, nameOpt?: string) {
    const owner = ownerOpt || DEFAULT_REPO_OWNER;
    const name = nameOpt || GIT_REPO_NAME;

    const acc = this.getAccountByGitUserName(owner);

    return new Promise((resolve) => {
      if (acc) {
        acc.createRepo({ name });
      } else {
        resolve({ error: "no such account" });
      }
    });
  }
  init() {
    //syslog("initializing git manager");
    return new Promise(async (resolve) => {
      this.accounts = getAllGitHubFullTokens().map(
        (token) => new GitHubAccount(token.envTokenName)
      );

      const initResult = await Promise.all(
        this.accounts.map((acc) => acc.init())
      );

      this.accounts.sort((a, b) => a.gitUserName.localeCompare(b.gitUserName));

      syslog("initialized", initResult.length, "github account(s)");

      resolve(initResult);
    });
  }
}
