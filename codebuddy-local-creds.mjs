import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

function compactText(value) {
  return String(value || "").trim();
}

export function resolveCodeBuddyLocalCredentialPaths(options = {}) {
  const home = compactText(options.homeDir) || homedir();
  const configured = compactText(
    options.credsPath ||
    process.env.CURSOR_DIRECT_CODEBUDDY_CREDS_PATH ||
    process.env.CODEBUDDY_CREDS_PATH ||
    "",
  );
  const candidates = [
    configured,
    path.join(home, ".codebuddy", ".codebuddy_creds"),
    path.join(home, ".codebuddy", "codebuddy_creds.json"),
    path.join(home, ".codebuddy", "creds.json"),
  ].filter(Boolean);
  return [...new Set(candidates)];
}

export function readCodeBuddyLocalCredential(options = {}) {
  const checked = [];
  for (const filePath of resolveCodeBuddyLocalCredentialPaths(options)) {
    checked.push(filePath);
    if (!existsSync(filePath)) continue;
    try {
      const raw = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return { ok: false, path: filePath, checked, error: "credential file is not a JSON object" };
      }
      const bearerToken = compactText(
        parsed.bearer_token || parsed.bearerToken || parsed.access_token || parsed.accessToken || "",
      );
      if (!bearerToken) {
        return { ok: false, path: filePath, checked, error: "credential file has no bearer_token" };
      }
      return { ok: true, path: filePath, checked, credential: parsed };
    } catch (error) {
      return {
        ok: false,
        path: filePath,
        checked,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return {
    ok: false,
    checked,
    error: "no local CodeBuddy credential file found (expected ~/.codebuddy/.codebuddy_creds)",
  };
}

export function resolveCodeBuddyLocalCredentialWritePath(options = {}) {
  const paths = resolveCodeBuddyLocalCredentialPaths(options);
  if (paths.length > 0) return paths[0];
  return path.join(options.homeDir || homedir(), ".codebuddy", ".codebuddy_creds");
}

export function removeCodeBuddyLocalCredentialIfMatches(account = {}, options = {}) {
  const readResult = readCodeBuddyLocalCredential(options);
  if (!readResult.ok) return { ok: false, removed: false, reason: readResult.error || "not found" };
  const localToken = compactText(
    readResult.credential?.bearer_token ||
    readResult.credential?.bearerToken ||
    readResult.credential?.access_token ||
    readResult.credential?.accessToken ||
    "",
  );
  const accountToken = compactText(account.bearerToken || account.access_token || account.accessToken || "");
  const localUserId = compactText(readResult.credential?.user_id || readResult.credential?.userId || "");
  const accountUserId = compactText(account.authStatus?.userId || account.userId || account.user_id || "");
  const tokenMatches = Boolean(localToken && accountToken && localToken === accountToken);
  const userMatches = Boolean(localUserId && accountUserId && localUserId === accountUserId);
  if (!tokenMatches && !userMatches) {
    return { ok: true, removed: false, path: readResult.path, reason: "credential does not match deleted account" };
  }
  try {
    writeFileSync(readResult.path, "", { mode: 0o600 });
    return { ok: true, removed: true, path: readResult.path };
  } catch (error) {
    return {
      ok: false,
      removed: false,
      path: readResult.path,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function writeCodeBuddyLocalCredential(credential = {}, options = {}) {
  const bearerToken = compactText(
    credential.bearer_token || credential.bearerToken || credential.access_token || credential.accessToken || "",
  );
  if (!bearerToken) {
    return { ok: false, error: "credential has no bearer_token" };
  }
  const filePath = resolveCodeBuddyLocalCredentialWritePath(options);
  mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = {
    bearer_token: bearerToken,
    user_id: compactText(credential.user_id || credential.userId || "unknown"),
    created_at: Number(credential.created_at || credential.createdAt || Math.floor(Date.now() / 1000)),
    expires_in: Number(credential.expires_in || credential.expiresIn || 0),
    ...(credential.user_info && typeof credential.user_info === "object" ? { user_info: credential.user_info } : {}),
    ...(credential.refresh_token || credential.refreshToken
      ? { refresh_token: compactText(credential.refresh_token || credential.refreshToken) }
      : {}),
  };
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { ok: true, path: filePath, credential: payload };
}
