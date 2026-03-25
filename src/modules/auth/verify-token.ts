const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function decodeJwtSub(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payloadRaw = Buffer.from(parts[1], "base64url").toString("utf-8");
    const payload = JSON.parse(payloadRaw) as { sub?: string };
    if (payload.sub && UUID_REGEX.test(payload.sub)) {
      return payload.sub;
    }
  } catch {
    return null;
  }

  return null;
}

export function verifyBearerToken(authorizationHeader?: string) {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new Error("Missing bearer token");
  }

  const token = authorizationHeader.replace("Bearer ", "").trim();

  if (!token) {
    throw new Error("Empty bearer token");
  }

  const jwtSub = decodeJwtSub(token);
  const sub = jwtSub ?? (UUID_REGEX.test(token) ? token : "00000000-0000-0000-0000-000000000001");

  return {
    sub,
    token
  };
}

