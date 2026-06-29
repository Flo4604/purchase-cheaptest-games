// Envelope encryption for Steam refresh tokens:
//   random DEK ──AES-256-GCM──▶ encrypted token
//   master key ──AES-256-GCM──▶ wrapped DEK
// The master key is server-managed (an env secret); sealing/opening take it as
// an argument so this package stays pure.
export * from "./types.js";
export { openToken, sealToken } from "./token.js";
