import { createServer } from "node:http";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { TwitterApi } from "twitter-api-v2";
import { loadEnvConfig, getProjectRoot } from "../config/load-config.js";
import { log } from "../utils/logger.js";

const CALLBACK_PORT = 3000;
const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/callback`;
const SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"];

function updateEnvFile(updates: Record<string, string>): void {
  const envPath = resolve(getProjectRoot(), ".env");
  let content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    const line = `${key}=${value}`;
    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      content += (content.endsWith("\n") || content === "" ? "" : "\n") + line + "\n";
    }
  }

  writeFileSync(envPath, content);
  log("info", "Updated .env with X tokens");
}

export async function runXAuth(): Promise<void> {
  const env = loadEnvConfig();

  if (!env.xClientId || !env.xClientSecret) {
    throw new Error(
      "Set X_CLIENT_ID and X_CLIENT_SECRET in .env before running auth:x"
    );
  }

  const client = new TwitterApi({
    clientId: env.xClientId,
    clientSecret: env.xClientSecret,
  });

  const authLink = client.generateOAuth2AuthLink(CALLBACK_URL, {
    scope: SCOPES,
  });

  const { url, codeVerifier, state } = authLink;

  console.log("\nOpen this URL in your browser to authorize CogniPost:\n");
  console.log(url);
  console.log("\nWaiting for callback...\n");

  await new Promise<void>((resolvePromise, reject) => {
    const server = createServer(async (req, res) => {
      try {
        if (!req.url?.startsWith("/callback")) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const reqUrl = new URL(req.url, CALLBACK_URL);
        const returnedState = reqUrl.searchParams.get("state");
        const code = reqUrl.searchParams.get("code");

        if (!code || returnedState !== state) {
          res.writeHead(400);
          res.end("Invalid OAuth callback");
          reject(new Error("Invalid OAuth callback"));
          server.close();
          return;
        }

        const { client: loggedClient, accessToken, refreshToken } =
          await client.loginWithOAuth2({
            code,
            codeVerifier,
            redirectUri: CALLBACK_URL,
          });

        const me = await loggedClient.v2.me();

        updateEnvFile({
          X_ACCESS_TOKEN: accessToken,
          ...(refreshToken ? { X_REFRESH_TOKEN: refreshToken } : {}),
        });

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          `<html><body><h1>Success!</h1><p>Authorized as @${me.data.username}. You can close this window.</p></body></html>`
        );

        log("info", "X OAuth2 complete", { username: me.data.username });
        server.close();
        resolvePromise();
      } catch (err) {
        res.writeHead(500);
        res.end("Authorization failed");
        reject(err);
        server.close();
      }
    });

    server.listen(CALLBACK_PORT, () => {
      log("info", "OAuth callback server listening", { port: CALLBACK_PORT });
    });
  });
}
