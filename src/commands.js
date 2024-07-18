import config from "config";
import util from "util";
import debug from "debug";
import fs from "fs";

const log = console.log;
const DEBUG = debug("commands");

class ProgressBar {
  constructor(info) {
    this.info = info;
    this._text = "this is test message!!";
    this.canCall = true;
  }

  getText() {
    return this._text;
  }

  setText(value) {
    DEBUG("new text:", this._text);
    this._text = value;
    this.canCall = true;
    return this;
  }

  async updateMessage() {
    await global.telClient.editMessage(this.info.sender, {
      message: this.tempMessageID,
      text: this._text,
      parse_mode: "MarkdownV2",
    });
  }

  async download(chunk, total) {
    if (this.canCall) {
      log("Downloading...");
      this.canCall = false;
      await this.updateMessage();
    } else {
      log(`Remain: ${this.remain(chunk, total)}%`);
    }
  }

  async upload(chunk) {
    if (this.canCall) {
      log("Uploading...");
      this.canCall = false;
      await this.updateMessage();
    } else {
      log(`Progress: ${(chunk * 100).toFixed(2)}%`);
    }
  }

  remain(chunk, total = 100) {
    return (((total - chunk) / total) * 100).toFixed(2);
  }
}

class History {
  constructor(target, count, offset = 0) {
    this.target = target;
    this.count = Number(count);
    this.offset = Number(offset);
    this.added = 0;
    this.limit = 100;
    this.isCompleted = false;
  }

  async getMessages() {
    this.setOffset();
    const result = await global.telClient.invoke(
      new global.telApi.messages.GetHistory({
        peer: this.target,
        offsetId: 0,
        offsetDate: 0,
        addOffset: this.offset,
        limit: this.limit,
        maxId: 0,
        minId: 0,
        hash: genRandomId(),
      })
    );
    this.added += this.limit;
    return result;
  }

  setOffset() {
    if (this.limit >= this.count) {
      this.isCompleted = true;
      this.limit = this.count;
    } else {
      this.offset += this.added;
      if (this.offset > this.count) {
        this.isCompleted = true;
      }
    }
  }
}

function genHelp() {
  let text = "";
  const structure = "🔹`%s`\n**description:** __%s__\n**args:** `%s`\n**usage:** `%s`\n〰️〰️〰️\n";
  for (let cmd of config.get("commands")) {
    text += util.format(
      structure,
      cmd.command,
      cmd.description,
      cmd.args,
      cmd.usage
    );
  }
  return text;
}

function genRandomId() {
  return parseInt(Math.random() * 10e13);
}

function parseLink(link) {
  let target, mid;
  const linkSplit = new URL(link).pathname.split("/");
  if (linkSplit[1] == "c") {
    [, , target, mid] = linkSplit;
  } else {
    [, target, mid] = linkSplit;
  }
  if (!isNaN(target)) {
    target = "-100" + target;
  }
  return { target, mid };
}

async function checkMessageID(info, fromID, toID) {
  const arrSize = Math.abs(+fromID - +toID);
  let idList = [],
    randomIdList = [],
    isValid;
  if (arrSize > 100) {
    isValid = false;
    await global.telClient.sendMessage(info.sender, {
      message: `total: ${arrSize}\nFailed\nThe maximum value is 100`,
    });
  } else {
    isValid = true;
    await global.telClient.sendMessage(info.sender, {
      message: `total: ${arrSize}\nplease wait...`,
    });
    idList = Array.from(Array(arrSize), (_, index) => +fromID + index);
    randomIdList = Array.from(Array(arrSize), (_) => genRandomId());
  }

  return { isValid, arrSize, idList, randomIdList };
}

async function helpCommand(info) {
  await global.telClient.sendMessage(info.sender, {
    message: genHelp(),
  });
}

