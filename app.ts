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

for await (const req of server) {
  const path = req.url === "/"
    ? `${Deno.cwd()}/public/index.html`
    : `${Deno.cwd()}/public${req.url}`;
  if (await fileExists(path)) {
    const content = await serveFile(req, path);
    req.respond(content);
  }
  else if (req.url === "/commit")
  {
    const pat = Deno.env.get("GITHAB_PAT");
    req.respond({ body: Deno.env.get("TEST") });
  }
  else if (req.url === "/ping")
    req.respond({ body: `Hello World! Deno ${Deno.version.deno} is in charge.\n` });
  else
    req.respond({status: 404});
}
