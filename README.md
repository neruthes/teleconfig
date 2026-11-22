# Teleconfig

**A minimal, zero-dependency runtime configuration manager for Node.js.**

Teleconfig embeds a lightweight HTTP server and a portable configuration SPA directly into your application. It keeps runtime configuration in memory, persists it to a JSON file, and allows other processes—even non-Node.js applications—to consume the same configuration through the filesystem.

## Features

- Zero external dependencies.
- Built-in, self-hosted configuration UI (no external CSS or JavaScript).
- Dynamic forms for strings, numbers, and JSON values.
- In-memory configuration with JSON file persistence.
- Atomic batch updates and serialized file writes.
- Bearer token authentication.
- Change events and configuration version tracking.
- Cross-language compatibility through JSON cache files.

## Installation

```
npm install teleconfig
```

## Quick Start

```
import { Teleconfig } from "teleconfig";

const config = Teleconfig.createDaemon({
  backdoor_token: process.env.RT_CONF_TOKEN,
  cache_path: process.env.RT_CONF_CACHE_PATH || "../rt_conf_cache.json",
  default_config: {
    MAX_UPLOAD_MB_PER_USER_DAY: 99,
    ENABLE_REGISTRATION: true,
    APP_NAME: "My App",
  }
});

// Start the configuration server
config.listen("127.0.0.1:9080");

// Read configuration
console.log(config.get("MAX_UPLOAD_MB_PER_USER_DAY"));
console.log(config.getDict());

// Update configuration
config.set("MAX_UPLOAD_MB_PER_USER_DAY", 120);

config.setDict({
  ENABLE_REGISTRATION: false,
  APP_NAME: "My New App"
});

// Persist configuration to disk
await config.sync();
```

Open `http://127.0.0.1:9080/` to access the built-in management UI. Enter your backdoor token to authenticate.

## API

| Method | Description |
| --- | --- |
| `createDaemon(options)` | Create a configuration instance |
| `listen(address)` | Start the HTTP server |
| `destroy()` | Stop the HTTP server |
| `getDict()` | Get a read-only configuration snapshot |
| `get(key)` | Get a configuration value |
| `set(key, value)` | Update a configuration value |
| `setDict(dict)` | Atomically update multiple values |
| `reset(key?)` | Restore default configuration |
| `sync()` | Persist configuration to JSON |
| `reload()` | Reload configuration from JSON |
| `getVersion()` | Get the configuration version |

## Change Events

```
config.on("change", (key, value) => {
  console.log("Configuration changed:", key, value);
});

config.on("update", (config, changedKeys) => {
  console.log("Updated keys:", changedKeys);
});
```

## HTTP API

| Method      | Endpoint          | Description             |
| ----------- | ----------------- | ----------------------- |
| GET         | `/`               | Built-in management SPA |
| GET         | `/api/get_config` | Retrieve configuration  |
| POST        | `/api/set_config` | Update configuration    |

API requests require a Bearer token. POST requests accept JSON objects; omitted keys remain unchanged. Successful management UI updates are automatically persisted.

## Cross-Language Integration

Non-Node.js applications can simply read the JSON cache file:

```
import json

with open("../rt_conf_cache.json") as f:
    config = json.load(f)

max_upload = config["MAX_UPLOAD_MB_PER_USER_DAY"]
```

## Security

Use a strong, randomly generated backdoor token. Keep the management interface on localhost or a trusted network, and use HTTPS when accessing it remotely. Avoid exposing the management endpoint directly to the public internet.




## Copyright

Copyright (c) 2026 Neruthes. Published with the MIT license.




