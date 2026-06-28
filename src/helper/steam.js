/* eslint-disable max-len */
/* eslint-disable no-nested-ternary */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-async-promise-executor */
/* eslint-disable no-param-reassign */
import inquirer from "inquirer";
import Steamcommunity from "steamcommunity";
import SteamStore from "steamstore";
import * as cheerio from "cheerio";
import qs from "qs";
import { writeFileSync } from "fs";
import cliProgress from "cli-progress";
import moment from "moment";
import TradeOfferManager from "steam-tradeoffer-manager";
import SteamUser from "steam-user";
import { EAuthTokenPlatformType, LoginSession } from "steam-session";

import axios from "axios";
import terminalImage from "terminal-image";
import SteamID from "steamid";
import { getAccounts, storeAccount, updateTokens } from "../db/account";
import { addApp, getApp, getLimitedGames, updateGame } from "../db/games";
import { isKeyActivated, storeActivatedKey } from "../db/activatedKeys";
import logger from "./logger";
import { parseSSRListing } from "./ssrParser";
import {
    asyncFilter,
    getPriceWithoutFees,
    roundPrice,
    sleep,
    toCents,
} from "./util";
import { CURRENCY_CODES, EXTRA_OPTIONS, MAX_PRICES } from "./constants";
import { showGamesToBuy } from "./config";

const steamCommunity = new Steamcommunity();
const steamStore = new SteamStore();
const client = new SteamUser();

const manager = new TradeOfferManager({
    steam: client, // Polling every 30 seconds is fine since we get notifications from Steam
    domain: "example.com", // Our domain is example.com
    language: "en", // We want English item descriptions
});

let countryCode = "";

// [HTTP REQUESTS]

const getApiCall = (URL, params) =>
    axios
        .get(URL, params)
        .then((response) => response.data)
        .catch((err) => console.log(err));

const postRequest = async (url, data, headers = {}, debug = false) =>
    new Promise(async (resolve) => {
        steamCommunity.httpRequestPost(
            url,
            {
                form: data,
                headers,
            },
            (err, response, body) => {
                if (err) {
                    if (err.message !== "HTTP error 429") {
                        logger.warn(err.message, body);
                    }
                    resolve(false);
                }

                if (debug) {
                    console.log({ response });
                }

                resolve(body);
            },
        );
    });

const getRequest = async (url, headers = {}, debug = false) =>
    new Promise(async (resolve) => {
        steamCommunity.httpRequestGet(url, headers, (err, response, body) => {
            if (err) {
                if (err.message !== "HTTP error 429") {
                    logger.warn(err.message, body);
                }
                resolve(false);
            }

            if (debug) {
                console.log({ response });
            }

            resolve(body);
        });
    });

const responseToJSON = (response) => {
    try {
        return JSON.parse(response);
    } catch (e) {
        logger.error(e, { response });
        return false;
    }
};

const balanceToAmount = (string) => {
    string = string.replace("€", "EUR");
    string = string.replace("--", "00");

    const [currency] = string.match(/([A-Z]{1,})/);
    const [amount] = string.match(/(\d+(?:.(\d+)){1,})/) || [];

    // 2,--EUR deal with that

    if (!amount) {
        logger.error("Unable to parse amount from string:", string);
        return false;
    }

    // write a function that can detect the currency and convert it to a number
    const parsedAmount =
        parseFloat(amount.replace(/,/g, "").replace(/\./, "")) / 100;

    return {
        currency,
        amount: parsedAmount,
    };
};

let globalCookies = [];

// [ Login stuff ]
const setCookies = (cookies) => {
    steamStore.setCookies(cookies);

    cookies.push(
        "wants_mature_content=1",
        "lastagecheckage=1-January-2000",
        "birthtime=946681201",
    );
    steamCommunity.setCookies(cookies);

    manager.setCookies(cookies, (err) => {
        if (err) {
            console.log(err);
            process.exit(1); // Fatal error since we couldn't get our API key
        }
        //  redact the API key we got with some asterisks
        logger.log(`Got API Key ${manager?.apiKey?.replace(/\w/gi, "*")}`);
    });
};

const chooseAccount = async () => {
    const accounts = await getAccounts();

    accounts.push(
        {
            username: "Add an account",
            id: -1,
        },
        {
            username: "Separator",
            id: 0,
        },
    );

    // arrange it so there is a space between the accounts and the add account option
    const answers = await inquirer.prompt([
        {
            type: "list",
            message: "Choose an account",
            name: "account",
            choices: accounts
                .map((account) => ({
                    name: account.username,
                    value: account.id,
                    checked: account.id === -1 && accounts.length === 0,
                    type: account.id === 0 ? "separator" : "list",
                }))
                .sort((a, b) =>
                    a.value === b.value ? 0 : a.value <= b.value ? -1 : 1,
                ),
        },
    ]);

    return answers.account;
};

