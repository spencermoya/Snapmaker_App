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

  const basicAuth = Buffer.from(`${username}:${password}`).toString("base64");
  const basicResponse = await fetch(url, {
    method,
    headers: {
      ...extraHeaders,
      Authorization: `Basic ${basicAuth}`,
    },
    signal: AbortSignal.timeout(timeout),
  });

  if (basicResponse.status === 401) {
    const wwwAuth = basicResponse.headers.get("www-authenticate") || "";
    if (wwwAuth.toLowerCase().startsWith("digest")) {
      console.log("[Camera] Basic auth rejected, trying Digest auth...");
      const challenge = parseDigestChallenge(wwwAuth);
      const parsedUrl = new URL(url);
      const uri = parsedUrl.pathname + parsedUrl.search;
      const authHeader = buildDigestAuthHeader(challenge, username, password, method, uri);

      return fetch(url, {
        method,
        headers: {
          ...extraHeaders,
          Authorization: authHeader,
        },
        signal: AbortSignal.timeout(timeout),
      });
    }
  }

  return basicResponse;
}
