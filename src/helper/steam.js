/* eslint-disable no-nested-ternary */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-async-promise-executor */
/* eslint-disable no-param-reassign */
import inquirer from 'inquirer';
import Steamcommunity from 'steamcommunity';
import SteamStore from 'steamstore';
import * as cheerio from 'cheerio';
import qs from 'qs';
import { writeFileSync } from 'fs';
import cliProgress from 'cli-progress';
import moment from 'moment';
import {
  getAccounts, storeAccount, updateAccount, updateOAuthToken, updateSteamGuard,
} from '../db/account';
import {
  addApp, getApp, getLimitedGames, updateGame,
} from '../db/games';
import logger from './logger';
import {
  asyncFilter, roundPrice, sleep, toCents,
} from './util';
import {
  COUNTRY_CODES, CURRENCY_CODES, EXTRA_OPTIONS, MAX_PRICES,
} from './constants';
import { showGamesToBuy } from './config';

const steamCommunity = new Steamcommunity();
const steamStore = new SteamStore();

// [HTTP REQUESTS]

const postRequest = async (url, data, headers = {}) => new Promise(async (resolve) => {
  steamCommunity.httpRequestPost(url, {
    form: data,
    headers,
  }, (err, response, body) => {
    if (err) {
      if (err.message !== 'HTTP error 429') {
        logger.warn(err.message, body);
      }
      resolve(false);
    }

    resolve(body);
  });
});

const getRequest = async (url, headers = {}) => new Promise(async (resolve) => {
  steamCommunity.httpRequestGet(url, headers, (err, response, body) => {
    if (err) {
      if (err.message !== 'HTTP error 429') {
        logger.warn(err.message, body);
      }
      resolve(false);
    }
    resolve(body);
  });
});

const responseToJSON = (response) => {
  try {
    return JSON.parse(response);
  } catch (e) {
    logger.error(e);
    return false;
  }
};

const balanceToAmount = (string) => {
  const currency = string.match(/([A-Z]{1,})/)[0];
  const amount = string.match(/(\d+(?:.(\d+)){1,})/)[0];

  // write a function that can detect the currency and convert it to a number
  const parsedAmount = parseFloat(amount.replace(/,/g, '').replace(/\./, '')) / 100;

  return {
    currency,
    amount: parsedAmount,
  };
};

// [ Login stuff ]
const setCookies = (cookies) => {
  steamStore.setCookies(cookies);
  steamCommunity.setCookies(cookies);
};

const addAccount = async (accountId) => {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      message: 'Enter your username',
      name: 'username',
    },
    {
      type: 'password',
      message: 'Enter your password',
      name: 'password',
      mask: '*',
      validate: (value) => {
        if (/\w/.test(value) && /\d/.test(value)) {
          return true;
        }
        return 'Password need to have at least a letter and a number';
      },
    },
  ]);

  const { username, password } = answers;

  if (accountId) {
    return updateAccount(accountId, username.trim(), password.trim());
  }

  return storeAccount(username.trim(), password.trim());
};

const chooseAccount = async () => {
  const accounts = await getAccounts();

  accounts.push({
    username: 'Add an account',
    id: -1,
  }, {
    username: 'Separator',
    id: 0,
  });

  // arrange it so there is a space between the accounts and the add account option
  const answers = await inquirer.prompt([
    {
      type: 'list',
      message: 'Choose an account',
      name: 'account',
      choices: accounts.map(
        (account) => ({
          name: account.username,
          value: account.id,
          checked: account.id === -1 && accounts.length === 0,
          type: account.id === 0 ? 'separator' : 'list',
        }),
      ).sort((a, b) => (a.value === b.value ? 0 : a.value <= b.value ? -1 : 1)),
    },
  ]);

  return answers.account;
};