// Runs the QR login flow and resolves with the freshly issued tokens.
const startQrLogin = async () =>
    new Promise(async (resolve, reject) => {
        const session = new LoginSession(EAuthTokenPlatformType.SteamClient);
        session.loginTimeout = 120000; // timeout after 2 minutes
        const startResult = await session.startWithQR();

        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
            startResult.qrChallengeUrl,
        )}&bgcolor=687cd6&color=1d1d1d`;

        // fetch the qr code
        const qrCode = await getApiCall(qrUrl, { responseType: "arraybuffer" });

        // create the qr code attachment
        // eslint-disable-next-line no-console
        logger.log(
            await terminalImage.buffer(qrCode, {
                width: 75,
                height: 25,
                preserveAspectRatio: true,
            }),
        );

        session.on("remoteInteraction", () => {
            logger.warn(
                "Looks like you've scanned the code! Now just approve the login.",
            );
        });

        session.on("authenticated", () => {
            logger.log("\nAuthenticated successfully!");
            resolve({
                accountName: session.accountName,
                accessToken: session.accessToken,
                refreshToken: session.refreshToken,
            });
        });

        session.on("timeout", () => {
            reject(new Error("This login attempt has timed out."));
        });

        session.on("error", (err) => {
            // This should ordinarily not happen. This only happens in case there's some kind of unexpected error while
            // polling, e.g. the network connection goes down or Steam chokes on something.
            reject(
                new Error(`ERROR: This login attempt has failed! ${err.message}`),
            );
        });
    });

const addAccount = async () => {
    const { accountName, accessToken, refreshToken } = await startQrLogin();

    await storeAccount(accountName, accessToken, refreshToken);
};

// Re-runs the QR login for an existing account whose refresh token has expired,
// persists the new tokens, and returns the updated account.
const reauthenticate = async (account) => {
    logger.warn(
        `The saved login for "${account.username}" has expired. Please scan the QR code to log in again.`,
    );

    const { accessToken, refreshToken } = await startQrLogin();

    await updateTokens(account.id, accessToken, refreshToken);

    return { ...account, accessToken, refreshToken };
};

const doLogin = async (account) =>
    new Promise(async (resolve, reject) => {
        const onError = async (err) => {
            client.removeListener("webSession", onWebSession);

            // EResult 27 = Expired: the stored refresh token is no longer valid
            // and cannot be refreshed, so we need a fresh QR login.
            if (err.eresult === SteamUser.EResult.Expired) {
                try {
                    const updated = await reauthenticate(account);
                    resolve(await doLogin(updated));
                } catch (reauthErr) {
                    reject(reauthErr);
                }
                return;
            }

            reject(err);
        };

        async function onWebSession(sessionID, cookies) {
            client.removeListener("error", onError);
            setCookies(cookies);

            const session = new LoginSession(EAuthTokenPlatformType.WebBrowser);
            session.refreshToken = account.refreshToken;
            const webCookies = await session.getWebCookies();
            steamCommunity.setCookies(webCookies);

            cookies.push(
                ...webCookies
                    .filter((cookie) =>
                        cookie.includes("Domain=checkout.steampowered.com"),
                    )
                    .map((cookie) => cookie.split(";")[0]),
            );

            // remove the first index from array
            cookies = cookies.splice(0);

            globalCookies = cookies;

            const newSessionId = cookies
                .find((cookie) => cookie.includes("sessionid"))
                .split(";")[0]
                .split("=")[1];

            const accessToken = cookies
                .find((cookie) => cookie.includes("steamLoginSecure"))
                .split(";")[0]
                .split("=")[1]
                .split("%7C%7C")[1];

            resolve({
                sessionId: newSessionId,
                accessToken,
            });
        }

        client.once("error", onError);
        client.once("webSession", onWebSession);

        client.logOn({
            refreshToken: account.refreshToken,
        });
    });
// [ Actual Steam requests ]

const getWalletBalance = async () =>
    new Promise(async (resolve) => {
        steamStore.getWalletBalance((err, response) => {
            if (err) {
                logger.error(`Error getting wallet balance: ${err}`);
            }

            const { amount, currency } = balanceToAmount(
                response.formattedBalance,
            );

            // check if the user has a wallet
            const hasWallet = !!currency && !!amount;

            resolve({
                hasWallet,
                currency,
                balance: amount,
            });
        });
    });

async function getAppDetails(app, forceUrl = false) {
    const { appId, isBundle = false, includedApps = undefined, price } = app;

    const appInDb = await getApp(appId);

    if (
        appInDb &&
        Number(app.price) === appInDb.price &&
        appInDb.id === appId
    ) {
        console.log(
            `app already in db and price is the same so skipping ${appId}`,
        );
        appInDb.isInDb = true;
        return appInDb;
    }

    const url =
        forceUrl ||
        `https://store.steampowered.com/app/${appId}?snr=1_direct-navigation__`;

    const appPage = await getRequest(url);

    if (!appPage) {
        logger.error(`getAppDetails(): Failed to fetch page for ${appId}`);
        return false;
    }

    const $ = cheerio.load(appPage);

    if (!countryCode) {
        const config = $("#application_config").first();
        const configData = config.attr("data-config");
        countryCode = JSON.parse(configData).COUNTRY;
    }

    const gameElements = $(".game_area_purchase_game_wrapper").toArray();

    if (gameElements.length === 0) {
        logger.error(
            `getAppDetails(): Error getting price elements for ${appId}`,
        );
        return false;
    }

    const requiresOther = $(".game_area_dlc_bubble").toArray();
    if (requiresOther.length > 0) {
        logger.error(`getAppDetails(): Skipped due to requirements: ${appId}`);
        return false;
    }

    const gameElement = $(
        gameElements.find((el) => {
            const element = $(el);

            // find the data-price-final attribute
            const priceElement = element.find("[data-price-final]");

            return (
                priceElement.length > 0 &&
                priceElement.attr("data-price-final") === toCents(price)
            );
        }),
    );

    if (gameElement.length === 0) {
        logger.error(
            `getAppDetails(): Error getting price element for ${appId}, price: ${toCents(
                price,
            )}`,
        );
        writeFileSync(`./debug/${appId}.html`, appPage);
        return false;
    }

    // from this element get the subid and snr inputs
    const subId = gameElement.find("input[name=subid]").val();
    const snr = gameElement.find("input[name=snr]").val();
    const originatingSnr = gameElement
        .find("input[name=originating_snr]")
        .val();

    const limitedRegex =
        /Profile Features Limited|Steam is learning about this game/g;
    const cardRegex = /Steam Trading Cards/g;
    const isLimited = !!limitedRegex.exec(appPage);
    const hasTradingCards = !!cardRegex.exec(appPage);

    if (
        appInDb &&
        (appInDb.limited !== isLimited ||
            appInDb.hasTradingCards !== hasTradingCards)
    ) {
        return updateGame(appId, isLimited, hasTradingCards);
    }

    app.subId = subId;
    app.snr = snr;
    app.originatingSnr = originatingSnr;
    app.id = appId;
    app.limited = isLimited;
    app.hasTradingCards = hasTradingCards;
    app.isBundle = isBundle;
    app.includedApps = includedApps;

    if (!app.subId) {
        logger.log(`No subId found for app ${appId}`);
        writeFileSync(`./debug/nosubid_${appId}.html`, appPage);
        return [];
    }

    if (appInDb === null) await addApp(app);

    if (appId == "46480") {
        console.log(appId, app);
    }
    return app;
}

