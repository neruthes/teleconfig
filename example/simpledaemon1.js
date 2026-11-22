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
      allowed_ips: [],
    },
  },
});

myDaemon.listen("0.0.0.0:9080");

// Listen for changes
myDaemon.on("change", async (key, value) => {
  await myDaemon.sync();
  console.log("Changed:", key, value);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  await myDaemon.sync();
  await myDaemon.destroy();
});
