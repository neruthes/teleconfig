
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

const FORBIDDEN_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor"
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return value;
}

function validateConfig(config) {
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config)
  ) {
    throw new TypeError("Config must be a plain object");
  }

  return config;
}

function serializeValue(value) {
  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    throw new TypeError("Value must be JSON serializable");
  }

  return JSON.parse(serialized);
}

function parseListenAddress(address) {
  if (typeof address === "number") {
    return { port: address };
  }

  if (typeof address !== "string") {
    throw new TypeError("Invalid listen address");
  }

  // IPv6: [::1]:9080
  const ipv6 = address.match(/^\[([^\]]+)\]:(\d+)$/);

  if (ipv6) {
    return {
      host: ipv6[1],
      port: Number(ipv6[2])
    };
  }

  // IPv4 / hostname: 0.0.0.0:9080
  const normal = address.match(/^([^:]+):(\d+)$/);

  if (normal) {
    return {
      host: normal[1],
      port: Number(normal[2])
    };
  }

  throw new TypeError(
    'Use a numeric port, "host:port", or "[ipv6]:port"'
  );
}

const SPA = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Teleconfig</title>
<style>
* { box-sizing:border-box }
body {
  margin:0;
  padding:32px 16px;
  background:#f5f6f8;
  color:#222;
  font:14px/1.6 system-ui,sans-serif;
}
main {
  max-width:760px;
  margin:auto;
  background:white;
  padding:28px;
  border:1px solid #e5e7eb;
  border-radius:10px;
}
h1 { margin:0 0 6px;font-size:23px }
.sub { color:#777;margin-bottom:24px }
.field { padding:16px 0;border-top:1px solid #eee }
.field label {
  display:block;
  font-weight:600;
  margin-bottom:7px;
  overflow-wrap:anywhere;
}
.field small { color:#888;display:block;margin-top:5px }
input,textarea {
  width:100%;
  padding:10px;
  border:1px solid #d5d8de;
  border-radius:6px;
  font:13px ui-monospace,monospace;
}
textarea { min-height:100px;resize:vertical }
button {
  border:0;
  background:#222;
  color:white;
  padding:10px 18px;
  border-radius:6px;
  cursor:pointer;
}
button:disabled { opacity:.5;cursor:wait }
.toolbar {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-top:20px;
}
#status { color:#777 }
#auth { margin-bottom:22px }
</style>
</head>
<body>
<main>
<h1>Teleconfig</h1>
<div class="sub">Runtime configuration manager</div>

<div id="auth">
  <label for="token">Access token</label>
  <input id="token" type="password" autocomplete="off"
    placeholder="Enter backdoor token">
</div>

<div id="fields"></div>

<div class="toolbar">
  <span id="status">Not connected</span>
  <div>
    <button id="reload">Reload</button>
    <button id="save">Save</button>
  </div>
</div>
</main>

<script>
const $ = id => document.getElementById(id);

let original = {};

function request(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: "Bearer " + $("token").value,
      "Content-Type": "application/json",
      ...options.headers
    }
  });
}

function createField(key, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "field";

  const label = document.createElement("label");
  label.textContent = key;
  wrapper.appendChild(label);

  const type = typeof value;
  const simple = type === "string" || type === "number";

  const input = simple
    ? document.createElement("input")
    : document.createElement("textarea");

  if (type === "number") {
    input.type = "number";
    input.step = "any";
  } else if (type === "string") {
    input.type = "text";
  }

  input.dataset.key = key;
  input.dataset.type = simple ? type : "json";

  input.value = simple
    ? String(value)
    : JSON.stringify(value, null, 2);

  wrapper.appendChild(input);

  if (!simple) {
    const hint = document.createElement("small");
    hint.textContent = "JSON serialized value";
    wrapper.appendChild(hint);
  }

  return wrapper;
}

async function load() {
  $("status").textContent = "Loading...";
  $("fields").replaceChildren();

  try {
    const response = await request("/api/get_config");

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const result = await response.json();
    original = result.config;

    for (const [key, value] of Object.entries(original)) {
      $("fields").appendChild(createField(key, value));
    }

    $("status").textContent = "Connected (v" + result.version + ")";
  } catch (err) {
    $("status").textContent = "Error: " + err.message;
  }
}

