
import { Teleconfig } from "../src/index.mjs";

export const myDaemon = Teleconfig.createDaemon({
  backdoor_token: process.env.RT_CONF_TOKEN || "RT_CONF_TOKEN",
  cache_path: "./conf1.json",

  default_config: {
    MAX_UPLOAD_MB_PER_USER_DAY: 99,
    ENABLE_REGISTRATION: true,
    APP_NAME: "My App",
    EXTRA_SETTINGS: {
      maintenance: false,
      allowed_ips: []
    }
  }
});

myDaemon.listen("0.0.0.0:9080");

// Read
console.log(myDaemon.get("MAX_UPLOAD_MB_PER_USER_DAY"));

// Read snapshot
console.log(myDaemon.getDict());

// Modify
myDaemon.set("MAX_UPLOAD_MB_PER_USER_DAY", 120);

// Batch modify
myDaemon.setDict({
  ENABLE_REGISTRATION: false,
  APP_NAME: "My New App"
});

// Persist
await myDaemon.sync();

// Listen for changes
myDaemon.on("change", (key, value) => {
  console.log("Changed:", key, value);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  await myDaemon.sync();
  await myDaemon.destroy();
});