async function idCommand(info) {
  const result = await global.telClient.invoke(
    new global.telApi.users.GetFullUser({
      id: info.args[0],
    })
  );
  await global.telClient.sendMessage(info.sender, {
    message: result.fullUser.id,
  });
}

async function handleMedia(info, msg, postText, tempMSG) {
  const progressBar = new ProgressBar(info);
  progressBar.tempMessageID = tempMSG;

  const file = await downloadMedia(info, msg, progressBar);
  await uploadMedia(info, file, postText, progressBar);

  await global.telClient.deleteMessages(info.sender, [tempMSG], {
    revoke: true,
  });
  fs.unlink(file, (err) => {
    if (err) {
      DEBUG("there is error while deleting:", file);
      console.error(err);
      return;
    }
    DEBUG(`${file} is deleted.`);
  });
}

async function downloadMedia(info, msg, progressBar) {
  progressBar.setText("Downloading...");
  const file = await global.telClient.downloadMedia(msg.media, {
    workers: config.get("workers"),
    progressCallback: progressBar.download.bind(progressBar),
    outputFile: config.get("downloads"),
  });
  DEBUG("downloaded file:", file);
  await progressBar.setText("Download Completed!!").download();
  return file;
}

async function uploadMedia(info, file, postText, progressBar) {
  progressBar.setText("Uploading...");
  await global.telClient.sendFile(info.sender, {
    file,
    caption: postText,
    workers: config.get("workers"),
    forceDocument: info.args[2] ? true : false,
    voiceNote: false,
    videoNote: false,
    progressCallback: progressBar.upload.bind(progressBar),
  });
  await progressBar.setText("Upload Completed!!").upload();
}

async function ssaveCommand(info) {
  const { target: peer, mid: fromId } = parseLink(info.args[0]);
  const { mid: toId } = parseLink(info.args[1]);
  const checkID = await checkMessageID(info, fromId, toId);
  if (!checkID.isValid) return;
  const { idList } = checkID;
  const result = await global.telClient.getMessages(peer, { ids: idList });

  for (const msg of result) {
    if (!msg) continue;
    const postText = msg.message;
    const media = msg.media;
    if (media) {
      const tempMSG = await global.telClient
        .sendMessage(info.sender, { message: "wait..." })
        .then((e) => e.id);
      await handleMedia(info, msg, postText, tempMSG);
    } else {
      await global.telClient.sendMessage(info.sender, { message: postText });
    }
  }
  await global.telClient.sendMessage(info.sender, {
    message: "✅this message is from cli bot:\n\n forward completed!!",
  });
}

async function saveCommand(info) {
  const { target: fromPeer, mid: fromId } = parseLink(info.args[0]);
  const { mid: toId } = parseLink(info.args[1]);
  const checkID = await checkMessageID(info, fromId, toId);
  if (!checkID.isValid) return;
  const { idList, randomIdList } = checkID;
  await global.telClient.invoke(
    new global.telApi.messages.ForwardMessages({
      fromPeer,
      id: idList,
      randomId: randomIdList,
      toPeer: info.args[2] || info.sender,
      dropAuthor: info.args[3] ? true : false,
      withMyScore: true,
    })
  );
  await global.telClient.sendMessage(info.sender, {
    message: "✅this message is from cli bot:\n\n forward completed!!",
  });
}

async function savepCommand(info) {
  let [target, toPeer, count, offset, dropAuthor] = info.args;
  offset ||= 0;
  const history = new History(target, count, offset);
  let msg, messages, ids, randomIdList;
  while (!history.isCompleted) {
    messages = await history.getMessages().then((m) => m.messages);
    ids = messages.map((msg) => msg.id).sort().reverse();
    randomIdList = Array.from(Array(ids.length), (_) => genRandomId());
    await global.telClient.invoke(
      new global.telApi.messages.ForwardMessages({
        fromPeer: target,
        id: ids,
        randomId: randomIdList,
        toPeer: toPeer || info.sender,
        dropAuthor: dropAuthor ? true : false,
        withMyScore: true,
      })
    );
  }
  await global.telClient.sendMessage(info.sender, {
    message: "✅this message is from cli bot:\n\n forward completed!!",
  });
}

