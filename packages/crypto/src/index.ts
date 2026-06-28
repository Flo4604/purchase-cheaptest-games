// Zero-knowledge envelope encryption for Steam refresh tokens (WEBAPP_PLAN §3).
//
//   password ──Argon2id(saltAuth)──▶ auth hash   (stored; login)
//   password ──Argon2id(saltKek)───▶ KEK         (memory only; never stored)
//   random DEK ──AES-256-GCM──▶ encrypted token
//   KEK        ──AES-256-GCM──▶ wrapped DEK
export * from "./types.js";
export { createPasswordRecord, deriveKek, verifyPassword } from "./password.js";
export { openToken, sealToken } from "./token.js";
