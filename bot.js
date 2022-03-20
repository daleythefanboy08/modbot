const config = require("./data/config.json");

const { execSync } = require("child_process");
const { join } = require("path");

if (!config.ranOnce) {
    process.on("uncaughtException", function (e) {
        console.log("[uncaughtException] app will be terminated: ", e.stack);
        killProcess();
    });

    (async () => {
        const command = "npm install --save";

        console.log("[INSTALLER] - Please wait while the installer installs all modules... this may take some time");
        await execSync(command, {
            cwd: join(__dirname),
            stdio: [0, 1, 2],
        });

        config.ranOnce = true;

        fs.writeFile("./data/config.json", JSON.stringify(config, null, 4), err => {
            if (err) throw err;

            console.log(`[INSTALLER] - All modules have been installed. Please restart your bot to apply these changes`);
            process.kill(process.pid, "SIGINT");
        });
    })();
}

const Discord = require("discord.js");
const fs = require("fs");

const client = new Discord.Client({
    intents: [
        "GUILDS",
        "GUILD_MESSAGES",
        "GUILD_MEMBERS",
        "DIRECT_MESSAGES",
        "DIRECT_MESSAGE_REACTIONS",
        "DIRECT_MESSAGE_TYPING",
        "GUILD_INVITES",
        "GUILD_WEBHOOKS",
        "GUILD_MESSAGE_REACTIONS",
    ],
});
const commands = require("./data/nodes.json");

const functions = fs.readdirSync("./functions").filter(x => x.endsWith(".js"));
const mods = fs.readdirSync("./mods").filter(x => x.endsWith(".js"));

for (const file of mods) {
    functions.push(file);
}

client.login(config.token);

client.on("ready", () => {
    console.log(`${client.user.tag} is Online!`);
});

const DBT = {};

DBT.variables = {};

DBT.indexes = {};

DBT.bot = client;

DBT.nextResponse = (message, args, command, output) => {
    DBT.callOtherFunctions(command, message, args, command.connections[output]);
};

DBT.callEvent = (command, output, ...args) => {
    DBT.callEventFunctions(command, command.connections[output], ...args);
};

DBT.parseVariables = string => {
    newVal = string.replace(/\${(.*?)}/g, d => {
        const match = d.slice(2, d.toString().length - 1);
        const splitted = match.split(".");
        splitted.shift();

        if (match.includes("dbt.")) {
            let vr;

            vr = DBT.variables[splitted.join(".")];

            return vr;
        }
    });

    return newVal;
};

DBT.saveVariable = (name, value) => {
    DBT.variables[name] = value;
};

DBT.called = {};

DBT.callOtherFunctions = (command, message, args, connections) => {
    for (const _f of functions) {
        const file = require(`./functions/${_f}`) || require(`./mods/${_f}`);

        for (const o in connections) {
            let node = commands.find(x => x.name === connections[o]?.node);

            if (file.name == node?.type) {
                file.execute(DBT, node.variables, o, message, args, node);
            }
        }
    }
};

DBT.callEventFunctions = (command, connections, ...args) => {
    for (const _f of functions) {
        const file = require(`./functions/${_f}`) || require(`./mods/${_f}`);

        for (const o in connections) {
            let node = commands.find(x => x.name === connections[o]?.node);

            if (file.name == node?.type) {
                args.push(["no args"]);
                args.push(node);
                file.execute(DBT, node.variables, o, ...args);
            }
        }
    }
};

DBT.requireModule = async function (name) {
    try {
        const path = "./node_modules/" + name;
        return require(path);
    } catch (e) {
        console.log(`[INSTALLER] - Installing ${name}`);

        try {
            const command = "npm install " + name + " --save";
            await execSync(command, {
                cwd: join(__dirname),
                stdio: [0, 1, 2],
            });

            console.log(`[INSTALLER] - ${name} Has been installed. You may have to restart your bot.`);

            const path = "./node_modules/" + name;
            return require(path);
        } catch (error) {
            console.log(error);
            console.log(`[INSTALLER] - an error occured while installing ${name}.`);
            return null;
        }
    }
};

for (const command of commands) {
    if (command.category != "Event") continue;

    for (const event of functions) {
        const file = require("./functions/" + event) || require("./mods/" + event);

        if (file.category == "Event" && file.name == command.type) {
            file.execute(DBT, command.variables, command);
        }
    }
}

(async () => {
    const req = {};
    req.requireModule = async function () {
        console.log(`[INSTALLER] - Updating Discord.JS...`);

        try {
            const command = "npm install " + "discord.js@latest" + " --save";

            await execSync(command, {
                cwd: join(__dirname),
                stdio: [0, 1, 2],
            });

            console.log(`[INSTALLER] - Discord.JS Has been updated. You may have to restart your bot to apply these changes.`);

            config.latest = true;

            fs.writeFile("./data/config.json", JSON.stringify(config, null, 4), err => {
                if (err) throw err;
            });

            return true;
        } catch (error) {
            console.log(error);
            console.log(`[INSTALLER] - an error occured while updating Discord.JS.`);
            return null;
        }
    };

    if (!config.latest) req.requireModule();
})();

client.on("ready", () => {
    for (const _f of functions) {
        const file = require(`./functions/${_f}`) || require(`./mods/${_f}`);

        file.startup(DBT);
    }
});

client.on("messageCreate", async message => {
    if (message.author.bot || !message.content.toLowerCase(config.prefix)) return;

    const args = message.content.toLowerCase().slice(config.prefix.length).split(" ");
    const cmd = args.shift();

    DBT.indexes[message.id] = 0;

    const command = commands.filter(x => x.command).find(x => x.name == cmd);
    if (!command) return;

    DBT.saveVariable("author.username", message.author.username);
    DBT.saveVariable("author.id", message.author.id);
    DBT.saveVariable("author.tag", message.author.tag);
    DBT.saveVariable("author.avatarURL", message.author.avatarURL({ dynamic: true }));

    DBT.saveVariable("commandChannel.id", message.channel.id);
    DBT.saveVariable("commandChannel.name", message.channel.name);
    DBT.saveVariable("commandChannel.pos", message.channel.position);
    DBT.saveVariable("commandChannel.type", message.channel.type);

    DBT.saveVariable("guild.id", message.guild.id);
    DBT.saveVariable("guild.icon", message.guild.icon);
    DBT.saveVariable("guild.name", message.guild.name);
    DBT.saveVariable("guild.members", message.guild.memberCount);

    DBT.saveVariable("commandMessage.content", message.content);
    DBT.saveVariable("commandMessage.id", message.id);

    DBT.callOtherFunctions(command, message, args, command.connections["Responses"]);
});
