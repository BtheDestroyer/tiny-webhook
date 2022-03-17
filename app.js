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
    var performedAction = false;
    if (action.hasOwnProperty("command"))
    {
        performedAction = true;
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
    
    return performedAction;
}

function handleHooks(hook)
{
    const MSG = (() => {
        if (!hook.hasOwnProperty("message") || !hook["message"])
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
    var i = 0;
    for (const HOOK of CFG["hooks"])
    {
        const CURRENT_NAME = (() => {
            if (HOOK.hasOwnProperty("name"))
            {
                return HOOK["name"];
            }
            return `Hook #${i} (nameless)`;
        })();
        ++i;
        LOG.debug(`Testing hook "${CURRENT_NAME}"`);
        if (validateRequirement("root", HOOK["requirements"], { "root": hook }))
        {
            LOG.info(`Handled by hook: "${CURRENT_NAME}"`);
            if (!doAction(HOOK["action"]))
            {
                LOG.warning(`No action performed! Make sure the hook "${CURRENT_NAME}" has a valid 'action'.`);
            }
            return true;
        }
    }
    return false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
// Main program start //
////////////////////////

// Config requirement validation
if (!CFG.hasOwnProperty("http") || !CFG["http"])
{
    fail(`'${CFG_PATH}' does not have a data for 'http'!`);
}
if (!CFG["http"].hasOwnProperty("port") || !CFG["http"]["port"])
{
    fail(`'${CFG_PATH}' does not have a value for 'http.port'!`);
}
if (typeof(CFG["http"]["port"]) !== 'number')
{
    fail(`The value of 'http.port' in '${CFG_PATH}' is not a number (eg: 8081)`);
}
if (!CFG.hasOwnProperty("hooks") || !CFG["hooks"])
{
    fail(`'${CFG_PATH}' does not have any hooks!`);
}
if (typeof(CFG["hooks"]) !== "object" || !CFG["hooks"][0])
{
    fail(`The value of 'hooks' in '${CFG_PATH}' is not a list!`);
}

// Test all hooks for a name
for (const IDX in CFG["hooks"])
{
    if (!CFG["hooks"][IDX].hasOwnProperty("name"))
    {
        LOG.warning(`Hook #${IDX} has no 'name'`);
    }
}

const PORT = CFG["http"]["port"];
LOG.info(`Starting tiny-webhook on port ${PORT}`);
HTTP.createServer((req, res) => {
    try
    {
        if (req.method === "GET")
        {
            LOG.info(`HTTP GET request recieved. Sending log...`)
            res.writeHead(200, {'Content-Type':'text/plain'});
            var messagesString = "";
            const LOG_LENGTH = 20;
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
            LOG.warning(`Unsupported HTTP method (${req.method}) request recieved`)
            res.writeHead(405, {"Content-Type":"text/plain"});
            res.write(`Invalid HTTP method: ${req.method}`);
            res.end();
            return;
        }
        var body = "";
        req.on("data", chunk => body += chunk.toString());
        req.on("end", () => {
            LOG.debug(`Handling POST request:${JSON.stringify(JSON.parse(body))}`);
            if (handleHooks(JSON.parse(body)))
            {
                res.writeHead(200, {"Content-Type":"text/plain"});
                res.end();
                return;
            }
            res.writeHead(400, {"Content-Type":"text/plain"});
            const MSG = "Configuration does not have a hook to handle this request";
            LOG.warning(`${MSG}:${JSON.stringify(JSON.parse(body))}`);
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
}).on("uncaughtException", (err) => {
    LOG.error(`Uncaught exception thrown: ${err}`);
}).listen(PORT);