async function save() {
  const changes = {};

  try {
    for (const input of $("fields").querySelectorAll("[data-key]")) {
      const key = input.dataset.key;
      const type = input.dataset.type;
      const raw = input.value;

      let value;

      if (type === "number") {
        value = Number(raw);

        if (!raw.trim() || !Number.isFinite(value)) {
          throw new Error("Invalid number: " + key);
        }
      } else if (type === "json") {
        value = JSON.parse(raw);
      } else {
        value = raw;
      }

      if (JSON.stringify(value) !== JSON.stringify(original[key])) {
        changes[key] = value;
      }
    }

    if (!Object.keys(changes).length) {
      $("status").textContent = "No changes";
      return;
    }

    $("save").disabled = true;
    $("status").textContent = "Saving...";

    const response = await request("/api/set_config", {
      method: "POST",
      body: JSON.stringify(changes)
    });

    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || "HTTP " + response.status);
    }

    await load();
    $("status").textContent = "Saved successfully";
  } catch (err) {
    $("status").textContent = "Error: " + err.message;
  } finally {
    $("save").disabled = false;
  }
}

$("reload").onclick = load;
$("save").onclick = save;
</script>
</body>
</html>`;

export class Teleconfig extends EventEmitter {
  #token;
  #cachePath;
  #defaults;
  #config;
  #version = 0;
  #server = null;
  #syncQueue = Promise.resolve();

  constructor({
    backdoor_token,
    cache_path,
    default_config = {}
  } = {}) {
    super();

    if (
      typeof backdoor_token !== "string" ||
      !backdoor_token
    ) {
      throw new Error("backdoor_token is required");
    }

    validateConfig(default_config);

    this.#token = backdoor_token;
    this.#cachePath = cache_path
      ? path.resolve(cache_path)
      : null;

    this.#defaults = clone(default_config);
    this.#config = clone(this.#defaults);

    this.#loadCacheSync();
  }

  static createDaemon(options = {}) {
    return new Teleconfig(options);
  }

  #loadCacheSync() {
    if (!this.#cachePath) return;

    try {
      const cached = JSON.parse(
        fs.readFileSync(this.#cachePath, "utf8")
      );

      validateConfig(cached);

      this.#config = {
        ...this.#config,
        ...clone(cached)
      };
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.error(
          "[Teleconfig] Cache load failed:",
          err.message
        );
      }
    }
  }

  #snapshot() {
    return deepFreeze(clone(this.#config));
  }

  getDict() {
    return this.#snapshot();
  }

  get(key) {
    return this.#config[key];
  }

  getVersion() {
    return this.#version;
  }

  #commit(next) {
    const previous = this.#config;
    this.#config = next;

    const changed = [];

    for (const key of new Set([
      ...Object.keys(previous),
      ...Object.keys(next)
    ])) {
      if (
        JSON.stringify(previous[key]) !==
        JSON.stringify(next[key])
      ) {
        changed.push(key);
      }
    }

    if (changed.length) {
      this.#version++;

      for (const key of changed) {
        this.emit("change", key, this.get(key));
      }

      this.emit("update", this.getDict(), changed);
    }

    return this.getDict();
  }

  set(key, value) {
    if (
      typeof key !== "string" ||
      !key ||
      FORBIDDEN_KEYS.has(key)
    ) {
      throw new TypeError("Invalid config key");
    }

    const next = {
      ...this.#config,
      [key]: serializeValue(value)
    };

    this.#commit(next);

    return this.get(key);
  }

  setDict(dict) {
    validateConfig(dict);

    const next = { ...this.#config };

    for (const [key, value] of Object.entries(dict)) {
      if (!key || FORBIDDEN_KEYS.has(key)) {
        throw new TypeError("Invalid config key");
      }

      next[key] = serializeValue(value);
    }

    return this.#commit(next);
  }

  reset(key) {
    if (key === undefined) {
      return this.#commit(clone(this.#defaults));
    }

    if (!Object.hasOwn(this.#defaults, key)) {
      throw new Error("Unknown default config key: " + key);
    }

    return this.set(key, this.#defaults[key]);
  }

  async sync() {
    if (!this.#cachePath) return;

    const snapshot = JSON.stringify(this.#config, null, 2);

    const write = async () => {
      const dir = path.dirname(this.#cachePath);

      await fs.promises.mkdir(dir, { recursive: true });

      const tempPath =
        this.#cachePath +
        "." + process.pid +
        "." + crypto.randomBytes(6).toString("hex") +
        ".tmp";

      try {
        await fs.promises.writeFile(tempPath, snapshot);
        await fs.promises.rename(tempPath, this.#cachePath);
      } finally {
        await fs.promises.rm(tempPath, { force: true });
      }
    };

    this.#syncQueue = this.#syncQueue.then(write, write);

    return this.#syncQueue;
  }

  async reload() {
    if (!this.#cachePath) return this.getDict();

    let cached;

    try {
      cached = JSON.parse(
        await fs.promises.readFile(this.#cachePath, "utf8")
      );
      validateConfig(cached);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      cached = {};
    }

    return this.#commit({
      ...clone(this.#defaults),
      ...clone(cached)
    });
  }

  #authorized(req, url) {
    const auth = req.headers.authorization || "";

    const bearer = auth.startsWith("Bearer ")
      ? auth.slice(7)
      : "";

    const supplied = bearer ||
      url.searchParams.get("token") ||
      "";

    const a = Buffer.from(supplied);
    const b = Buffer.from(this.#token);

    return a.length === b.length &&
      crypto.timingSafeEqual(a, b);
  }

  #send(res, status, data, contentType = "application/json") {
    const body = contentType.startsWith("application/json")
      ? JSON.stringify(data)
      : data;

    res.writeHead(status, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
    });

    res.end(body);
  }

  async #readBody(req) {
    const chunks = [];
    let size = 0;
    const limit = 1024 * 1024;

    for await (const chunk of req) {
      size += chunk.length;

      if (size > limit) {
        const err = new Error("Request body too large");
        err.statusCode = 413;
        throw err;
      }

      chunks.push(chunk);
    }

    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }

  async #handle(req, res) {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && url.pathname === "/") {
      return this.#send(
        res,
        200,
        SPA,
        "text/html; charset=utf-8"
      );
    }

    if (
      url.pathname === "/api/get_config" ||
      url.pathname === "/api/set_config"
    ) {
      if (!this.#authorized(req, url)) {
        return this.#send(res, 401, {
          error: "Unauthorized"
        });
      }
    }

    if (
      req.method === "GET" &&
      url.pathname === "/api/get_config"
    ) {
      return this.#send(res, 200, {
        config: this.getDict(),
        version: this.getVersion()
      });
    }

    if (
      req.method === "POST" &&
      url.pathname === "/api/set_config"
    ) {
      try {
        const body = await this.#readBody(req);

        validateConfig(body);
        this.setDict(body);

        // UI save means persistent save.
        await this.sync();

        return this.#send(res, 200, {
          ok: true,
          config: this.getDict(),
          version: this.getVersion()
        });
      } catch (err) {
        return this.#send(
          res,
          err.statusCode || 400,
          { error: err.message }
        );
      }
    }

    return this.#send(res, 404, {
      error: "Not found"
    });
  }

  listen(address) {
    if (this.#server) {
      throw new Error("Teleconfig is already listening");
    }

    const parsed = parseListenAddress(address);

    if (
      !Number.isInteger(parsed.port) ||
      parsed.port < 0 ||
      parsed.port > 65535
    ) {
      throw new RangeError("Invalid port");
    }

    this.#server = http.createServer((req, res) => {
      this.#handle(req, res).catch(err => {
        console.error("[Teleconfig]", err);

        if (!res.headersSent) {
          this.#send(res, 500, {
            error: "Internal server error"
          });
        } else {
          res.destroy();
        }
      });
    });

    this.#server.on("close", () => {
      this.#server = null;
    });

    this.#server.listen(parsed);

    return this.#server;
  }

  async destroy() {
    if (!this.#server) return;

    const server = this.#server;

    await new Promise((resolve, reject) => {
      server.close(err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
