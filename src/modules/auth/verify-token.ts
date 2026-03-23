export function verifyBearerToken(authorizationHeader?: string) {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new Error("Missing bearer token");
  }

  const token = authorizationHeader.replace("Bearer ", "").trim();

  if (!token) {
    throw new Error("Empty bearer token");
  }

  return {
    sub: "demo-user",
    token
  };
}

