import { env } from "./env.js";
const isProd = env.NODE_ENV === "production";

const TOKEN_COOKIE = "token";

const base = {
  httpOnly: true,
  secure: isProd,
  sameSite: env.COOKIE_SAMESITE, // "lax" (same site) | "none" (cross-site, needs HTTPS)
  domain: env.COOKIE_DOMAIN || undefined,
};
const tokenCookieOptions = {
  ...base,
  path: "/",
  maxAge: 24 * 60 * 60 * 1000,
};

const clearTokenCookieOptions = { ...base, path: "/" };

export { TOKEN_COOKIE, tokenCookieOptions, clearTokenCookieOptions };