const doLogin = async ({
  username, password, guardType = '', oAuthToken = false, steamGuard = '', id: accountId,
}) => new Promise(async (resolve, reject) => {
  const loginOptions = {
    accountName: username,
    password,
  };

  if (guardType) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        message: `Enter your ${guardType} code`,
        name: 'steamGuard',
      },
    ]);

    switch (guardType) {
      case 'email':
        loginOptions.authCode = answers.steamGuard;
        break;
      case 'mobile':
        loginOptions.twoFactorCode = answers.steamGuard;
        break;
      default:
        loginOptions.steamGuard = answers.steamGuard;
        break;
    }
  }

  logger.log(`Trying to login for user ${username}`);

  if (!oAuthToken) {
    steamCommunity.login(loginOptions, async (
      error,
      sessionId,
      cookies,
      _steamGuard,
      _oAuthToken,
    ) => {
      if (error) {
        switch (error.message) {
          case 'SteamGuardMobile':
            resolve(
              await doLogin({
                username, password, guardType: 'mobile', id: accountId,
              }),
            );
            break;
          case 'SteamGuard':
            resolve(
              await doLogin({
                username, password, guardType: 'email', id: accountId,
              }),
            );
            break;
          case 'CAPTCHA':
            reject(logger.log("We don't support captcha yet"));
            break;
          case 'The account name or password that you have entered is incorrect.':
            logger.log('The account name or password that you have entered is incorrect. Please try again.');
            resolve(await addAccount(accountId));
            break;
          default:
            logger.error(error);
            reject(error);
        }

        return;
      }

      await updateOAuthToken(accountId, _oAuthToken);
      await updateSteamGuard(accountId, _steamGuard);
      setCookies(cookies);
      //   add a wants_mature_content cookie
      steamCommunity.setCookies(['wants_mature_content=1']);

      resolve({
        cookies,
        sessionId,
        oAuthToken: _oAuthToken,
        steamGuard: _steamGuard,
        username,
        password,
      });
    });
  } else {
    steamCommunity.oAuthLogin(steamGuard, oAuthToken, (error, sessionId, cookies) => {
      if (error) {
        logger.error(error);
        reject(error);
      }

      setCookies(cookies);
      //   add a wants_mature_content cookie
      steamCommunity.setCookies(['wants_mature_content=1']);

      resolve({
        cookies,
        sessionId,
      });
    });
  }
});
// [ Actual Steam requests ]

const getWalletBalance = async () => new Promise(async (resolve) => {
  steamStore.getWalletBalance((err, response) => {
    if (err) {
      logger.error(`Error getting wallet balance: ${err}`);
    }

    const { amount, currency } = balanceToAmount(response.formattedBalance);

    // check if the user has a wallet
    const hasWallet = !!currency && !!amount;

    resolve({
      hasWallet,
      currency,
      balance: amount,
    });
  });
});