async function ssavepCommand(info) {
  const [target, count, offset] = info.args;
  const history = new History(target, count, offset);
  let postText, media, progressBar, file, tempMSG, messages, msg;
  while (!history.isCompleted) {
    messages = await history.getMessages().then((m) => m.messages);
    for (msg of messages) {
      DEBUG("msg:", msg);
      if (!msg) continue;
      postText = msg.message;
      media = msg.media;
      if (media) {
        tempMSG = await global.telClient
          .sendMessage(info.sender, { message: "wait..." })
          .then((e) => e.id);
        await handleMedia(info, msg, postText, tempMSG);
      } else {
        await global.telClient.sendMessage(info.sender, { message: postText });
      }
    }
  }
  await global.telClient.sendMessage(info.sender, {
    message: "✅this message is from cli bot:\n\n forward completed!!",
  });
}

async function contactCommand(info) {
  await global.telClient.sendFile(info.sender, {
    file: new global.telApi.InputMediaContact({
      phoneNumber: info.args[0],
      firstName: info.args[1],
      lastName: info.args[2] || "",
      vcard: info.args[3] || "",
    }),
  });
}

async function downloadCommand(info) {
  const { target: peer, mid } = parseLink(info.args[0]);
  const media = await global.telClient
    .getMessages(peer, { ids: +mid })
    .then((e) => e[0].media);
  const tempMSG = await global.telClient
    .sendMessage(info.sender, { message: "wait..." })
    .then((e) => e.id);
  const progressBar = new ProgressBar(info);
  progressBar.tempMessageID = tempMSG;
  const file = await downloadMedia(info, { media }, progressBar);
  await global.telClient.sendMessage(info.sender, { message: `saved:\n\n\`${file}\`` });
}

async function uploadCommand(info) {
  const tempMSG = await global.telClient
    .sendMessage(info.sender, { message: "wait..." })
    .then((e) => e.id);
  const progressBar = new ProgressBar(info);
  progressBar.tempMessageID = tempMSG;
  await uploadMedia(info, info.args[0], "", progressBar);
}

async function joinCommand(info) {
  const result = await global.telClient.invoke(
    new global.telApi.channels.JoinChannel({ channel: info.args[0] })
  );

  DEBUG("join to:", result);
  await global.telClient.sendMessage(info.sender, { message: "Done!" });
}

async function joinPrivateCommand(info) {
  const hash = info.args[0].split("+")[1];
  const result = await global.telClient.invoke(
    new global.telApi.messages.ImportChatInvite({ hash })
  );

  DEBUG("join to:", result);
  await global.telClient.sendMessage(info.sender, { message: "Done!" });
}

async function leftCommand(info) {
  const result = await global.telClient.invoke(
    new global.telApi.channels.LeaveChannel({ channel: info.args[0] })
  );
  DEBUG("left from:", result);
  await global.telClient.sendMessage(info.sender, { message: "Done!" });
}

async function leftPrivateCommand(info) {
  const result = await global.telClient.invoke(
    new global.telApi.messages.ExportChatInvite({ peer: info.args[0] })
  );
  DEBUG("left from:", result);
  await global.telClient.sendMessage(info.sender, { message: "Done!" });
}

export default {
  "/help": helpCommand,
  "/id": idCommand,
  "/ssave": ssaveCommand,
  "/save": saveCommand,
  "/contact": contactCommand,
  "/download": downloadCommand,
  "/upload": uploadCommand,
  "/join": joinCommand,
  "/joinp": joinPrivateCommand,
  "/left": leftCommand,
  "/leftp": leftPrivateCommand,
  "/savep": savepCommand,
  "/ssavep": ssavepCommand,
};
