import { Application, Router } from "https://deno.land/x/oak/mod.ts";
import { serveFile } from "https://deno.land/std/http/file_server.ts";
import * as flags from "https://deno.land/std/flags/mod.ts";

const DEFAULT_PORT = 8080;
const argPort = flags.parse(Deno.args).port;
const port = argPort ? Number(argPort) : DEFAULT_PORT;

async function fileExists(path: string) {
  try {
    const stats = await Deno.lstat(path);
    return stats && stats.isFile;
  } catch(e) {
    if (e && e instanceof Deno.errors.NotFound) {
      return false;
    } else {
      throw e;
    }
  }
}

async function getActualFileSHA(owner: string, repo: string, pat: string, knyteFilename: string)
{
  let fileSHA = null;
  const response = await fetch(
    'https://api.github.com/repos/' +
    owner + '/' + repo + '/commits/main',
    {
      headers: {
        authorization: 'token ' + pat,
        'If-None-Match': '' // to disable github api 60 seconds cache
      }
    }
  );
  if (response.status === 200)
  {
    const json = await response.json();
    {
      const response = await fetch(
        'https://api.github.com/repos/' +
        owner + '/' + repo + '/git/trees/' + json.commit.tree.sha,
        {
          headers: {
            authorization: 'token ' + pat,
            'If-None-Match': '' // to disable github api 60 seconds cache
          }
        }
      );
      if (response.status === 200)
      {
        //console.log("Parse tree:");
        const json = await response.json();
        if (json && json.tree && json.tree.length)
        {
          for (let i = 0; i < json.tree.length; ++i)
          {
            const filename = json.tree[i].path;
            //console.log(filename);
            if (filename === knyteFilename)
            {
              fileSHA = json.tree[i].sha;
              break;
            }
          }
        }
      }
    }
  }
  return fileSHA;
}

async function commitFile(owner: string, repo: string, pat: string, knyteFilename: string, message: string, content: string)
{
  const sha = await getActualFileSHA(owner, repo, pat, knyteFilename)
  if (sha)
  {
    const method = 'PUT';
    const headers = {
      authorization: 'token ' + pat,
      'Content-Type': 'application/json'
    };
    const body = JSON.stringify({message, content, sha});
    const response = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + knyteFilename, {method, headers, body});
    const json = await response.json();
    if (response.status !== 200 || json.content.name !== knyteFilename)
    {
      console.log(response);
      console.log(json);
      return `{"error": "github commit failed"}`;
    }
    else
      return `{"result": "` + json.content.sha + `"}`;
  }
  else
    return `{"error": "invalid github sha"}`;
}

const app = new Application();
const router = new Router();
router
  .get("/ping", (ctx) => {
    ctx.response.body = `Hello World! Deno ${Deno.version.deno} is in charge.\n`;
  })
  .get("/", async (ctx) => {
    const path = `${Deno.cwd()}/public/index.html`;
    const content = await serveFile(ctx.request, path);
    ctx.response.body = content;
  })
  .post("/commit", async (ctx) => {
    let result;
    const pat = Deno.env.get("GITHAB_PAT");
    if (pat)
    {
      const url = ctx.request.url;
      const jsonStream = ctx.request.body();
      const json = await jsonStream.value;
      console.log(url);
      console.log(json);
      const params = url.split("/");
      if (!params[0] && params[1] === "commit" && params[2] && params[3])
      {
        const owner = params[2];
        const repo = params[3];
        const knyteFilename = "README.md";
        const message = "test message"; // ?
        const content = "dGVzdCBjb250ZW50"; //"test content"; // ?
        result = `{"result": "` + await commitFile(owner, repo, pat, knyteFilename, message, content) + `"}`;
      }
      else
        result = `{"error": "invalid parameters"}`;
    }
    else
      result = `{"error": "githab pat not found"}`;
    ctx.response.body = result;
  });
app.use(router.routes());
app.use(router.allowedMethods());;
app.listen({port});
console.log("http://localhost:" + port);
