/* eslint-disable no-await-in-loop */
import terminalImage from 'terminal-image';
import {
  addAccount,
  BADGES as badges,
  buyGames,
  chooseAccount,
  doLogin,
  getOwnedApps,
  getOwnedAppsCount,
  getWalletBalance,
  removeOverpricedItems,
  sellCards,
  setupConfig,
} from './helper';
import { getAccount } from './db/account';
import logger from './helper/logger';
import { getLimitedGames } from './db/games';

let accountId;

do {
  accountId = await chooseAccount();

  if (accountId === -1) {
    await addAccount();
  }
} while (accountId === -1 || accountId === 0);

const account = await getAccount(accountId);

const {
  sessionId,
} = await doLogin(account);

global.sessionId = sessionId;

const ownedApps = await getOwnedApps(await getLimitedGames());
const ownedAppsRealCount = await getOwnedAppsCount();
const wallet = await getWalletBalance();

// const badge = badges.find((b) => wallet >= b) || badges[badges.length - 1];

const config = await setupConfig(account, wallet, ownedAppsRealCount);

if (config.mode === 'cleanup') {
  await removeOverpricedItems(wallet);
} else if (config.mode === 'sell') {
  await sellCards(config, wallet);
} else if (config.mode === 'buy') {
  await buyGames(config, ownedApps, ownedAppsRealCount, wallet);
}

logger.log('Thanks for using this script!');

process.exit(0);
