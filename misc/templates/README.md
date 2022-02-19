## [Try Online hosted at Heroku](__HEROKU_APP_URL__)

## Env configuration

### `ADMIN_PASS`

Administrator password. Optional, defaults to `admin`. To login as administrator, use Ctrl + Login.

### `MONGODB_URI`

MongoDb connect URI. Required in production, optional in development ( GitPod workspace installs and runs MongoDb ), defaults to `mongodb://localhost:27017`.

## [Open in GitPod](https://gitpod.io#__GIT_REPO_URL__)

If you don't run a prebuild, tasks will fail to run for the first time, because yarn install will be yet in progress. Wait for the installation to finish, then in Build Server: bash, Build Client: bash, Build Style: bash and Dev Server: bash terminals press the up key to bring back the startup command and press ENTER.

To run a prebuild, create a project from the repo in GitPod dashboard and run a prebuild. If a prebuild is in place, the workspace will open without error for the first time and should open the app in a new tab. See also https://www.gitpod.io/blog/teams-and-projects#projects .

When auto opening the app in a new tab, your browser may complain about unwanted popup window, so allow popups for the app.