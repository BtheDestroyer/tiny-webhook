const FS = require("fs");
const HTTP = require("http");
const { exec } = require("child_process");
const { exit } = require("process");

const CFG_PATH = "./config.yaml";
const CFG = (() => {
    const YAML = require("yaml");
    const CFG_FILE = FS.readFileSync(CFG_PATH, "utf-8");
    return YAML.parse(CFG_FILE);
})();

const LOG = (() => {
    var logFile = null;
    if (CFG["log"].hasOwnProperty("file"))
    {
        logFile = FS.createWriteStream(CFG["log"]["file"]);
    }
    messages = [];
    function createLogger(level, prefix, output = console.log, always = false)
    {
        if (!always &&
           (!CFG.hasOwnProperty("log")
         || !CFG["log"].hasOwnProperty("levels")
         || !CFG["log"]["levels"].hasOwnProperty(level)
         ||  CFG["log"]["levels"][level] !== true))
        {
            return (message) => { /* do nothing */ };
        }
        return (message) => {
            const FMT_MSG = `${prefix} ${message}`;
            messages.push(FMT_MSG);
            output(FMT_MSG);
            if (logFile)
            {
                logFile.write(`${FMT_MSG}\n`);
            }
        };
    }
    return {
        logFile: logFile,
        messages: messages,
        critical: createLogger("critical", "[CRI]", console.error, true),
        error:    createLogger("errors",   "[ERR]", console.error),
        warning:  createLogger("warnings", "[WAR]", console.warn),
        debug:    createLogger("debug",    "[DBG]", console.log),
        info:     createLogger("info",     "[INF]", console.log),
    }
})();

function fail(reason)
{
    LOG.critical(reason);
    exit(1);
}

if (!CFG.hasOwnProperty("http")
 || !CFG["http"].hasOwnProperty("port")
 || typeof(CFG["http"]["port"]) !== 'number')
{
    fail(`'${CFG_PATH}' does not have a value for http.port or it is not a number (eg: 8081)`);
}

function validateRequirement(key, value, request)
{
    if (!request.hasOwnProperty(key))
    {
        return false;
    }
    if (typeof(value) === "object")
    {
        if (typeof(request[key]) !== "object")
        {
            return false;
        }
        for (const [K, V] of Object.entries(value))
        {
            if (!request[key].hasOwnProperty(K))
            {
                return false;
            }
            if (!validateRequirement(K, V, request[key]))
            {
                return false;
            }
        }
    }
    else
    {
        if (request[key] != value)
        {
            return false;
        }
    }
    return true;
}

function doAction(action)
{
    if (action.hasOwnProperty("command"))
    {
        exec(action["command"],
            {cwd: action.hasOwnProperty("cwd") ? action["cwd"] : "."},
            (error, stdout, stderr) =>
            {
                LOG.info(`Command outputs from [${action["command"]}]`);
                if (stdout)
                {
                    LOG.info(`stdout: ${stdout}`);
                }
                if (stderr)
                {
                    LOG.error(`stderr: ${stderr}`);
                }
                if (error)
                {
                    LOG.error(`error: ${error}`);
                }
            });
    }
}

function handleHooks(hook)
{
    const MSG = (() => {
        if (!hook.hasOwnProperty("message"))
        {
            return "(No message)";
        }
        if (hook["message"].hasOwnProperty("text"))
        {
            return hook["message"]["text"];
        }
        if (hook["message"].hasOwnProperty("html"))
        {
            return hook["message"]["html"];
        }
        if (hook["message"].hasOwnProperty("markdown"))
        {
            return hook["message"]["markdown"];
        }
    })();
    LOG.info(`Webhook request: ${MSG}`);
    for (const HOOK of CFG["hooks"])
    {
        if (validateRequirement("root", HOOK["requirements"], { "root": hook }))
        {
            doAction(HOOK["action"]);
            return true;
        }
    }
    return false;
}

const PORT = CFG["http"]["port"];
LOG.info(`Starting tiny-webhook on port ${PORT}`);
HTTP.createServer(async (req, res) => {
    try
    {
        if (req.method === "GET"
            && (CFG["log"].hasOwnProperty("web-portal")
                && CFG["log"]["web-portal"].hasOwnProperty("enabled")
                && CFG["log"]["web-portal"]["enabled"]))
        {
            LOG.debug(`HTTP GET request recieved. Sending log...`)
            res.writeHead(200, {'Content-Type':'text/plain'});
            var messagesString = "";
            const LOG_LENGTH = CFG["log"]["web-portal"].hasOwnProperty("count")
                                ? CFG["log"]["web-portal"]["count"]
                                : 20;
            const START = messages.length > 20
                        ? messages.length - LOG_LENGTH
                        : 0;
            messages.slice(START).reverse().forEach(
                msg => messagesString = `${msg}\n${messagesString}`
                );
            res.write(`tiny-webhook log\n================\n${messagesString}`);
            res.end();
            return;
        }
        if (req.method !== "POST")
        {
            LOG.debug(`Invalid HTTP method recieved: ${req.method}`)
            res.writeHead(405, {"Content-Type":"text/plain"});
            res.write(`Invalid HTTP method: ${req.method}`);
            res.end();
            return;
        }
        var body = "";
        req.on("data", chunk => body += chunk.toString());
        req.on("end", () => {
            if (handleHooks(JSON.parse(body)))
            {
                res.writeHead(200, {"Content-Type":"text/plain"});
                res.end();
                return;
            }
            res.writeHead(400, {"Content-Type":"text/plain"});
            const MSG = "Configuration does not have a hook to handle this request.";
            LOG.warning(`${MSG}\n${body}`);
            res.write(MSG);
            res.end();
        });
    }
    catch (e)
    {
        LOG.error(`Unhandled exception thrown: ${e}`);
        res.writeHead(500, {"Content-Type":"text/plain"});
        res.write(e);
        res.end();
    }
}).listen(PORT);
