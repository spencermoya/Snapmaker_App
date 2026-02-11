import crypto from "crypto";

function md5(data: string): string {
  return crypto.createHash("md5").update(data).digest("hex");
}

function parseDigestChallenge(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  const parts = header.replace(/^Digest\s+/i, "");
  const regex = /(\w+)=(?:"([^"]+)"|([^\s,]+))/g;
  let match;
  while ((match = regex.exec(parts)) !== null) {
    result[match[1]] = match[2] || match[3];
  }
  return result;
}

export function buildDigestAuthHeader(
  challenge: Record<string, string>,
  username: string,
  password: string,
  method: string,
  uri: string,
  nc: number = 1,
): string {
  const realm = challenge.realm || "";
  const nonce = challenge.nonce || "";
  const qop = challenge.qop || "";
  const cnonce = crypto.randomBytes(8).toString("hex");
  const ncStr = nc.toString(16).padStart(8, "0");

  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);

  let response: string;
  if (qop === "auth" || qop.includes("auth")) {
    response = md5(`${ha1}:${nonce}:${ncStr}:${cnonce}:auth:${ha2}`);
  } else {
    response = md5(`${ha1}:${nonce}:${ha2}`);
  }

  let header = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;

  if (qop) {
    header += `, qop=auth, nc=${ncStr}, cnonce="${cnonce}"`;
  }
  if (challenge.opaque) {
    header += `, opaque="${challenge.opaque}"`;
  }

  return header;
}

const authCache: Map<string, { method: "basic" | "digest"; challenge?: Record<string, string>; timestamp: number }> = new Map();
const AUTH_CACHE_TTL = 5 * 60 * 1000;

function getCachedAuth(host: string) {
  const cached = authCache.get(host);
  if (cached && (Date.now() - cached.timestamp) < AUTH_CACHE_TTL) {
    return cached;
  }
  authCache.delete(host);
  return null;
}

function cacheAuth(host: string, method: "basic" | "digest", challenge?: Record<string, string>) {
  authCache.set(host, { method, challenge, timestamp: Date.now() });
}

export async function fetchWithDigestAuth(
  url: string,
  username: string,
  password: string,
  options: {
    method?: string;
    timeout?: number;
    headers?: Record<string, string>;
  } = {},
): Promise<Response> {
  const method = options.method || "GET";
  const timeout = options.timeout || 10000;
  const extraHeaders = options.headers || {};

  const firstResponse = await fetch(url, {
    method,
    headers: extraHeaders,
    signal: AbortSignal.timeout(timeout),
  });

  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  const wwwAuth = firstResponse.headers.get("www-authenticate") || "";
  if (!wwwAuth.toLowerCase().startsWith("digest")) {
    return firstResponse;
  }

  const challenge = parseDigestChallenge(wwwAuth);
  const parsedUrl = new URL(url);
  const uri = parsedUrl.pathname + parsedUrl.search;

  const authHeader = buildDigestAuthHeader(challenge, username, password, method, uri);

  const authedResponse = await fetch(url, {
    method,
    headers: {
      ...extraHeaders,
      Authorization: authHeader,
    },
    signal: AbortSignal.timeout(timeout),
  });

  return authedResponse;
}

export async function fetchWithAuth(
  url: string,
  username: string | null,
  password: string | null,
  options: {
    method?: string;
    timeout?: number;
    headers?: Record<string, string>;
  } = {},
): Promise<Response> {
  const method = options.method || "GET";
  const timeout = options.timeout || 10000;
  const extraHeaders = options.headers || {};

  if (!username || !password) {
    return fetch(url, {
      method,
      headers: extraHeaders,
      signal: AbortSignal.timeout(timeout),
    });
  }

  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const uri = parsedUrl.pathname + parsedUrl.search;

  const cached = getCachedAuth(host);

  if (cached?.method === "digest" && cached.challenge) {
    const authHeader = buildDigestAuthHeader(cached.challenge, username, password, method, uri);
    const response = await fetch(url, {
      method,
      headers: { ...extraHeaders, Authorization: authHeader },
      signal: AbortSignal.timeout(timeout),
    });

    if (response.status !== 401) {
      return response;
    }

    const wwwAuth = response.headers.get("www-authenticate") || "";
    if (wwwAuth.toLowerCase().startsWith("digest")) {
      const newChallenge = parseDigestChallenge(wwwAuth);
      cacheAuth(host, "digest", newChallenge);
      const newAuthHeader = buildDigestAuthHeader(newChallenge, username, password, method, uri);
      return fetch(url, {
        method,
        headers: { ...extraHeaders, Authorization: newAuthHeader },
        signal: AbortSignal.timeout(timeout),
      });
    }
    authCache.delete(host);
  }

  if (cached?.method === "basic") {
    const basicAuth = Buffer.from(`${username}:${password}`).toString("base64");
    return fetch(url, {
      method,
      headers: { ...extraHeaders, Authorization: `Basic ${basicAuth}` },
      signal: AbortSignal.timeout(timeout),
    });
  }

  const noAuthResponse = await fetch(url, {
    method,
    headers: extraHeaders,
    signal: AbortSignal.timeout(timeout),
  });

  if (noAuthResponse.status !== 401) {
    return noAuthResponse;
  }

  const wwwAuth = noAuthResponse.headers.get("www-authenticate") || "";

  if (wwwAuth.toLowerCase().startsWith("digest")) {
    console.log(`[Auth] Camera at ${host} requires Digest auth, caching for future requests`);
    const challenge = parseDigestChallenge(wwwAuth);
    cacheAuth(host, "digest", challenge);
    const authHeader = buildDigestAuthHeader(challenge, username, password, method, uri);
    return fetch(url, {
      method,
      headers: { ...extraHeaders, Authorization: authHeader },
      signal: AbortSignal.timeout(timeout),
    });
  }

  console.log(`[Auth] Camera at ${host} trying Basic auth, caching for future requests`);
  cacheAuth(host, "basic");
  const basicAuth = Buffer.from(`${username}:${password}`).toString("base64");
  return fetch(url, {
    method,
    headers: { ...extraHeaders, Authorization: `Basic ${basicAuth}` },
    signal: AbortSignal.timeout(timeout),
  });
}
