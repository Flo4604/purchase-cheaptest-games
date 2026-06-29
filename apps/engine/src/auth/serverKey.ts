// Server master key that wraps per-account DEKs (@psg/crypto). Set ENCRYPTION_KEY
// to base64-encoded 32 bytes in production. In dev we fall back to a fixed
// (INSECURE) key so `pnpm dev` needs no setup — loudly warned.
const fromEnv = process.env.ENCRYPTION_KEY;

const loadKey = (): Buffer => {
	if (fromEnv) {
		const key = Buffer.from(fromEnv, "base64");
		if (key.length !== 32) {
			throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded");
		}
		return key;
	}
	console.warn(
		"[engine] ENCRYPTION_KEY not set — using an INSECURE dev key. Set it in production.",
	);
	return Buffer.alloc(32, 7);
};

export const MASTER_KEY = loadKey();