const fixMarketHashName = (marketHashName) => {
    const fixedMarketHashName = marketHashName.replace(/\//g, "-");
    return fixedMarketHashName;
};

const loadCheapestGames = async (
    config,
    start,
    count,
    ownedApps,
    realOwnedAppCount,
    wallet,
    limitedGames,
) => {
    const { maxPrice, usage, limit, priceOptionsFlag } = config;

    const appsToBuy = [];
    let loop = true;

    const bar = new cliProgress.SingleBar(
        {
            stopOnComplete: false,
            format: "Loading Games | {bar} | {percentage}% | {value}/{total} that fit the criteria | ETA: {eta}s | Time Elapsed: {duration}s | Total Price {totalPrice} | Average Price {averagePrice}",
        },
        cliProgress.Presets.shades_grey,
    );

    bar.start(config.limit == "0" ? wallet.balance : config.limit, 0, {
        totalPrice: 0,
        averagePrice: 0,
        duration: 0,
    });

    const startTime = moment().valueOf();

    while (loop) {
        await sleep(25);
        const data = {
            start,
            count,
            dynamic_data: "",
            sort_by: "Price_ASC",
            maxprice: MAX_PRICES[wallet.currency],
            category1: "998",
            hidef2p: "1",
            ndl: "1",
            snr: "1_7_7_230_7",
            infinite: "1",
            sessionid: global.sessionId,
        };

        // bitwise operator to check if the priceOptionsFlag is set
        // eslint-disable-next-line no-bitwise
        if (
            priceOptionsFlag & EXTRA_OPTIONS.BUYING.TRADING_CARDS ||
            // eslint-disable-next-line no-bitwise
            priceOptionsFlag & EXTRA_OPTIONS.BUYING.TRADING_CARDS_LIMITED
        ) {
            data.category2 = "29";
        }

        // create query string from object
        const url = `https://store.steampowered.com/search/results/?query&${qs.stringify(
            data,
        )}`;

        // eslint-disable-next-line no-await-in-loop
        const response = JSON.parse(await getRequest(url));

        const $ = cheerio.load(response.results_html);

        start += count;

        let foundApps = await Promise.all(
            $("a")
                .map(async (_, el) => {
                    const element = $(el);

                    // find data-price-final in child element
                    const price =
                        Number(
                            element
                                .find("[data-price-final]")
                                .attr("data-price-final")
                                .replace(",", ""),
                        ) / 100;
                    const name = element.find(".title").text();
                    const appUrl = element.attr("href");
                    const appId = element.attr("data-ds-appid");

                    // convert the element to html and write it to a file
                    if (!appId) {
                        writeFileSync(
                            `./debug/noappid_${new Date().getTime()}.html`,
                            element.html(),
                        );
                        return [];
                    }

                    if (
                        appUrl.startsWith("https://store.steampowered.com/sub/")
                    ) {
                        // the appId will be the subId
                        const subId = appUrl.split("/")[4];

                        appId.split(",").forEach(async (id) => {
                            await getAppDetails({ name, appId: id, price });
                        });

                        await getAppDetails(
                            {
                                name,
                                appId: subId,
                                price,
                                includedApps: appId
                                    .split(",")
                                    .forEach((id) => ({
                                        appId: id,
                                        bundleId: subId,
                                    })),
                            },
                            appUrl,
                        );

                        return {
                            name,
                            price,
                            url: appUrl,
                            appId: subId,
                            isSub: true,
                            appsInPackage: appId.split(","),
                        };
                    }

                    if (
                        !ownedApps.includes(appId) &&
                        !limitedGames.includes(appId)
                    ) {
                        await getAppDetails({ name, appId, price });
                    }

                    await sleep(75);

                    return {
                        name,
                        price,
                        url: appUrl,
                        appId,
                        isSub: false,
                    };
                })
                .get(),
        );

        // check for array for any 2d arrays and if so flatten it
        foundApps = foundApps.flat();

        // filter out empty arrays
        foundApps = foundApps.filter((app) => app);

        const resultCount = foundApps.length;

        // check if more than 50% of the games are over the limit
        if (
            maxPrice !== 0 &&
            (foundApps.filter((app) => app.price > maxPrice).length /
                foundApps.length) *
                100 >
                50
        ) {
            logger.warn(
                `Found ${resultCount} games, but more than 50% of them are over the limit of ${maxPrice} ${wallet.currency}`,
            );
            loop = false;
            return appsToBuy;
        }

        foundApps = await asyncFilter(foundApps, async (foundApp) => {
            const index = foundApps.indexOf(foundApp);

            const app = await getApp(foundApp.appId);

            if (!app) {
                logger.log(
                    `No app found for ${foundApp.appId} (${foundApp.name})`,
                );
                return false;
            }

            // check if the app is owned

            if (ownedApps.includes(app.id) || ownedApps.includes(app.subId)) {
                return false;
            }

            if ([42180, 42140].includes(Number(app.appId))) {
                return false;
            }

            // check if the app is limited and we do not have the TRADING_CARDS_LIMITED option set
            // eslint-disable-next-line no-bitwise
            if (
                app.limited &&
                !(priceOptionsFlag & EXTRA_OPTIONS.BUYING.TRADING_CARDS_LIMITED)
            ) {
                return false;
            }

            if (parseInt(maxPrice) !== 0 && foundApp.price > maxPrice) {
                return false;
            }

            if (appsToBuy.find((appToBuy) => appToBuy.appId === app.id)) {
                return false;
            }

            if (app.includedApps.length > 0) {
                const ignoreDueToIncludedApps = app.includedApps.forEach(
                    (element) => {
                        if (ownedApps.includes(element.id)) {
                            return false;
                        }

                        if (
                            appsToBuy.find(
                                (appToBuy) => appToBuy.appId === element.id,
                            )
                        ) {
                            return false;
                        }
                        return true;
                    },
                );

                if (!ignoreDueToIncludedApps) {
                    return false;
                }
            }

            // eslint-disable-next-line no-bitwise
            if (
                (priceOptionsFlag & EXTRA_OPTIONS.BUYING.TRADING_CARDS ||
                    // eslint-disable-next-line no-bitwise
                    priceOptionsFlag &
                        EXTRA_OPTIONS.BUYING.TRADING_CARDS_LIMITED) &&
                !app.hasTradingCards
            ) {
                return false;
            }

            foundApps[index] = { ...app, ...foundApp };

            return true;
        });

        for (let i = 0; i < foundApps.length; i += 1) {
            const app = foundApps[i];

            const currentPriceOfAllApps = appsToBuy.reduce(
                (acc, appToBuy) => acc + appToBuy.price,
                0,
            );

            if (
                ["max"].includes(usage) &&
                currentPriceOfAllApps + app.price > wallet.balance
            ) {
                logger.info(
                    `The current price of all apps (${roundPrice(
                        currentPriceOfAllApps,
                    )} ${wallet.currency}) plus the price of the next app (${app.price} ${
                        wallet.currency
                    }) is higher than the balance (${wallet.balance} ${wallet.currency})`,
                );
                loop = false;
                break;
            }

            if (
                ["balance"].includes(usage) &&
                currentPriceOfAllApps + app.price > limit
            ) {
                logger.info(
                    `The current price of all apps (${currentPriceOfAllApps} ${wallet.currency}) plus the price of the next app (${app.price} ${wallet.currency}) is higher than the limit (${limit} ${wallet.currency})`,
                );
                loop = false;
                break;
            }

            if (
                ["amount", "next", "preview"].includes(usage) &&
                appsToBuy.length > limit
            ) {
                logger.info(
                    `The current amount of apps (${appsToBuy.length}) is higher than the limit (${limit})`,
                );
                loop = false;
                if (appsToBuy.length + 1 < limit) appsToBuy.push(app);
                break;
            }

            if (!loop) break;

            appsToBuy.push(app);
        }

        const totalPrice = roundPrice(
            appsToBuy.reduce((acc, app) => acc + app.price, 0),
        );
        const averagePrice = roundPrice(totalPrice / appsToBuy.length || 0);

        // moment to relativetimestamp

        bar.update(config.limit == "0" ? totalPrice : appsToBuy.length, {
            totalPrice: `${totalPrice} ${wallet.currency}`,
            averagePrice: `${averagePrice} ${wallet.currency}`,
            duration: `${moment.duration(moment().valueOf() - startTime).humanize()}`,
        });

        if (!loop) break;
    }

    bar.stop();

    return appsToBuy;
};

const addGamesToCart = async (apps) => {
    const bar = new cliProgress.SingleBar(
        {
            stopOnComplete: true,
            format: "Adding games to cart | {bar} | {percentage}% | {value}/{total} Games | Time Elapsed: {duration}s | ETA: {eta}s",
        },
        cliProgress.Presets.shades_grey,
    );

    bar.start(apps.length, 1);

    const payload = {
        user_country: countryCode,
        items: apps.map((app) => ({ packageid: app.subId })),
        navdata: {
            domain: "store.steampowered.com",
            controller: "default",
            method: "default",
            submethod: "",
            feature: "spotlight",
            depth: 1,
            countrycode: countryCode,
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

    const response = await postRequest(
        `https://api.steampowered.com/IAccountCartService/AddItemsToCart/v1/?access_token=${global.accessToken}`,
        `input_json=${JSON.stringify(payload)}`,
        {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
    );

    bar.update(apps.length);

    const responseJson = responseToJSON(response);

    if (responseJson.response.line_item_ids.length === 0) {
        logger.error("No line item ids found");
        process.exit(1);
    }

    return true;
};

const forgetCart = async () => {
    const response = await postRequest(
        `https://api.steampowered.com/IAccountCartService/DeleteCart/v1/?access_token=${global.accessToken}`,
    );

    logger.success("Successfully deleted cart");
};

const finalizeTransaction = async (transactionId) => {
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

    let response;

    for (let i = 0; i < 3; i += 1) {
        response = await postRequest(
            "https://checkout.steampowered.com/checkout/finalizetransaction/",
            data,
            {
                Cookie: globalCookies.join("; "),
                Origin: "https://checkout.steampowered.com",
                Referer:
                    "https://checkout.steampowered.com/checkout/?accountcart=1",
            },
        );

        response = responseToJSON(response);

        if (response !== false && response?.success === 22) break;
    }

    if (response.success !== 22) {
        logger.error(
            "finalizeTransaction() Error finalizing transaction",
            response,
        );
        return false;
    }

    logger.success("finalizeTransaction() Successfully finalized transaction");
    return true;
};

const initializeTransaction = async (countryCode) => {
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
        sessionid: global.sessionId,
    };

    let response;

    for (let i = 0; i < 3; i += 1) {
        response = await postRequest(
            "https://checkout.steampowered.com/checkout/inittransaction/",
            data,
            {
                Cookie: globalCookies.join("; "),
            },
        );

        response = responseToJSON(response);

        if (response !== false && response.success) break;
    }

    if (response.transid === undefined) {
        writeFileSync(
            "./debug/initializeTransactionError.json",
            JSON.stringify({ response, time: moment().valueOf() }),
        );
    }

    if (response.success !== 1) {
        logger.error(
            "initializeTransaction() Error initializing transaction",
            response,
        );
    }

    if (response?.appcausingerror) {
        logger.error(
            "initializeTransaction() Error initializing transaction",
            response.specificerrortext,
        );

        return;
    }

    logger.success(
        "initializeTransaction() Successfully initialized transaction",
    );
    return response.transid;
};

const getFinalPrice = async (transactionId) => {
    let response;
    let success = false;

    for (let i = 0; i < 3; i += 1) {
        response = await getRequest(
            `https://checkout.steampowered.com/checkout/getfinalprice/?count=1&transid=${transactionId}&purchasetype=self&microtxnid=-1&cart=-1&gidReplayOfTransID=-1`,
            {
                Cookie: globalCookies
                    .filter((cookie) => !cookie.includes("clientsessionid"))
                    .join("; "),
                Referer:
                    "https://checkout.steampowered.com/checkout/?accountcart=1",
            },
        );

        response = responseToJSON(response);

        if (!response.error) {
            success = true;
            break;
        } else {
            logger.error("getFinalPrice() Error getting final price", response);
        }
    }

    logger.log(
        `FinalPrice: ${response.formattedSteamAccountTotal} and ${response.formattedTotalLoyaltyPoints} Points`,
    );

    return success;
};

const checkoutCart = async () => {
    const transactionId = await initializeTransaction(countryCode);

    if (!transactionId) return false;

    await getFinalPrice(transactionId);

    await finalizeTransaction(transactionId);

    logger.log("checkoutCart() Successfully checked out");
};

const setGamePreferences = async () => {
    let response = await postRequest(
        "https://store.steampowered.com/account/savecontentdescriptorpreferences",
        { sessionid: global.sessionId },
    );

    try {
        response = JSON.parse(response);
    } catch (e) {
        logger.error(e);
    }

    if (response?.success !== 1) {
        logger.error("Could not set game preferences");
        return false;
    }

    logger.success("Game preferences set");
    return true;
};

const getOwnedApps = async () =>
    new Promise((resolve, reject) => {
        steamStore.getAccountData(async (error, apps, packages) => {
            if (error) {
                logger.error(error);
                reject(error);
            }

            resolve(apps.concat(packages));
        });
    });

const getOwnedAppsCount = async () => {
    const response = await getRequest(
        "https://steamcommunity.com/my/badges/13",
    );

    const $ = cheerio.load(response);

    return Number(
        $(".badge_description")
            ?.text()
            ?.replace(/[^0-9]/g, "") ?? 9,
    );
};

const sellItem = async (appId, contextId, assetId, price, amount) => {
    const response = responseToJSON(
        await postRequest(
            "https://steamcommunity.com/market/sellitem/",
            {
                sessionid: global.sessionId,
                appid: appId,
                contextid: contextId,
                assetid: assetId,
                amount,
                price,
            },
            {
                Cookie: globalCookies.join("; "),
                Referer: `https://steamcommunity.com/profiles/${steamCommunity.steamID.getSteamID64()}/inventory/`,
            },
        ),
    );

    if (response?.success !== true) {
        // Check if error is due to too many pending confirmations
        if (response?.message?.includes("too many listings pending confirmation")) {
            return { error: "PENDING_CONFIRMATIONS", message: response.message };
        }

        logger.error(`Could not sell item ${response.message}`);
        return false;
    }

    return true;
};

const getItemPriceBackup = async (appId, marketHashName) => {
    const url = new URL("https://steamcommunity.com/market/multibuy");
    url.searchParams.append("appid", appId);
    url.searchParams.append("contextid", "2");
    url.searchParams.append("items[]", marketHashName);

    const response = await getRequest(url.href, {
        Referer: "https://steamcommunity.com/market/",
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Safari/537.36",
    });

    if (!response) return -1;

    const $ = cheerio.load(response);

    return balanceToAmount($(".market_dialog_input.market_multi_price").val())
        .amount;
};

const getItemPrice = async (appId, marketHashName, currency) => {
    const url = new URL("https://steamcommunity.com/market/priceoverview/");
    url.searchParams.append("currency", CURRENCY_CODES[currency]);
    url.searchParams.append("appid", appId);
    url.searchParams.append("market_hash_name", marketHashName);

    const response = responseToJSON(
        await getRequest(url.href, {
            Referer: "https://steamcommunity.com/market/",
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
        }).catch((e) => {
            console.error(e);
            return {};
        }),
    );

    if (
        typeof response?.success !== "undefined" &&
        typeof response?.lowest_price !== "undefined"
    ) {
        return balanceToAmount(response?.lowest_price).amount;
    }

    return getItemPriceBackup(appId, marketHashName);
};

// Steam's new (React SSR) market UI no longer exposes `item_nameid` in the
// listing page HTML, so the old getItemNameId + /market/itemordershistogram
// flow is dead. The orderbook (highest buy / lowest sell) is now embedded in
// the page's inline SSR react-query cache, so a single listing-page fetch gives
// us everything. See ssrParser.js.
//
// Returns prices in currency units (e.g. 1.40), matching the old
// getItemOrdersHistogram return value, or null when unavailable.
const getListingOrderbook = async (appId, marketHashName) => {
    const url = `https://steamcommunity.com/market/listings/${appId}/${encodeURIComponent(marketHashName)}`;

    const response = await getRequest(url, {
        Referer: "https://steamcommunity.com/market/",
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
    });

    if (!response) return null;

    let parsed;
    try {
        parsed = parseSSRListing(response);
    } catch (e) {
        logger.warn(
            `getListingOrderbook() failed to parse SSR for ${appId}/${marketHashName}: ${e.message}`,
        );
        return null;
    }

    const ob = parsed.orderbook;
    // amtMaxBuyOrder / amtMinSellOrder are integer cents in the SSR cache.
    return {
        highestBuyOrder:
            ob.amtMaxBuyOrder != null ? Number(ob.amtMaxBuyOrder) / 100 : null,
        lowestSellOrder:
            ob.amtMinSellOrder != null ? Number(ob.amtMinSellOrder) / 100 : null,
        buyOrderCount: ob.cBuyOrders ?? 0,
        sellOrderCount: ob.cSellOrders ?? 0,
    };
};

const getInventory = () =>
    new Promise((resolve, reject) => {
        steamCommunity.getUserInventoryContents(
            steamCommunity.steamID,
            753,
            6,
            true,
            (err, inventory, totalCount) => {
                if (err) {
                    reject(err);
                }

                resolve(inventory);
            },
        );
    });

const getMarketListings = async (settings) => {
    let loop = true;

    let start = 0;
    const maxCount = 100;

    const items = [];

    const bar = new cliProgress.SingleBar(
        {
            stopOnComplete: true,
            format: "Loading Market Listings | {bar} | {percentage}% | {value}/{total} Market Listings",
        },
        cliProgress.Presets.shades_grey,
    );

    let firstResponse = false;
    let totalListings = 0;

    while (loop) {
        const response = responseToJSON(
            await getRequest(
                `https://steamcommunity.com/market/mylistings/render/?query=&start=${start}&count=${maxCount}`,
            ),
        );

        if (response.success) {
            if (!firstResponse) {
                bar.start(response.total_count, 0);
                firstResponse = true;
                totalListings = response.total_count;
            }

            const $ = cheerio.load(response.results_html);

            const listings = $(".market_listing_row.market_recent_listing_row");

            listings.each((_, listing) => {
                try {
                    const listingId = $(listing)
                        .attr("id")
                        .replace("mylisting_", "");
                    const listingName = $(listing)
                        .find(".market_listing_game_name")
                        .text();
                    const listingPrice = balanceToAmount(
                        $(listing).find(".market_listing_price").text(),
                    ).amount;
                    const itemLink = $(listing)
                        .find(".market_listing_item_name_link")
                        .attr("href");

                    // URL format: https://steamcommunity.com/market/listings/{appid}/{item_name}
                    // Split: ["https:", "", "steamcommunity.com", "market", "listings", "{appid}", "{item_name}"]
                    const urlParts = itemLink.split("/");
                    const appId = urlParts[5];
                    const encodedItemName = urlParts[6];
                    const itemName = decodeURIComponent(encodedItemName);
                    const hashName = `${appId}|||${itemName}`;

                    if (typeof hashName === "undefined") {
                        logger.error(
                            "getMarketListing() Error getting market listings",
                            response,
                        );
                    } else {
                        items.push({
                            listingId,
                            listingName,
                            listingPrice,
                            hashName,
                        });
                    }

                    bar.update(items.length);
                } catch (e) {
                    logger.error(e);
                }

                // get the id before the - for example: https://steamcommunity.com/market/listings/753/1109360-Taeko%20Witch%20%28Foil%29
                // the id is 1109360 and remove the name
            });

            if (response.start + response.pagesize >= totalListings) {
                loop = false;
            } else {
                start += maxCount;
            }
        } else {
            logger.error(
                "getMarketListing() Error getting market listings",
                response,
            );
            loop = false;
        }

        await sleep(100);
    }

    bar.stop();

    return items;
};

const removeMarketListing = async (listingId) => {
    const response = responseToJSON(
        await postRequest(
            `https://steamcommunity.com/market/removelisting/${listingId}`,
            {
                sessionid: global.sessionId,
            },
            {
                Referer: "https://steamcommunity.com/market/",
                Origin: "https://steamcommunity.com",
                Cookie: globalCookies.join("; "),
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
            },
        ),
    );

    if (!response) {
        logger.error(
            `removeMarketListing() Error removing listing https://steamcommunity.com/market/removelisting/${listingId} :: ${global.sessionId}`,
        );
        return false;
    }

    return true;
};

const removeOverpricedItems = async (wallet, config) => {
    const listedItems = await getMarketListings();
    const removeAll = config.removeAll || false;

    const bar = new cliProgress.SingleBar(
        {
            stopOnComplete: true,
            format: `Removing Items | {bar} | {percentage}% | Checked {value}/{total} Market Listings | Removed {removedCount} Listings | Time Elapsed: {duration}s | ETA: {eta}s | Listed Items: {listedPrice} ${wallet.currency} | Removed Items: {removedPrice} ${wallet.currency}`,
        },
        cliProgress.Presets.shades_grey,
    );
    bar.start(listedItems.length, 0, {
        removedCount: 0,
        duration: 0,
        listedPrice: 0,
        removedPrice: 0,
    });

    const cache = {};
    let removedCount = 0;
    let listedPrice = 0;
    let removedPrice = 0;
    const startTime = moment().valueOf();

    for (let i = 0; i < listedItems.length; i += 1) {
        let price = 0;

        bar.update(i + 1, {
            removedCount,
            duration: `${moment.duration(moment().valueOf() - startTime).humanize()}`,
            removedPrice: removedPrice.toFixed(2),
            listedPrice: listedPrice.toFixed(2),
        });

        if (typeof cache[listedItems[i].hashName] === "undefined") {
            // hashName format is "{appid}|||{item_name}"
            const [appId, itemName] = listedItems[i].hashName.split("|||");

            price = await getItemPrice(appId, itemName, wallet.currency);
            await sleep(300);

            if (price === -1) {
                // eslint-disable-next-line no-continue
                continue;
            }
            cache[listedItems[i].hashName] = price;
        } else {
            price = cache[listedItems[i].hashName];
        }

        if (listedItems[i].listingPrice > price || removeAll || price > 5) {
            removedCount += 1;
            await removeMarketListing(listedItems[i].listingId);
            removedPrice += getPriceWithoutFees(listedItems[i].listingPrice);
        } else {
            listedPrice += getPriceWithoutFees(listedItems[i].listingPrice);
        }
    }

    bar.stop();
};

const buyGames = async (config, ownedApps, ownedAppsRealCount, wallet) => {
    const appList = await showGamesToBuy(
        await loadCheapestGames(
            config,
            0,
            100,
            ownedApps,
            ownedAppsRealCount,
            wallet,
            await getLimitedGames(),
        ),
        config,
        wallet,
    );

    if (config.usage !== "preview") {
        await forgetCart();

        await addGamesToCart(appList);

        await checkoutCart();

        await forgetCart();
    }
};

const sellItems = async (config, wallet) => {
    const inventoryContent = await getInventory();
    const { sellOptionsFlag } = config;

    let items = [];

    // Filter based on selected flags
    // eslint-disable-next-line no-bitwise
    if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.ALL_TRADING_CARDS) {
        const allCards = inventoryContent.filter(
            (item) => item.type.includes("Card") && item.marketable,
        );
        items.push(...allCards);
    // eslint-disable-next-line no-bitwise
    } else {
        // eslint-disable-next-line no-bitwise
        if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.NORMAL_TRADING_CARDS) {
            const normalCards = inventoryContent.filter(
                (item) => item.type.includes("Card") && !item.type.includes("Foil") && item.marketable,
            );
            items.push(...normalCards);
        }
        // eslint-disable-next-line no-bitwise
        if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.FOIL_TRADING_CARDS) {
            const foilCards = inventoryContent.filter(
                (item) => item.type.includes("Card") && item.type.includes("Foil") && item.marketable,
            );
            items.push(...foilCards);
        }
    }

    // eslint-disable-next-line no-bitwise
    if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.BACKGROUNDS) {
        const backgrounds = inventoryContent.filter(
            (item) => item.type.includes("Background") && !item.type.includes("Profile") && item.marketable,
        );
        items.push(...backgrounds);
    }

    // eslint-disable-next-line no-bitwise
    if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.EMOTICONS) {
        const emoticons = inventoryContent.filter(
            (item) => item.type.includes("Emoticon") && item.marketable,
        );
        items.push(...emoticons);
    }

    // eslint-disable-next-line no-bitwise
    if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.PROFILE_BACKGROUNDS) {
        const profileBgs = inventoryContent.filter(
            (item) => item.type.includes("Profile Background") && item.marketable,
        );
        items.push(...profileBgs);
    }

    // eslint-disable-next-line no-bitwise
    if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.MINI_PROFILE_BACKGROUNDS) {
        const miniBgs = inventoryContent.filter(
            (item) => item.type.includes("Mini Profile Background") && item.marketable,
        );
        items.push(...miniBgs);
    }

    // eslint-disable-next-line no-bitwise
    if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.STICKERS) {
        const stickers = inventoryContent.filter(
            (item) => item.type.includes("Sticker") && item.marketable,
        );
        items.push(...stickers);
    }

    // eslint-disable-next-line no-bitwise
    if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.CHAT_EFFECTS) {
        const chatEffects = inventoryContent.filter(
            (item) => item.type.includes("Chat Effect") && item.marketable,
        );
        items.push(...chatEffects);
    }

    // eslint-disable-next-line no-bitwise
    if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.ANIMATED_AVATARS) {
        const animatedAvatars = inventoryContent.filter(
            (item) => item.type.includes("Animated Avatar") && item.marketable,
        );
        items.push(...animatedAvatars);
    }

    // eslint-disable-next-line no-bitwise
    if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.AVATAR_FRAMES) {
        const avatarFrames = inventoryContent.filter(
            (item) => item.type.includes("Avatar Frame") && item.marketable,
        );
        items.push(...avatarFrames);
    }

    logger.info(
        `Starting to sell ${items.length} items (Instant Sell: ${config.instantSell ? "Yes" : "No"})...`,
    );

    const startTime = moment().valueOf();
    let totalPrice = 0;
    const priceCache = {};
    const orderbookCache = {};
    let skippedCount = 0;
    let soldCount = 0;

    for (let i = 0; i < items.length; i += 1) {
        const item = items[i];

        let price = 0;

        if (typeof priceCache[item.market_hash_name] === "undefined") {
            price = await getItemPrice(
                item.appid,
                fixMarketHashName(item.market_hash_name),
                wallet.currency,
            );
            await sleep(75);

            if (price === -1) {
                skippedCount += 1;
                // eslint-disable-next-line no-continue
                continue;
            }

            priceCache[item.market_hash_name] = price;
        } else {
            price = priceCache[item.market_hash_name];
        }

        const {
            priceToRemove,
            priceCalculation,
            instantSell,
            instantSellThreshold,
        } = config;

        let calculatedPrice = 0;

        if (priceCalculation === "percentage") {
            calculatedPrice = price - price * (priceToRemove / 100);
        } else if (priceCalculation === "fixed") {
            calculatedPrice = price - priceToRemove;
        }

        let sellPrice = 0;

        // Instant sell mode: sell to highest buy order
        if (instantSell) {
            // Get the orderbook from the listing page's SSR cache (new market UI).
            let orderbook = orderbookCache[item.market_hash_name];
            if (!orderbook) {
                orderbook = await getListingOrderbook(
                    item.appid,
                    item.market_hash_name,
                );
                await sleep(100);

                if (!orderbook) {
                    logger.warn(
                        `[${i + 1}/${items.length}] Could not get orderbook for ${item.market_hash_name}, skipping`,
                    );
                    skippedCount += 1;
                    // eslint-disable-next-line no-continue
                    continue;
                }

                orderbookCache[item.market_hash_name] = orderbook;
            }

            // Get highest buy order (in currency units, e.g. 1.40)
            const highestBuyOrder = orderbook.highestBuyOrder;

            if (!highestBuyOrder || highestBuyOrder === 0) {
                logger.warn(
                    `[${i + 1}/${items.length}] No buy orders for ${item.market_hash_name}, using normal price`,
                );
                // Fall back to normal pricing
                sellPrice = String(
                    Math.round(
                        (
                            calculatedPrice -
                            calculatedPrice * 0.13043478261
                        ).toFixed(2) * 100,
                    ),
                ).replace(/\./, "");
            } else {
                // The highest buy order is what the buyer will pay (e.g., 1.40€)
                // We need to calculate what WE will receive after Steam's fees
                // getPriceWithoutFees reverses the calculation
                const weWillReceive = getPriceWithoutFees(highestBuyOrder);

                // Check if instant sell price is within threshold
                // Compare what we'll receive vs what we'd normally receive
                const normalReceive =
                    calculatedPrice - calculatedPrice * 0.13043478261;
                const percentageDiff =
                    ((normalReceive - weWillReceive) / normalReceive) * 100;

                if (percentageDiff > instantSellThreshold) {
                    logger.warn(
                        `[${i + 1}/${items.length}] ${item.market_hash_name}: Instant sell would receive ${weWillReceive.toFixed(2)} vs normal ${normalReceive.toFixed(2)} (${percentageDiff.toFixed(1)}% less), exceeds threshold (${instantSellThreshold}%), listing at normal price instead`,
                    );
                    // Fall back to normal pricing
                    sellPrice = String(
                        Math.round(
                            (calculatedPrice - calculatedPrice * 0.13043478261).toFixed(2) *
                                100,
                        ),
                    ).replace(/\./, "");
                } else {
                    // sellPrice is what WE receive (in cents)
                    // If buyer pays 1.40€, we receive ~1.22€, so we send 122
                    sellPrice = Math.round(weWillReceive * 100);
                    logger.success(
                        `[${i + 1}/${items.length}] Instant selling ${item.market_hash_name}: buyer pays ${highestBuyOrder.toFixed(2)}, we receive ${weWillReceive.toFixed(2)} ${wallet.currency} (${percentageDiff.toFixed(1)}% less than normal ${normalReceive.toFixed(2)})`,
                    );
                }
            }
        } else {
            // Normal sell mode
            // calculate - 0.13043478261%
            sellPrice = String(
                Math.round(
                    (calculatedPrice - calculatedPrice * 0.13043478261).toFixed(
                        2,
                    ) * 100,
                ),
            ).replace(/\./, "");
        }

        // Steam Min price
        if (sellPrice <= 3) {
            sellPrice = 1;
        }

        if (sellPrice === 0 || sellPrice >= config.minPrice) {
            const result = await sellItem(
                item.appid,
                item.contextid,
                item.assetid,
                sellPrice,
                1,
            );

            // Check if we hit pending confirmations limit
            if (result?.error === "PENDING_CONFIRMATIONS") {
                logger.error(`Too many listings pending confirmation!`);
                logger.warn(`Please confirm or cancel pending listings in the Steam Mobile App.`);

                const inquirer = (await import("inquirer")).default;
                await inquirer.prompt([
                    {
                        type: "confirm",
                        message: "Press Enter when you're ready to continue...",
                        name: "ready",
                        default: true,
                    },
                ]);

                logger.info(`Resuming item selling...`);

                // Retry the same item
                const retryResult = await sellItem(
                    item.appid,
                    item.contextid,
                    item.assetid,
                    sellPrice,
                    1,
                );

                if (retryResult === true) {
                    totalPrice += Number(sellPrice);
                    soldCount += 1;
                    logger.info(
                        `[${i + 1}/${items.length}] Sold ${item.market_hash_name} for ${(sellPrice / 100).toFixed(2)} ${wallet.currency}`,
                    );
                }
            } else if (result === true) {
                totalPrice += Number(sellPrice);
                soldCount += 1;
                logger.info(
                    `[${i + 1}/${items.length}] Sold ${item.market_hash_name} for ${(sellPrice / 100).toFixed(2)} ${wallet.currency}`,
                );
            }
        }

        await sleep(125);
    }

    logger.info(
        `Selling complete! Sold: ${soldCount}, Skipped: ${skippedCount}, Total: ${(totalPrice / 100).toFixed(2)} ${wallet.currency}, Time: ${moment.duration(moment().valueOf() - startTime).humanize()}`,
    );
};

