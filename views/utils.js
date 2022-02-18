const API_BASE_URL = "/api";

function api(endpoint, method, payloadOpt) {
  const payload = payloadOpt || {};
  const url = `${API_BASE_URL}/${endpoint}`;
  payload.ADMIN_PASS = localStorage.getItem("ADMIN_PASS");
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (endpoint !== "init")
    console.log("api", { endpoint, method, payload, url, headers });
  return new Promise((resolve) => {
    fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(payload),
    })
      .then((response) => {
        response
          .json()
          .then((json) => {
            if (endpoint !== "init") console.log(endpoint, "got", json);
            resolve(json);
          })
          .catch((error) => {
            resolve({ error });
          });
      })
      .catch((error) => {
        resolve({ error });
      });
  });
}

function get(endpoint, payload) {
  return api(endpoint, "GET", payload);
}

function post(endpoint, payload) {
  return api(endpoint, "POST", payload);
}

function confirm(action, phrase) {
  const confirm = window.prompt(
    `Are you sure you want to ${action} ? Type "${phrase}" to confirm.`
  );

  const confirmed = confirm === phrase;

  if (confirmed) return true;

  window.alert(`Canceled ${action} .`);

  return false;
}

function alertError(result) {
  if (result.error) window.alert(result.error);
}
