import { serve } from "https://deno.land/std/http/server.ts";
import { serveFile } from "https://deno.land/std/http/file_server.ts";
import * as flags from "https://deno.land/std/flags/mod.ts";

const DEFAULT_PORT = 8080;
const argPort = flags.parse(Deno.args).port;
const port = argPort ? Number(argPort) : DEFAULT_PORT;

const server = serve({ port: port });
console.log("http://localhost:" + port);

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
  let fileUrl, fileSHA;
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
            if (filename === knyteFilename)
            {
              fileUrl = json.tree[i].url;
              fileSHA = json.tree[i].sha;
              break;
            }
          }
        }
      }
    }
  }
  return null;
}

for await (const req of server) {
  console.log(req);
  const path = req.url === "/"
    ? `${Deno.cwd()}/public/index.html`
    : `${Deno.cwd()}/public${req.url}`;
  if (await fileExists(path)) {
    const content = await serveFile(req, path);
    req.respond(content);
  }
  else if (req.url === "/ping")
    req.respond({ body: `Hello World! Deno ${Deno.version.deno} is in charge.\n` });
  else if (req.url.startsWith("/commit/") && req.method === "POST")
  {
    const pat = Deno.env.get("GITHAB_PAT");
    if (pat)
    {
      const params = req.url.split("/");
      if (!params[0] && params[1] === "commit" && params[2] && params[3])
      {
        const owner = params[2];
        const repo = params[3];
        const knyteFilename = "public/index.html";
        const sha = await getActualFileSHA(owner, repo, pat, knyteFilename)
        const message = "test message"; // ?
        const content = "test content"; // ?
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
          req.respond({ body: `{"error": "github commit failed"}` });
        }
        else
          req.respond({ body: `{"result": "` + json.content.sha + `"}` });
      }
      else
        req.respond({ body: `{"error": "invalid parameters"}` });
    }
    else
      req.respond({ body: `{"error": "githab pat not found"}` });
  }
  else
    req.respond({status: 404});
}
