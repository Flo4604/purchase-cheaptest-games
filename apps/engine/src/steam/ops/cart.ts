import { writeFileSync } from "node:fs";
import moment from "moment";
import type { SteamSession } from "../session.js";

export const addGamesToCart = async (
	session: SteamSession,
	apps: { subId: number }[],
): Promise<boolean> => {
	const bar = session.progress.startBar("Adding games to cart", apps.length, 1);

	const payload = {
		user_country: session.countryCode,
		items: apps.map((app) => ({ packageid: app.subId })),
		navdata: {
			domain: "store.steampowered.com",
			controller: "default",
			method: "default",
			submethod: "",
			feature: "spotlight",
			depth: 1,
			countrycode: session.countryCode,
			webkey: 0,
			is_client: false,
			curator_data: {
				clanid: null,
				listid: null,
			},
			is_likely_bot: false,
			is_utm: false,
		},
	};

	const response = await session.postRequest(
		`https://api.steampowered.com/IAccountCartService/AddItemsToCart/v1/?access_token=${session.accessToken}`,
		`input_json=${JSON.stringify(payload)}`,
		{
			"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
		},
	);

	bar.update(apps.length);

	const responseJson = session.responseToJSON(response as string) as {
		response: { line_item_ids: unknown[] };
	};

	if (responseJson.response.line_item_ids.length === 0) {
		session.progress.error("No line item ids found");
		throw new Error("addGamesToCart() No line item ids found");
	}

	return true;
};

export const forgetCart = async (session: SteamSession): Promise<void> => {
	await session.postRequest(
		`https://api.steampowered.com/IAccountCartService/DeleteCart/v1/?access_token=${session.accessToken}`,
		undefined,
	);

	session.progress.info("Successfully deleted cart");
};

export const finalizeTransaction = async (
	session: SteamSession,
	transactionId: string,
): Promise<boolean> => {
	const data = {
		transid: transactionId,
		CardCVV2: "",
		browserInfo: {
			language: "de-DE",
			javaEnabled: false,
			colorDepth: 24,
			screenHeight: 1080,
			screenWidth: 1920,
		},
	};

	let response: any;

	for (let i = 0; i < 3; i += 1) {
		response = await session.postRequest(
			"https://checkout.steampowered.com/checkout/finalizetransaction/",
			data,
			{
				Cookie: session.cookies.join("; "),
				Origin: "https://checkout.steampowered.com",
				Referer:
					"https://checkout.steampowered.com/checkout/?accountcart=1",
			},
		);

		response = session.responseToJSON(response as string);

		if (response !== false && response?.success === 22) break;
	}

	if (response.success !== 22) {
		session.progress.error(
			"finalizeTransaction() Error finalizing transaction",
			response,
		);
		return false;
	}

	session.progress.info(
		"finalizeTransaction() Successfully finalized transaction",
	);
	return true;
};

export const initializeTransaction = async (
	session: SteamSession,
	countryCode: string,
): Promise<string | undefined> => {
	const data = {
		gidShoppingCart: -1,
		gidReplayOfTransID: -1,
		bUseAccountCart: 1,
		PaymentMethod: "steamaccount",
		abortPendingTransactions: 0,
		bHasCardInfo: "0",
		CardNumber: "",
		CardExpirationYear: "",
		CardExpirationMonth: "",
		FirstName: "",
		LastName: "",
		Address: "",
		AddressTwo: "",
		Country: countryCode,
		City: "",
		State: "",
		PostalCode: "",
		Phone: "",
		ShippingFirstName: "",
		ShippingLastName: "",
		ShippingAddress: "",
		ShippingAddressTwo: "",
		ShippingCountry: countryCode,
		ShippingCity: "",
		ShippingState: "",
		ShippingPostalCode: "",
		ShippingPhone: "",
		bIsGift: 0,
		GifteeAccountID: 0,
		GifteeEmail: "",
		GifteeName: "",
		GiftMessage: "",
		Sentiment: "",
		Signature: "",
		ScheduledSendOnDate: 0,
		BankAccount: "",
		BankCode: "",
		BankIBAN: "",
		BankBIC: "",
		TPBankID: "",
		bSaveBillingAddress: "1",
		gidPaymentID: "",
		bUseRemainingSteamAccount: "1",
		bPreAuthOnly: "0",
		sessionid: session.sessionId,
	};

	let response: any;

	for (let i = 0; i < 3; i += 1) {
		response = await session.postRequest(
			"https://checkout.steampowered.com/checkout/inittransaction/",
			data,
			{
				Cookie: session.cookies.join("; "),
			},
		);

		response = session.responseToJSON(response as string);

		if (response !== false && response.success) break;
	}

	if (response.transid === undefined) {
		writeFileSync(
			"./debug/initializeTransactionError.json",
			JSON.stringify({ response, time: moment().valueOf() }),
		);
	}

	if (response.success !== 1) {
		session.progress.error(
			"initializeTransaction() Error initializing transaction",
			response,
		);
	}

	if (response?.appcausingerror) {
		session.progress.error(
			"initializeTransaction() Error initializing transaction",
			response.specificerrortext,
		);

		return;
	}

	session.progress.info(
		"initializeTransaction() Successfully initialized transaction",
	);
	return response.transid;
};

export const getFinalPrice = async (
	session: SteamSession,
	transactionId: string,
): Promise<boolean> => {
	let response: any;
	let success = false;

	for (let i = 0; i < 3; i += 1) {
		response = await session.getRequest(
			`https://checkout.steampowered.com/checkout/getfinalprice/?count=1&transid=${transactionId}&purchasetype=self&microtxnid=-1&cart=-1&gidReplayOfTransID=-1`,
			{
				Cookie: session.cookies
					.filter((cookie) => !cookie.includes("clientsessionid"))
					.join("; "),
				Referer:
					"https://checkout.steampowered.com/checkout/?accountcart=1",
			},
		);

		response = session.responseToJSON(response as string);

		if (!response.error) {
			success = true;
			break;
		} else {
			session.progress.error(
				"getFinalPrice() Error getting final price",
				response,
			);
		}
	}

	session.progress.log(
		`FinalPrice: ${response.formattedSteamAccountTotal} and ${response.formattedTotalLoyaltyPoints} Points`,
	);

	return success;
};

export const checkoutCart = async (
	session: SteamSession,
): Promise<boolean | void> => {
	const transactionId = await initializeTransaction(
		session,
		session.countryCode,
	);

	if (!transactionId) return false;

	await getFinalPrice(session, transactionId);

	await finalizeTransaction(session, transactionId);

	session.progress.log("checkoutCart() Successfully checked out");
};

export const setGamePreferences = async (
	session: SteamSession,
): Promise<boolean> => {
	let response: any = await session.postRequest(
		"https://store.steampowered.com/account/savecontentdescriptorpreferences",
		{ sessionid: session.sessionId },
	);

	try {
		response = JSON.parse(response);
	} catch (e) {
		session.progress.error(String(e));
	}

	if (response?.success !== 1) {
		session.progress.error("Could not set game preferences");
		return false;
	}

	session.progress.info("Game preferences set");
	return true;
};