const pricePerGem = 0.46 / 1000;

const turnIntoGems = async (config, wallet) =>
    // biome-ignore lint/suspicious/noAsyncPromiseExecutor: <explanation>
    new Promise(async (resolve) => {
        const inventoryContent = await getInventory();
        const { sellOptionsFlag } = config;

        let itemToGems = [];

        // Filter based on selected flags - only items that can be turned into gems
        const canTurnToGems = (item) => item.owner_actions?.find(
            (action) => action.name === "Turn into Gems...",
        );

        // eslint-disable-next-line no-bitwise
        if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.BACKGROUNDS) {
            const backgrounds = inventoryContent.filter(
                (item) => item.type.includes("Background") && !item.type.includes("Profile") && canTurnToGems(item),
            );
            itemToGems.push(...backgrounds);
        }

        // eslint-disable-next-line no-bitwise
        if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.EMOTICONS) {
            const emoticons = inventoryContent.filter(
                (item) => item.type.includes("Emoticon") && canTurnToGems(item),
            );
            itemToGems.push(...emoticons);
        }

        // eslint-disable-next-line no-bitwise
        if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.PROFILE_BACKGROUNDS) {
            const profileBgs = inventoryContent.filter(
                (item) => item.type.includes("Profile Background") && canTurnToGems(item),
            );
            itemToGems.push(...profileBgs);
        }

        // eslint-disable-next-line no-bitwise
        if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.MINI_PROFILE_BACKGROUNDS) {
            const miniBgs = inventoryContent.filter(
                (item) => item.type.includes("Mini Profile Background") && canTurnToGems(item),
            );
            itemToGems.push(...miniBgs);
        }

        // Note: Trading cards, stickers, chat effects, avatars, and frames typically cannot be turned into gems
        // so we don't include them here even if selected

        // const bar = new cliProgress.SingleBar(
        //     {
        //         stopOnComplete: true,
        //         format: "Turning Into Gems | {bar} | {percentage}% | {value}/{total} Items | Time Elapsed: {duration}s | {eta}s | Total Gems: {gems}",
        //     },
        //     cliProgress.Presets.shades_grey,
        // );

        // bar.start(itemToGems.length, 0, { duration: 0, gems: 0 });

        const startTime = moment().valueOf();
        let totalGems = 0;
        const gemCache = {};
        const priceCache = {};

        logger.info(
            `Starting gem conversion process... for ${itemToGems.length} items`,
        );

        let index = 0;
        const total = itemToGems.length;

        for (const item of itemToGems) {
            index++;
            const itemType = item.owner_actions
                .find((action) => action.name === "Turn into Gems...")
                .link.match("GetGooValue(.*?, .*?, .*?, (.*?),.*)")[2];

            let expectedGems = 0;
            if (typeof gemCache[item.market_hash_name] === "undefined") {
                const gemWorthResponse = responseToJSON(
                    await getRequest(
                        `https://steamcommunity.com/auction/ajaxgetgoovalueforitemtype/?appid=${item.market_fee_app}&item_type=${itemType}&border_color=0`,
                    ),
                );

                if (gemWorthResponse.success !== 1) {
                    logger.error(
                        `Failed to get gem worth for ${item.market_hash_name}`,
                    );
                    // eslint-disable-next-line no-continue
                    continue;
                }

                gemCache[item.market_hash_name] = gemWorthResponse.goo_value;
            }

            expectedGems = gemCache[item.market_hash_name];

            const isNotMarketable =
                !item.marketable &&
                item.descriptions.find(
                    (desc) =>
                        desc.value ===
                        "This item can no longer be bought or sold on the Community Market.",
                );

            if (!isNotMarketable) {
                let price = 0;
                if (typeof priceCache[item.market_hash_name] === "undefined") {
                    price = await getItemPrice(
                        753,
                        fixMarketHashName(item.market_hash_name),
                        wallet.currency,
                    );
                    await sleep(150);

                    if (price === -1) {
                        logger.error(
                            `Failed to get price for ${item.market_hash_name}`,
                        );
                        // eslint-disable-next-line no-continue
                        continue;
                    }
                    priceCache[item.market_hash_name] = price;
                } else {
                    price = priceCache[item.market_hash_name];
                }

                let priceWithoutFees = getPriceWithoutFees(price);

                // Steam Min price
                if (priceWithoutFees <= 0.03) {
                    priceWithoutFees = 0.01;
                }

                priceWithoutFees = Number.parseInt(toCents(priceWithoutFees));
                const gemPriceToGet = Number.parseInt(
                    toCents(expectedGems * pricePerGem),
                );

                if (priceWithoutFees > gemPriceToGet) {
                    logger.info(
                        `[Skipped][${index}/${total}] Item ${item.market_hash_name} is better off sold for ${priceWithoutFees} than grinding for (${gemPriceToGet})`,
                    );

                    continue;
                }

                if (priceWithoutFees > 100) {
                    logger.info(
                        `[Skipped][${index}/${total}] Item ${item.market_hash_name} is too expensive to grind for (${gemPriceToGet})`,
                    );

                    continue;
                }

                logger.success(
                    `[Grinding][${index}/${total}] Item ${item.market_hash_name} is worth grinding for ${gemPriceToGet} vs ${priceWithoutFees}`,
                );
            } else {
                logger.success(
                    `[Grinding][${index}/${total}] Item ${item.market_hash_name} is NMC so grinding`,
                );
            }

            const data = `sessionid=${global.sessionId}&appid=${item.market_fee_app}&assetid=${item.assetid}&contextid=6&goo_value_expected=${expectedGems}`;

            const grindResponse = responseToJSON(
                await postRequest(
                    `https://steamcommunity.com/profiles/${steamCommunity.steamID}/ajaxgrindintogoo/`,
                    data,
                    {
                        "Content-Type":
                            "application/x-www-form-urlencoded; charset=UTF-8",
                        Referer: `https://steamcommunity.com/profiles/${steamCommunity.steamID}/inventory`,
                        Origin: "https://steamcommunity.com",
                        Cookie: globalCookies.join("; "),
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
                    },
                ),
            );

            if (grindResponse.success === 1) {
                totalGems += Number(expectedGems);
                //   logger.log(`[${moment().format()}] Successfully turned ${item.market_name} into ${expectedGems} gems.`);
            } else {
                logger.error(
                    `[${moment().format()}] Failed to turn ${
                        item.market_name
                    } into gems.`,
                );
            }

            // bar.update(i + 1, {
            //     duration: `${moment
            //         .duration(moment().valueOf() - startTime)
            //         .humanize()}`,
            //     gems: totalGems,
            // });
        }
    });

