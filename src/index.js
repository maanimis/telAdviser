import { Api, TelegramClient } from "telegram";
import { StoreSession } from "telegram/sessions/index.js";
import debug from "debug";
import readline from "readline";
import { NewMessage } from "telegram/events/index.js";
import config from "config";
import CMD from "./commands.js";

const log = console.log;
process.on("uncaughtException", (err) => {
  log("\n[~]error:", err);
});
const DEBUG = debug("index");
const storeSession = new StoreSession(config.get('sessionFileName'));
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let options = {
  connectionRetries: 5,
};
if (config.get('proxy.enable')) {
  options.proxy = config.get('proxy');
}
const client = new TelegramClient(
  storeSession,
  config.get('apiId'),
  config.get('apiHash'),
  options
);
global.telClient = client;
global.telApi = Api;
client.setLogLevel("info");

class Info {
  constructor({ message, cmd, args, sender }) {
    this.message = message;
    this.messageID = message.id;
    this.sender = sender;
    this.cmd = cmd;
    this.args = args;
    this.tempMessageID = 0;
    DEBUG("message:", message);
    DEBUG("sender:", sender);
    DEBUG("messageID:", this.messageID);
    DEBUG("cmd:", cmd);
    DEBUG("args:", args);
    DEBUG("tempMessageID:", this.tempMessageID);
  }
}

async function cmdHandler(event) {
  const message = event.message;
  const [cmd, ...args] = message.text.split(" ");
  const sender = await message.getSender();
  if (!args[0] && !["/help"].includes(cmd)) return;
  if (cmd in CMD) {
    const INFO = new Info({ message, cmd, args, sender });
    const Func = CMD[cmd];
    Func(INFO).catch(async (err) => {
      await client.sendMessage(sender, {
        message: err,
      });
    });
  } else {
    await client.sendMessage(sender, {
      message: "The Command NotFound!!",
    });
  }
}

log('running@',config.get("name"))
await client.start({
  phoneNumber: async () =>
    await new Promise((res) => rl.question("Please enter your number: ", res)),
  password: async () =>
    await new Promise((res) =>
      rl.question("Please enter your password: ", res)
    ),
  phoneCode: async () =>
    await new Promise((res) =>
      rl.question("Please enter the code you received: ", res)
    ),
  onError: (err) => log(err),
});
log("You should now be connected.");
client.session.save();
client.addEventHandler(cmdHandler, new NewMessage({ chats: config.get('sudo') }));
log("running...");
