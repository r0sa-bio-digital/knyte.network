import { serve } from "https://deno.land/std/http/server.ts";
import * as flags from "https://deno.land/std/flags/mod.ts";

const DEFAULT_PORT = 8080;
const argPort = flags.parse(Deno.args).port;
const port = argPort ? Number(argPort) : DEFAULT_PORT;

const s = serve({ port: port });
console.log("http://localhost:" + port);

for await (const req of s) {
  req.respond({ body: "Hello World from Deno\n" });
}
