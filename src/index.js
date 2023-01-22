/* eslint-disable no-await-in-loop */
import terminalImage from 'terminal-image';
import {
  addAccount,
  addGamesToCart,
  BADGES as badges,
  checkoutCart,
  chooseAccount,
  doLogin,
  getOwnedApps,
  getOwnedAppsCount,
  getWalletBalance,
  loadCheapestGames,
  setupConfig,
  showGamesToBuy,
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
  await addGamesToCart(appList);

  await checkoutCart();
}

logger.log('Thanks for using this script!');

process.exit(0);
