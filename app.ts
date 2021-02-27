import { Application, Router, send } from "https://deno.land/x/oak/mod.ts";
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

async function getActualFileSHA(owner: string, repo: string, pat: string, coreFilename: string)
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
        const json = await response.json();
        if (json && json.tree && json.tree.length)
        {
          for (let i = 0; i < json.tree.length; ++i)
          {
            const filename = json.tree[i].path;
            if (filename === coreFilename)
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

async function commitFile(owner: string, repo: string, pat: string, coreFilename: string, message: string, content: string)
{
  const sha = await getActualFileSHA(owner, repo, pat, coreFilename)
  if (sha)
  {
    const method = 'PUT';
    const headers = {
      authorization: 'token ' + pat,
      'Content-Type': 'application/json'
    };
    const body = JSON.stringify({message, content, sha});
    const response = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + coreFilename, {method, headers, body});
    const json = await response.json();
    if (response.status !== 200 || json.content.name !== coreFilename)
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

const coreOwner = "r0sa-bio-digital";
const coreRepo = "knyte.network";
const targets = {
  backend: "app.ts",
  frontend: "index.html",
};

const app = new Application();
const router = new Router();
router
  .get("/ping", (ctx) => {
    ctx.response.body = `Hello Knyte World! Deno ${Deno.version.deno} is in charge.\n`;
  })
  .get("/", async (ctx) => {
    await send(ctx, `/${targets.frontend}`, {
      root: `${Deno.cwd()}`,
    });
  })
  .get("/:target", async (ctx) => {
    const target = targets[ctx.params.target];
    if (target)
      await send(ctx, `/${target}`, {
        root: `${Deno.cwd()}`,
      });
    else
      ctx.response.body = `{"error": "invalid target"}`;
  })
  .post("/commit/:target", async (ctx) => {
    let result;
    const pat = Deno.env.get("GITHAB_PAT");
    const filename = targets[ctx.params.target];
    if (pat && filename)
    {
      const jsonStream = ctx.request.body();
      const json = await jsonStream.value;
      const {comment, content} = json;
      result = await commitFile(coreOwner, coreRepo, pat, filename, comment, content);
    }
    else
      result = `{"error": "invalid github pat/target"}`;
    ctx.response.body = result;
  });
app.use(router.routes());
app.use(router.allowedMethods());
app.listen({port});
console.log("http://localhost:" + port);
