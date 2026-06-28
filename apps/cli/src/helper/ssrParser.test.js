import assert from "node:assert/strict";
import { test } from "node:test";
import {
	SSRParseError,
	SSR_BLOB_MISSING,
	SSR_MISSING_QUERY,
	parseSSRListing,
} from "./ssrParser.js";

// Build a Steam new-UI listing page well enough to exercise the parser.
// renderContext.queryData is a JSON-encoded *string* (Valve double-encodes it),
// and the page wraps it in JSON.parse("<js string literal>").
const buildSSRPage = (queries) => {
	const queryData = JSON.stringify({ queries });
	const renderContext = JSON.stringify({ queryData });
	const jsLit = JSON.stringify(renderContext); // quoted + backslash-escaped
	return `<html><head><script nonce="abc-123">window.SSR.loaderData = [];window.SSR.renderContext=JSON.parse(${jsLit});</script></head><body>...</body></html>`;
};

const anarchistQueries = () => [
	{
		queryKey: ["market", "description", 753, "730-Anarchist"],
		state: {
			data: {
				market_hash_name: "730-Anarchist",
				marketable: true,
				tradable: true,
				owner_actions: [
					{ link: "https://steamcommunity.com/my/gamecards/730/", name: "x" },
					{
						link: "javascript:GetGooValue( '%contextid%', '%assetid%', 730, 2, 0 )",
						name: "grind",
					},
				],
			},
		},
	},
	{
		queryKey: ["market", "pricehistory", 753, "730-Anarchist"],
		state: {
			data: {
				ecurrency: 3,
				prices: [
					{ time: 1368576000, price_median: 1.5183, purchases: 22 },
					{ time: 1368662400, price_median: 1.248, purchases: 373 },
				],
			},
		},
	},
	{
		queryKey: ["market", "orderbook", 753, "730-Anarchist"],
		state: {
			data: {
				amtMaxBuyOrder: 4,
				amtMinSellOrder: 7,
				eCurrency: 3,
				cBuyOrders: 120,
				cSellOrders: 88,
			},
		},
	},
];

test("parses description, pricehistory and orderbook from a new-UI page", () => {
	const html = buildSSRPage(anarchistQueries());
	const got = parseSSRListing(html);

	assert.equal(got.description.market_hash_name, "730-Anarchist");
	assert.equal(got.description.marketable, true);
	assert.equal(got.priceHistory.prices.length, 2);
	assert.equal(got.priceHistory.prices[1].price_median, 1.248);
	assert.equal(got.orderbook.amtMaxBuyOrder, 4); // cents
	assert.equal(got.orderbook.amtMinSellOrder, 7);
	assert.equal(got.orderbook.cBuyOrders, 120);
});

test("throws SSR_BLOB_MISSING when there is no SSR script", () => {
	assert.throws(
		() => parseSSRListing("<html><body>no ssr here</body></html>"),
		(err) => err instanceof SSRParseError && err.reason === SSR_BLOB_MISSING,
	);
});

test("throws SSR_MISSING_QUERY when orderbook query is absent", () => {
	const queries = anarchistQueries().filter(
		(q) => q.queryKey[1] !== "orderbook",
	);
	assert.throws(
		() => parseSSRListing(buildSSRPage(queries)),
		(err) => err instanceof SSRParseError && err.reason === SSR_MISSING_QUERY,
	);
});

test("handles whitespace around = and JSON.parse", () => {
	const queryData = JSON.stringify({ queries: anarchistQueries() });
	const renderContext = JSON.stringify({ queryData });
	const jsLit = JSON.stringify(renderContext);
	const html = `<script nonce="n">window.SSR.renderContext = JSON.parse( ${jsLit} );</script>`;
	const got = parseSSRListing(html);
	assert.equal(got.orderbook.amtMaxBuyOrder, 4);
});