const bypassMaturityCheck = async (appId, appPage) => {
  let ageResponse = await postRequest(`https://store.steampowered.com/agecheckset/app/${appId}`, {
    sessionid: global.sessionId,
    ageDay: 1,
    ageMonth: 'January',
    ageYear: 1990,
  });

  try {
    ageResponse = JSON.parse(ageResponse);
  } catch (error) {
    logger.error(error);
  }

  // regex get the value of what docuemnt.location is being set to in the response
  const redirectUrl = appPage.match(/document\.location = "(.*)";/)[0].split('= ')[1].replace(/"|;/g, '').replace(/\\/g, '');

  switch (ageResponse.success) {
    case 1:
      steamCommunity.setCookies(['wants_mature_content=1']);
      // success
      break;

    case 24:
    case 15:
      logger.error(`bypassMaturityCheck():15- Error bypassing maturity check for ${appId}`, ageResponse);
      break;

    case 2:
      logger.error(`bypassMaturityCheck():2 - Error bypassing maturity check for ${appId}`, ageResponse);
      break;
    default:
      logger.log(`bypassMaturityCheck():default - Error bypassing maturity check for ${appId}`, ageResponse);

      break;
  }

  return redirectUrl;
};

async function getAppDetails(app, forceUrl = false) {
  const { appId, isBundle = false, includedApps = undefined } = app;

  const appInDb = await getApp(appId);

  if (appInDb && Number(app.price) === appInDb.price && appInDb.id === appId) {
    appInDb.isInDb = true;
    return appInDb;
  }

  const url = forceUrl || `https://store.steampowered.com/app/${appId}?snr=1_direct-navigation__`;

  const appPage = await getRequest(url);

  const $ = cheerio.load(appPage);

  // check for a a element with a view_product_page_btn id
  if ($('#view_product_page_btn').length > 0) {
    return getAppDetails(app, await bypassMaturityCheck(appId, appPage));
  }

  const subId = $('input[name=subid]').val();
  const snr = $('input[name=snr]').val();
  const originatingSnr = $('input[name=originating_snr]')?.val() || '1_direct-navigation__';
  const limitedRegex = /Profile Features Limited|Steam is learning about this game/g;
  const cardRegex = /Steam Trading Cards/g;
  const isLimited = !!limitedRegex.exec(appPage);
  const hasTradingCards = !!cardRegex.exec(appPage);

  if (appInDb && (appInDb.limited !== isLimited || appInDb.hasTradingCards !== hasTradingCards)) {
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

  return app;
}

const fixMarketHashName = (marketHashName) => {
  const fixedMarketHashName = marketHashName.replace(/\//g, '-');
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
  const {
    maxPrice, usage, limit, priceOptionsFlag,
  } = config;

  const appsToBuy = [];
  let loop = true;

  const bar = new cliProgress.SingleBar({
    stopOnComplete: true,
    format: 'Loading Games | {bar} | {percentage}% | {value}/{total} that fit the criteria | ETA: {eta}s | Time Elapsed: {duration}s | Total Price {totalPrice} | Average Price {averagePrice}',
  }, cliProgress.Presets.shades_grey);
  bar.start(config.limit === '0' ? Infinity : 0, 0, {
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
      dynamic_data: '',
      sort_by: 'Price_ASC',
      maxprice: MAX_PRICES[wallet.currency],
      category1: '998',
      hidef2p: '1',
      ndl: '1',
      snr: '1_7_7_230_7',
      infinite: '1',
      sessionid: global.sessionId,
    };

    // bitwise operator to check if the priceOptionsFlag is set
    // eslint-disable-next-line no-bitwise
    if (priceOptionsFlag & EXTRA_OPTIONS.TRADING_CARDS
         // eslint-disable-next-line no-bitwise
         || priceOptionsFlag & EXTRA_OPTIONS.TRADING_CARDS_LIMITED) {
      data.category2 = '29';
    }

    // create query string from object
    const url = `https://store.steampowered.com/search/results/?query&${qs.stringify(data)}`;

    // eslint-disable-next-line no-await-in-loop
    const response = JSON.parse(await getRequest(url));

    const $ = cheerio.load(response.results_html);

    start += count;

    let foundApps = await Promise.all($('a').map(async (_, el) => {
      const element = $(el);

      // find data-price-final in child element
      const price = Number(element.find('[data-price-final]').attr('data-price-final').replace(',', '')) / 100;
      const name = element.find('.title').text();
      const appUrl = element.attr('href');
      const appId = element.attr('data-ds-appid');

      // convert the element to html and write it to a file
      if (!appId) {
        writeFileSync(`./debug/noappid_${new Date().getTime()}.html`, element.html());
        return [];
      }

      if (appUrl.startsWith('https://store.steampowered.com/sub/')) {
        // the appId will be the subId
        const subId = appUrl.split('/')[4];

        appId.split(',').forEach(async (id) => {
          await getAppDetails({ name, appId: id, price });
        });

        await getAppDetails({
          name,
          appId: subId,
          price,
          includedApps: (appId.split(',')).forEach((id) => ({
            appId: id,
            bundleId: subId,
          })),
        }, appUrl);

        return {
          name,
          price,
          url: appUrl,
          appId: subId,
          isSub: true,
          appsInPackage: appId.split(','),
        };
      }

      if (!ownedApps.includes(appId) && !limitedGames.includes(appId)) {
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
    }).get());

    // check for array for any 2d arrays and if so flatten it
    foundApps = foundApps.flat();

    // filter out empty arrays
    foundApps = foundApps.filter((app) => app);

    const resultCount = foundApps.length;

    // check if more than 50% of the games are over the limit
    if (
      maxPrice !== 0
        && (foundApps.filter((app) => app.price > maxPrice).length / foundApps.length) * 100 > 50
    ) {
      logger.warn(`Found ${resultCount} games, but more than 50% of them are over the limit of ${maxPrice} ${wallet.currency}`);
      loop = false;
      return appsToBuy;
    }

    foundApps = await asyncFilter(foundApps, async (foundApp) => {
      const index = foundApps.indexOf(foundApp);

      const app = await getApp(foundApp.appId);

      if (!app) {
        logger.log(`No app found for ${foundApp.appId} (${foundApp.name})`);
        return false;
      }

      // check if the app is owned

      if (ownedApps.includes(app.id) || ownedApps.includes(app.subId)) {
        return false;
      }

      // check if the app is limited and we do not have the TRADING_CARDS_LIMITED option set
      // eslint-disable-next-line no-bitwise
      if (app.limited && !(priceOptionsFlag & EXTRA_OPTIONS.TRADING_CARDS_LIMITED)) {
        return false;
      }

      if (maxPrice !== 0 && foundApp.price > maxPrice) {
        return false;
      }

      if (appsToBuy.find((appToBuy) => appToBuy.appId === app.id)) {
        return false;
      }

      if (app.includedApps.length > 0) {
        const ignoreDueToIncludedApps = app.includedApps.forEach((element) => {
          if (ownedApps.includes(element.id)) {
            return false;
          }

          if (appsToBuy.find((appToBuy) => appToBuy.appId === element.id)) {
            return false;
          }
          return true;
        });

        if (!ignoreDueToIncludedApps) {
          return false;
        }
      }

      // eslint-disable-next-line no-bitwise
      if ((priceOptionsFlag & EXTRA_OPTIONS.TRADING_CARDS
        // eslint-disable-next-line no-bitwise
        || priceOptionsFlag & EXTRA_OPTIONS.TRADING_CARDS_LIMITED)
        && !app.hasTradingCards) {
        return false;
      }

      foundApps[index] = { ...app, ...foundApp };

      return true;
    });

    for (let i = 0; i < foundApps.length; i += 1) {
      const app = foundApps[i];

      const currentPriceOfAllApps = appsToBuy.reduce((acc, appToBuy) => acc + appToBuy.price, 0);

      if (['max'].includes(usage) && currentPriceOfAllApps + app.price >= wallet.balance) {
        logger.info(`The current price of all apps (${roundPrice(currentPriceOfAllApps)} ${wallet.currency}) plus the price of the next app (${app.price} ${wallet.currency}) is higher than the balance (${wallet.balance} ${wallet.currency})`);
        loop = false;
        break;
      }

      if (['balance'].includes(usage) && currentPriceOfAllApps + app.price >= limit) {
        logger.info(`The current price of all apps (${currentPriceOfAllApps} ${wallet.currency}) plus the price of the next app (${app.price} ${wallet.currency}) is higher than the limit (${limit} ${wallet.currency})`);
        loop = false;
        break;
      }

      if (['amount', 'next', 'preview'].includes(usage) && appsToBuy.length >= limit) {
        logger.info(`The current amount of apps (${appsToBuy.length}) is higher than the limit (${limit})`);
        loop = false;
        if (appsToBuy.length + 1 <= limit) {
          appsToBuy.push(app);
          loop = false;
        }
        break;
      }

      if (!loop) break;

      appsToBuy.push(app);
    }

    const totalPrice = roundPrice(appsToBuy.reduce((acc, app) => acc + app.price, 0));
    const averagePrice = roundPrice(totalPrice / appsToBuy.length || 0);

    // moment to relativetimestamp

    bar.update(appsToBuy.length + 1, {
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
  const bar = new cliProgress.SingleBar({
    stopOnComplete: true,
    format: 'Adding games to cart | {bar} | {percentage}% | {value}/{total} Games | Time Elapsed: {duration}s | ETA: {eta}s',
  }, cliProgress.Presets.shades_grey);

  bar.start(apps.length, 1);

  for (let i = 0; i < apps.length; i += 1) {
    const app = apps[i];
    const response = await postRequest('https://store.steampowered.com/cart/', {
      snr: app.snr,
      subid: app.subId,
      sessionid: global.sessionId,
      originating_snr: app.originatingSnr,
      action: 'add_to_cart',
    });

    if (response.match(/Your item has been added!/) === null) {
      logger.error(`Error adding app ${app.name} (${app.appId}) to cart`);
      writeFileSync(`./debug/cart+error_${app.id}.html`, response);
    } else {
      const $ = cheerio.load(response);

      // get cart input value
      if (global.shoppingCartGID !== $('input[name="cart"]').val()) {
        global.shoppingCartGID = $('input[name="cart"]').val();
      }
    }
    bar.update(i);
  }

  return true;
};

// this will remove all items with notes and apps / packages that we already own
const clearCartPage = async (cartPage) => {
  const $ = cheerio.load(cartPage);

  //   get all elements which have a text called See note below
};

const forgetCart = async () => {
  global.shoppingCartGID = null;
  // get our cookies from the browser

  console.log(steamCommunity._request._jar);
};

const finalizeTransaction = async (transactionId) => {
  const data = {
    transid: transactionId,
    CardCVV2: '',
    browserInfo: {
      language: 'de-DE',
      javaEnabled: false,
      colorDepth: 24,
      screenHeight: 1080,
      screenWidth: 1920,
    },
  };

  let response;

  for (let i = 0; i < 3; i += 1) {
    response = await postRequest('https://store.steampowered.com/checkout/finalizetransaction/', data);

    response = responseToJSON(response);

    if (response !== false && response?.success === 22) break;
  }

  if (response.success !== 22) {
    logger.error('finalizeTransaction() Error finalizing transaction', response);
    return false;
  }

  logger.success('finalizeTransaction() Successfully finalized transaction');
  return true;
};

const removeFromCart = async (error, cartPage) => {
  const $ = cheerio.load(cartPage);

  let appName;
  if (error.specificerrortext) {
    // get the text that is in ''
    const regex = /'([^']+)'/;
    const match = regex.exec(error.specificerrortext);
    if (match !== null) {
      [, appName] = match;
    }
  } else {
    // do nothing
    return;
  }

  let appElement;
  if (appName) {
    // get the cart_row div from the a element with the app name
    appElement = $(`a:contains("${appName}")`).closest('.cart_row');
  }

  //   get srr from the a element in the cart_item_img div
  const snr = appElement.find('.cart_item_img a').attr('href').split('snr=')[1];
  const appId = appElement.attr('data-ds-appid');

  const data = {
    sessionid: global.sessionId,
    action: 'remove_line_item',
    cart: global.shoppingCartGID,
    snr: `${snr}__cart-remove`,
    lineitem_gid: appElement.attr('id').split('cart_row_')[1],
  };

  const response = await postRequest('https://store.steampowered.com/cart/', data);

  await sleep(50);

  if (response.match(/Your item has been removed/) === null) {
    logger.error(`Error removing app ${appName} (${appId}) from cart`);
  } else {
    logger.success(`Successfully removed app ${appName} (${appId}) from cart`);
  }
};

const initializeTransaction = async (countryCode, cartPage) => {
  const data = {
    gidShoppingCart: global.shoppingCartGID,
    gidReplayOfTransID: '-1',
    PaymentMethod: 'steamaccount',
    abortPendingTransactions: '0',
    bHasCardInfo: '0',
    CardNumber: '',
    CardExpirationYear: '',
    CardExpirationMonth: '',
    FirstName: '',
    LastName: '',
    Address: '',
    AddressTwo: '',
    Country: countryCode,
    City: '',
    State: '',
    PostalCode: '',
    Phone: '',
    ShippingFirstName: '',
    ShippingLastName: '',
    ShippingAddress: '',
    ShippingAddressTwo: '',
    ShippingCountry: countryCode,
    ShippingCity: '',
    ShippingState: '',
    ShippingPostalCode: '',
    ShippingPhone: '',
    bIsGift: '0',
    GifteeAccountID: '0',
    GifteeEmail: '',
    GifteeName: '',
    GiftMessage: '',
    Sentiment: '',
    Signature: '',
    ScheduledSendOnDate: '0',
    BankAccount: '',
    BankCode: '',
    BankIBAN: '',
    BankBIC: '',
    TPBankID: '',
    bSaveBillingAddress: '1',
    gidPaymentID: '',
    bUseRemainingSteamAccount: '1',
    bPreAuthOnly: '0',
    sessionid: global.sessionId,
  };

  let response;

  for (let i = 0; i < 3; i += 1) {
    response = await postRequest('https://store.steampowered.com/checkout/inittransaction/', data);

    response = responseToJSON(response);

    if (response !== false && response.success) break;
  }

  if (response.transid === undefined) {
    logger.error('initializeTransaction() Error initializing transaction', response);
  }

  logger.log(`initializeTransaction() response: ${JSON.stringify(response)}`);

  if (response?.appcausingerror) {
    logger.error('initializeTransaction() Error initializing transaction', response.specificerrortext);
    await removeFromCart(response, cartPage);
    return initializeTransaction(countryCode, cartPage);
  }

  logger.success('initializeTransaction() Successfully initialized transaction');
  return response.transid;
};

const getFinalPrice = async (transactionId) => {
  let response;
  let success = false;

  for (let i = 0; i < 3; i += 1) {
    response = await getRequest(`https://store.steampowered.com/checkout/getfinalprice/?count=1&transid=${transactionId}&purchasetype=self&microtxnid=-1&cart=${global.shoppingCartGID}&gidReplayOfTransID=-1`);

    response = responseToJSON(response);

    logger.log(`getFinalPrice() response: ${JSON.stringify(response)}`);

    if (!response.error) {
      success = true;
      break;
    } else {
      logger.error('getFinalPrice() Error getting final price', response);
    }
  }

  return success;
};

const checkoutCart = async () => {
  const cartPage = await postRequest('https://store.steampowered.com/cart/', {
    sessionid: global.sessionId,
  });

  if (!cartPage) {
    logger.warn('Could not get cart');
    return false;
  }

  writeFileSync('./debug/finalCart.html', cartPage);

  const $ = cheerio.load(cartPage);

  const countryCode = $('input[name="usercountrycurrency"]').val();

  const transactionId = await initializeTransaction(countryCode, cartPage);

  if (!transactionId) return false;

  await getFinalPrice(transactionId);

  await finalizeTransaction(transactionId);

  logger.log('checkoutCart() Successfully checked out');
};

const setGamePreferences = async () => {
  let response = await postRequest('https://store.steampowered.com/account/savecontentdescriptorpreferences', { sessionid: global.sessionId });

  try { response = JSON.parse(response); } catch (e) { logger.error(e); }

  if (response?.success !== 1) {
    logger.error('Could not set game preferences');
    return false;
  }

  logger.success('Game preferences set');
  return true;
};

const getOwnedApps = async () => new Promise((resolve, reject) => {
  steamStore.getAccountData(async (error, apps, packages) => {
    if (error) {
      logger.error(error);
      reject(error);
    }

    resolve(apps.concat(packages));
  });
});

const getOwnedAppsCount = async () => {
  const response = await getRequest('https://steamcommunity.com/my/badges/13');

  const $ = cheerio.load(response);

  return Number($('.badge_description')?.text()?.replace(/[^0-9]/g, '') ?? 9);
};

const sellItem = async (appId, contextId, assetId, price, amount) => {
  const response = responseToJSON(await postRequest('https://steamcommunity.com/market/sellitem/', {
    sessionid: global.sessionId,
    appid: appId,
    contextid: contextId,
    assetid: assetId,
    amount,
    price,
  }, {
    Referer: `https://steamcommunity.com/profiles/${steamCommunity.steamID.getSteamID64()}/inventory/`,
  }));

  if (response?.success !== true) {
    logger.error('Could not sell item', response);
    return false;
  }
};

const getItemPriceBackup = async (appId, marketHashName) => {
  const url = new URL('https://steamcommunity.com/market/multibuy');
  url.searchParams.append('appid', appId);
  url.searchParams.append('contextid', '2');
  url.searchParams.append('items[]', marketHashName);

  const response = await getRequest(url.href, {
    Referer: 'https://steamcommunity.com/market/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Safari/537.36',
  });

  if (!response) return -1;

  const $ = cheerio.load(response);

  return balanceToAmount($('.market_dialog_input.market_multi_price').val()).amount;
};

const getItemPrice = async (appId, marketHashName, currency) => {
  const url = new URL('https://steamcommunity.com/market/priceoverview/');
  url.searchParams.append('country', COUNTRY_CODES[currency]);
  url.searchParams.append('currency', CURRENCY_CODES[currency]);
  url.searchParams.append('appid', appId);
  url.searchParams.append('market_hash_name', marketHashName);

  const response = responseToJSON(await getRequest(url.href, {
    Referer: 'https://steamcommunity.com/market/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
  }).catch(() => ({ })));

  let price = -1;

  if (typeof response?.success !== 'undefined') {
    if (!response?.lowest_price) {
      logger.warn(`Could not get price for ${marketHashName} in ${currency}`, response);
    }

    price = balanceToAmount(response.lowest_price).amount;
  } else {
    const backupPrice = await getItemPriceBackup(appId, marketHashName);
    if (backupPrice > 0) {
      price = backupPrice;
    }
  }

  return price;
};

const getInventory = () => new Promise((resolve, reject) => {
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

const getCardMarketListings = async (settings) => {
  let loop = true;

  let start = 0;
  const maxCount = 100;

  const tradingCards = [];

  const bar = new cliProgress.SingleBar({
    stopOnComplete: true,
    format: 'Loading Market Listings | {bar} | {percentage}% | {value}/{total} Market Listings',
  }, cliProgress.Presets.shades_grey);

  let firstResponse = false;
  let totalListings = 0;

  while (loop) {
    const response = responseToJSON(await getRequest(`https://steamcommunity.com/market/mylistings/render/?query=&start=${start}&count=${maxCount}`));

    if (response.success) {
      if (!firstResponse) {
        bar.start(response.total_count, 0);
        firstResponse = true;
        totalListings = response.total_count;
      }

      const $ = cheerio.load(response.results_html);

      const listings = $('.market_listing_row.market_recent_listing_row');

      listings.each((_, listing) => {
        const listingId = $(listing).attr('id').replace('mylisting_', '');
        const listingName = $(listing).find('.market_listing_game_name').text();
        const listingPrice = balanceToAmount($(listing).find('.market_listing_price').text()).amount;
        const hashName = `${$(listing).find('.market_listing_item_name_link').attr('href').split('-')[0].split('/')[6]}-${$(listing).find('.market_listing_item_name_link').text()}`;

        if (listingName.includes('Card') || listingName.includes('card')) {
          if (typeof hashName === 'undefined') {
            logger.error('getCardMarketListings() Error getting card market listings', response);
          } else {
            tradingCards.push({
              listingId,
              listingName,
              listingPrice,
              hashName,
            });
          }

          bar.update(tradingCards.length);
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
      logger.error('getCardMarketListings() Error getting card market listings', response);
      loop = false;
    }

    await sleep(100);
  }

  bar.stop();

  return tradingCards;
};

const removeMarketListing = async (listingId) => {
  const response = responseToJSON(
    await postRequest(`https://steamcommunity.com/market/removelisting/${listingId}`, {
      sessionid: global.sessionId,
    }, {
      Referer: 'https://steamcommunity.com/market/',
    }),
  );

  if (!response) {
    logger.error('removeMarketListing() Error removing listing');
    return false;
  }

  return true;
};

const removeOverpricedItems = async (wallet, config, sellAll = false) => {
  const cardsOnMarket = await getCardMarketListings();

  const bar = new cliProgress.SingleBar({
    stopOnComplete: true,
    format: `Removing Cards | {bar} | {percentage}% | Checked {value}/{total} Market Listings | Removed {removedCount} Listings | Time Elapsed: {duration}s | ETA: {eta}s | Total Price: {price} ${wallet.currency}`,
  }, cliProgress.Presets.shades_grey);
  bar.start(cardsOnMarket.length, 0, { removedCount: 0, duration: 0, price: 0 });

  const cache = {};
  let removedCount = 0;
  let totalPrice = 0;
  const startTime = moment().valueOf();

  for (let i = 0; i < cardsOnMarket.length; i += 1) {
    let price = 0;
    const PriceWithoutFees = (
      parseFloat(totalPrice) - (parseFloat(totalPrice) * 0.13043478261)
    ).toFixed(2);

    bar.update(i + 1, {
      removedCount,
      duration: `${moment.duration(moment().valueOf() - startTime).humanize()}`,
      price: PriceWithoutFees,
    });

    if (typeof cache[cardsOnMarket[i].hashName] === 'undefined') {
      price = await getItemPrice(
        753,
        fixMarketHashName(cardsOnMarket[i].hashName),
        wallet.currency,
      );
      await sleep(300);

      if (price === -1) {
        // eslint-disable-next-line no-continue
        continue;
      }
      cache[cardsOnMarket[i].hashName] = price;
    } else {
      price = cache[cardsOnMarket[i].hashName];
    }

    if (cardsOnMarket[i].listingPrice > price || sellAll) {
      removedCount += 1;
      await removeMarketListing(cardsOnMarket[i].listingId);
    }

    totalPrice += cardsOnMarket[i].listingPrice;
  }

  bar.stop();
};

const buyGames = async (config, ownedApps, ownedAppsRealCount, wallet) => {
  const appList = await showGamesToBuy(await loadCheapestGames(
    config,
    0,
    100,
    ownedApps,
    ownedAppsRealCount,
    wallet,
    await getLimitedGames(),
  ), wallet);

  if (config.usage !== 'preview') {
  // split into chunks of 150
    const chunks = [];

    const minChunkSize = 200;
    const expectedChunkSize = appList.length / ((appList.length * 2) / 100);
    const chunkSize = expectedChunkSize < minChunkSize ? minChunkSize : expectedChunkSize;

    for (let i = 0; i < appList.length; i += chunkSize) {
      chunks.push(appList.slice(i, i + chunkSize));
    }

    for (let i = 0; i < chunks.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await addGamesToCart(chunks[i]);

      await checkoutCart();

      await forgetCart();

      await sleep(60);
    }
  }
};

const sellCards = async (config, wallet) => {
  const inventoryContent = await getInventory();
  const tradingCards = inventoryContent.filter((item) => item.type.includes('Card') && !item.descriptions.map((d) => d.value).includes('This item can no longer be bought or sold on the Community Market.'));

  const bar = new cliProgress.SingleBar({
    stopOnComplete: true,
    format: `Selling Trading Cards | {bar} | {percentage}% | {value}/{total} Trading Cards | Time Elapsed: {duration}s | {eta}s | Total Price: {price} ${wallet.currency}`,
  }, cliProgress.Presets.shades_grey);
  bar.start(tradingCards.length, 0, { duration: 0, price: 0 });
  const startTime = moment().valueOf();
  let totalPrice = 0;
  const priceCache = {};

  for (let i = 0; i < tradingCards.length; i += 1) {
    const card = tradingCards[i];

    let price = 0;

    if (typeof priceCache[card.market_hash_name] === 'undefined') {
      price = await getItemPrice(
        card.appid,
        fixMarketHashName(card.market_hash_name),
        wallet.currency,
      );
      await sleep(300);

      if (price === -1) {
        // eslint-disable-next-line no-continue
        continue;
      }

      priceCache[card.market_hash_name] = price;
    } else {
      price = priceCache[card.market_hash_name];
    }

    const { priceToRemove, priceCalculation } = config;

    let calculatedPrice = 0;

    if (priceCalculation === 'percentage') {
      calculatedPrice = price - (price * (priceToRemove / 100));
    } else if (priceCalculation === 'fixed') {
      calculatedPrice = price - priceToRemove;
    }

    // calculate - 0.13043478261%
    const sellPrice = String(Math.round((calculatedPrice - (calculatedPrice * 0.13043478261)).toFixed(2) * 100)).replace(/\./, '');

    totalPrice += Number(sellPrice);

    await sellItem(card.appid, card.contextid, card.assetid, sellPrice, 1);

    bar.update(i + 1, {
      duration: `${moment.duration(moment().valueOf() - startTime).humanize()}`,
      price: (parseFloat(totalPrice) / 100.0).toFixed(2),
    });
  }
};

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
  getCardMarketListings,
  removeMarketListing,
  removeOverpricedItems,
  sellCards,
  buyGames,
};
