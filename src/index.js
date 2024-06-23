import { Api, TelegramClient } from "telegram";
import { StoreSession } from "telegram/sessions/index.js";
import debug from "debug";
import readline from "readline";
import { NewMessage } from "telegram/events/index.js";
import config from "config";
import CMD from "./commands.js";

const log = console.log;
const DEBUG = debug("index");
const storeSession = new StoreSession(config.get("sessionFileName"));
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const clientOptions = {
  connectionRetries: 5,
  ...(config.get("proxy.enable") && { proxy: config.get("proxy") }),
};

const client = new TelegramClient(
  storeSession,
  config.get("apiId"),
  config.get("apiHash"),
  clientOptions
);

global.telClient = client;
global.telApi = Api;
client.setLogLevel("info");

process.on("uncaughtException", (err) => {
  log("\n[~]error:", err);
});

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

async function getInput(prompt) {
  return await new Promise((res) => rl.question(prompt, res));
}

async function startClient() {
  log("running@", config.get("name"));

  await client.start({
    phoneNumber: async () => await getInput("Please enter your number: "),
    password: async () => await getInput("Please enter your password: "),
    phoneCode: async () =>
      await getInput("Please enter the code you received: "),
    onError: (err) => log(err),
  });

  log("You should now be connected.");
  client.session.save();
  client.addEventHandler(
    cmdHandler,
    new NewMessage({ chats: config.get("sudo") })
  );
  log("running...");
}

async function cmdHandler(event) {
  const message = event.message;
  const [cmd, ...args] = message.text.split(" ");
  const sender = await message.getSender();

  if (!args[0] && cmd !== "/help") return;

  if (CMD[cmd]) {
    const INFO = new Info({ message, cmd, args, sender });
    try {
      await CMD[cmd](INFO);
    } catch (err) {
      await client.sendMessage(sender, { message: err.toString() });
    }
  } else {
    await client.sendMessage(sender, { message: "The Command NotFound!!" });
  }
}

startClient();
