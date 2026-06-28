// Parser for Steam's new (React SSR) Community Market UI.
//
// The new /market/listings/<appid>/<hash> page no longer exposes the data we
// need as scrapeable HTML (the old `Market_LoadOrderSpread(<nameid>)` call is
// gone). Instead it ships a react-query cache inline:
//
//   <script nonce="...">
//     window.SSR.renderContext = JSON.parse("<json string literal>");
//   </script>
//
// where the decoded literal is a JSON document whose `queryData` field is
// ITSELF a JSON-encoded string (Valve double-encodes it). That inner string
// parses to `{ queries: [{ queryKey, state: { data } }, ...] }`.
//
// We route each query by queryKey[0]="market" + queryKey[1] in
// {description, pricehistory, orderbook} and return a typed-ish view.
//
// Ported from the steamsets backend market parser (apps/market/workflow/ssr_parser.go).

export class SSRParseError extends Error {
	constructor(reason, detail) {
		super(detail ? `${reason}: ${detail}` : reason);
		this.name = "SSRParseError";
		this.reason = reason; // one of the REASON_* constants below
	}
}

export const SSR_BLOB_MISSING = "ssr_blob_missing";
export const SSR_BLOB_UNREADABLE = "ssr_blob_unreadable";
export const SSR_MISSING_QUERY = "ssr_missing_query";

// findInlineScript returns the body of the first `<script nonce="...">...</script>`
// block — Valve always puts the SSR boot script first.
const findInlineScript = (html) => {
	const open = '<script nonce="';
	const idx = html.indexOf(open);
	if (idx < 0) return null;

	const rest = html.slice(idx + open.length);
	const end = rest.indexOf('">');
	if (end < 0) return null;

	const body = rest.slice(end + 2);
	const close = body.indexOf("</script>");
	if (close < 0) return null;

	return body.slice(0, close);
};

// extractRenderContext finds `window.SSR.renderContext = JSON.parse("...")` in
// the script body and returns the decoded JSON document (a string). Whitespace
// around `=` and `JSON.parse(` is tolerated — Valve has shipped both styles.
const extractRenderContext = (script) => {
	const prefix = "window.SSR.renderContext";
	const pi = script.indexOf(prefix);
	if (pi < 0) throw new SSRParseError(SSR_BLOB_MISSING);

	let i = skipSpace(script, pi + prefix.length);
	if (script[i] !== "=") throw new SSRParseError(SSR_BLOB_MISSING);

	i = skipSpace(script, i + 1);
	const jp = "JSON.parse(";
	if (script.slice(i, i + jp.length) !== jp) {
		throw new SSRParseError(SSR_BLOB_MISSING);
	}

	i = skipSpace(script, i + jp.length);
	if (script[i] !== '"') throw new SSRParseError(SSR_BLOB_MISSING);

	const end = scanJsStringLiteral(script, i);
	if (end < 0) {
		throw new SSRParseError(SSR_BLOB_UNREADABLE, "unterminated JS string");
	}

	// The JS string literal (incl. quotes) is valid JSON for a string; decoding
	// it yields the renderContext JSON document as a plain string.
	const jsLit = script.slice(i, end + 1);
	try {
		return JSON.parse(jsLit);
	} catch (e) {
		throw new SSRParseError(SSR_BLOB_UNREADABLE, e.message);
	}
};

// scanJsStringLiteral returns the index of the closing `"` of a JS string
// starting at `start` (which must point at the opening `"`), honoring `\` escapes.
const scanJsStringLiteral = (s, start) => {
	if (s[start] !== '"') return -1;
	for (let i = start + 1; i < s.length; i += 1) {
		const c = s[i];
		if (c === "\\") {
			i += 1; // skip escaped char
			continue;
		}
		if (c === '"') return i;
	}
	return -1;
};

const skipSpace = (s, from) => {
	let i = from;
	while (i < s.length) {
		const c = s[i];
		if (c === " " || c === "\t" || c === "\n" || c === "\r") {
			i += 1;
			continue;
		}
		break;
	}
	return i;
};

/**
 * Parse a Steam new-UI market listing page.
 *
 * @param {string} html raw HTML of /market/listings/<appid>/<hash>
 * @returns {{
 *   description: { market_hash_name: string, marketable: boolean, tradable: boolean, owner_actions?: {name:string,link:string}[] } | null,
 *   priceHistory: { ecurrency: number, prices: {time:number, price_median:number, purchases:number}[] } | null,
 *   orderbook: { amtMaxBuyOrder: number|null, amtMinSellOrder: number|null, eCurrency: number, cBuyOrders: number, cSellOrders: number } | null,
 * }}
 * @throws {SSRParseError} when the blob is missing/unreadable or required queries are absent
 */
export const parseSSRListing = (html) => {
	const scriptBody = findInlineScript(html);
	if (scriptBody === null) throw new SSRParseError(SSR_BLOB_MISSING);

	const rcJSON = extractRenderContext(scriptBody);

	let rc;
	try {
		rc = JSON.parse(rcJSON);
	} catch (e) {
		throw new SSRParseError(SSR_BLOB_UNREADABLE, `renderContext: ${e.message}`);
	}
	if (!rc || typeof rc.queryData !== "string" || rc.queryData === "") {
		throw new SSRParseError(SSR_BLOB_UNREADABLE, "queryData missing");
	}

	let qd;
	try {
		qd = JSON.parse(rc.queryData);
	} catch (e) {
		throw new SSRParseError(
			SSR_BLOB_UNREADABLE,
			`queryData inner: ${e.message}`,
		);
	}

	const out = { description: null, priceHistory: null, orderbook: null };

	for (const q of qd?.queries ?? []) {
		const keyArr = q?.queryKey;
		if (!Array.isArray(keyArr) || keyArr.length === 0) continue;
		if (keyArr[0] !== "market") continue;

		const data = q?.state?.data;
		if (data === undefined || data === null) continue;

		switch (keyArr[1]) {
			case "description":
				out.description = data;
				break;
			case "pricehistory":
				out.priceHistory = data;
				break;
			case "orderbook":
				out.orderbook = data;
				break;
			default:
				break;
		}
	}

	if (!out.description)
		throw new SSRParseError(SSR_MISSING_QUERY, "market.description");
	if (!out.priceHistory)
		throw new SSRParseError(SSR_MISSING_QUERY, "market.pricehistory");
	if (!out.orderbook)
		throw new SSRParseError(SSR_MISSING_QUERY, "market.orderbook");

	return out;
};