const redeemApps = async (config) =>
    // biome-ignore lint/suspicious/noAsyncPromiseExecutor: <explanation>
    new Promise(async (resolve) => {
        for (const subId of config.list) {
            const req = await postRequest(
                `https://store.steampowered.com/freelicense/addfreelicense/${subId}`,
                { sessionid: global.sessionId },
            );

            writeFileSync(`./debug/redeemApps_${subId}.html`, req);
        }
    });

const activateKeys = async (config) =>
    // biome-ignore lint/suspicious/noAsyncPromiseExecutor: <explanation>
    new Promise(async (resolve) => {
        let successCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        let autoRetryOnRateLimit = false;

        logger.info(`Starting activation of ${config.keys.length} keys...`);

        // Pre-filter keys: remove already activated ones and invalid formats
        // Extract key pattern from line (ignoring surrounding text)
        const keyRegex = /([A-Z0-9]{4,5}-[A-Z0-9]{4,5}-[A-Z0-9]{4,5}(-[A-Z0-9]{4,5}(-[A-Z0-9]{4,5})?)?)/i;
        const keysToProcess = [];
        let alreadyActivatedCount = 0;
        let invalidFormatCount = 0;
        const invalidLines = [];

        for (const rawKey of config.keys) {
            const line = rawKey.trim();

            if (!line) {
                continue;
            }

            // Try to extract key from the line
            const match = line.match(keyRegex);
            if (!match || !match[0]) {
                invalidFormatCount += 1;
                invalidLines.push(line);
                continue;
            }

            const key = match[0];

            const alreadyActivated = await isKeyActivated(key);
            if (alreadyActivated) {
                alreadyActivatedCount += 1;
                continue;
            }

            keysToProcess.push(key);
        }

        if (alreadyActivatedCount > 0) {
            logger.info(`Skipped ${alreadyActivatedCount} already activated keys`);
        }
        if (invalidFormatCount > 0) {
            logger.info(`Skipped ${invalidFormatCount} invalid key formats:`);
            invalidLines.forEach((line, idx) => {
                logger.warn(`  [${idx + 1}] ${line}`);
            });
        }

        logger.info(`Processing ${keysToProcess.length} keys...`);

        for (let i = 0; i < keysToProcess.length; i += 1) {
            const key = keysToProcess[i];

            const response = responseToJSON(
                await postRequest(
                    "https://store.steampowered.com/account/ajaxregisterkey/",
                    {
                        product_key: key,
                        sessionid: global.sessionId,
                    },
                    {
                        Cookie: globalCookies.join("; "),
                        "Content-Type":
                            "application/x-www-form-urlencoded; charset=UTF-8",
                        Origin: "https://store.steampowered.com",
                        Referer:
                            "https://store.steampowered.com/account/registerkey",
                    },
                ),
            );

            // If response is false, it means we got a network error or rate limit
            // Don't mark as failed, just skip and let user retry later
            if (response === false) {
                skippedCount += 1;
                logger.warn(
                    `[${i + 1}/${keysToProcess.length}] Network error or rate limit for "${key}" - skipping without marking as used`,
                );
                // eslint-disable-next-line no-continue
                continue;
            }

            const purchaseResultDetails = response?.purchase_result_details;
            const packageId =
                response?.purchase_receipt_info?.line_items?.[0]?.packageid?.toString() ||
                null;
            const lineItemDescription =
                response?.purchase_receipt_info?.line_items?.[0]
                    ?.line_item_description || "Unknown";

            // success: 1 = successfully activated
            if (response?.success === 1) {
                successCount += 1;
                logger.success(
                    `[${i + 1}/${keysToProcess.length}] Successfully activated "${key}": ${lineItemDescription} (${packageId || "Unknown"})`,
                );

                // Store as successful activation
                await storeActivatedKey(
                    key,
                    config.accountId,
                    true,
                    packageId,
                    null,
                );
            } else if (purchaseResultDetails === 9) {
                // Case 9: Already owns the product - key is consumed
                successCount += 1;
                logger.success(
                    `[${i + 1}/${keysToProcess.length}] Already owned "${key}": ${lineItemDescription} (${packageId || "Unknown"})`,
                );

                // Store as activated (key is consumed)
                await storeActivatedKey(
                    key,
                    config.accountId,
                    true,
                    packageId,
                    "Already owned",
                );
            } else if (purchaseResultDetails === 53) {
                // Case 53: Rate limit exceeded
                logger.warn(
                    `[${i + 1}/${keysToProcess.length}] Rate limit exceeded for "${key}"`,
                );

                // If first time hitting rate limit, ask user if they want to wait
                if (!autoRetryOnRateLimit) {
                    const inquirer = (await import("inquirer")).default;
                    const answer = await inquirer.prompt([
                        {
                            type: "confirm",
                            message: "Rate limit hit! Would you like to wait 1 hour and retry?",
                            name: "waitAndRetry",
                            default: true,
                        },
                    ]);

                    if (!answer.waitAndRetry) {
                        logger.error(
                            "Rate limit hit! Stopping activation. Remaining keys will not be marked as used.",
                        );
                        break;
                    }

                    // User agreed to wait, set flag for future rate limits
                    autoRetryOnRateLimit = true;
                }

                // Wait 1 hour
                logger.info("Waiting 1 hour before retrying...");
                await sleep(60 * 60 * 1000); // 1 hour in milliseconds
                logger.info("Retrying activation...");

                // Retry the same key (decrement i so the loop will retry this index)
                i -= 1;
                // eslint-disable-next-line no-continue
                continue;
            } else if (purchaseResultDetails === 15) {
                // Case 15: Already activated by different account - key is consumed
                failedCount += 1;
                logger.error(
                    `[${i + 1}/${keysToProcess.length}] Already used by another account: "${key}"`,
                );

                // Store as activated/failed (key is consumed, can't be used again)
                await storeActivatedKey(
                    key,
                    config.accountId,
                    true,
                    packageId,
                    "Already activated by different account",
                );
            } else {
                // Other errors (invalid key, region lock, etc.)
                failedCount += 1;

                const errorMessages = {
                    14: "Invalid product code",
                    16: "Batched request timeout",
                    13: "Not available in this region",
                    24: "Requires ownership of another product",
                    36: "Requires PlayStation 3 activation",
                    50: "Steam Wallet code (use different page)",
                    4: "Unknown error (4)",
                };

                const errorMessage =
                    errorMessages[purchaseResultDetails] ||
                    `Unexpected error (code: ${purchaseResultDetails})`;

                logger.error(
                    `[${i + 1}/${keysToProcess.length}] Failed "${key}": ${errorMessage}`,
                );

                // For timeout (16), don't mark as used
                if (purchaseResultDetails === 16) {
                    skippedCount += 1;
                    failedCount -= 1;
                    // eslint-disable-next-line no-continue
                    continue;
                }

                // Store the failed activation
                await storeActivatedKey(
                    key,
                    config.accountId,
                    false,
                    packageId,
                    errorMessage,
                );
            }

            // Add a small delay to avoid rate limiting
            await sleep(1000);
        }

        logger.info(
            `Activation complete! Success: ${successCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`,
        );
        resolve();
    });

export {
    doLogin,
    chooseAccount,
    postRequest,
    getRequest,
    getOwnedApps,
    getWalletBalance,
    addAccount,
    loadCheapestGames,
    setGamePreferences,
    checkoutCart,
    addGamesToCart,
    getOwnedAppsCount,
    getItemPrice,
    sellItem,
    getInventory,
    getMarketListings,
    removeMarketListing,
    removeOverpricedItems,
    sellItems,
    buyGames,
    redeemApps,
    turnIntoGems,
    getAppDetails,
    activateKeys,
};
