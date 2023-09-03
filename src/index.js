/* eslint-disable no-await-in-loop */
import {
  addAccount,
  buyGames,
  chooseAccount,
  doLogin,
  getOwnedApps,
  getOwnedAppsCount,
  getWalletBalance,
  removeOverpricedItems,
  sellItems,
  setupConfig,
  sendZwolofOffer,
  turnIntoGems,
} from './helper';
import { getAccount } from './db/account';
import logger from './helper/logger';
import { getLimitedGames } from './db/games';

let showAccountSelection = true;
let account;

const selectAccount = async () => {
  let accountId;

  do {
    accountId = await chooseAccount();

    if (accountId === -1) {
      await addAccount();
    }
  } while (accountId === -1 || accountId === 0);

  return accountId;
};

// eslint-disable-next-line no-constant-condition
while (true) {
  if (showAccountSelection) {
    account = await getAccount(await selectAccount());

    const {
      sessionId,
    } = await doLogin(account);

    global.sessionId = sessionId;
  }

  const ownedApps = await getOwnedApps(await getLimitedGames());
  const ownedAppsRealCount = await getOwnedAppsCount();
  const wallet = await getWalletBalance();
  const config = await setupConfig(account, wallet, ownedAppsRealCount);

  if (config.mode === 'cleanup') {
    await removeOverpricedItems(wallet, config);
  } else if (config.mode === 'sell') {
    await sellItems(config, wallet);
  } else if (config.mode === 'buy') {
    await buyGames(config, ownedApps, ownedAppsRealCount, wallet);
  } else if (config.mode === 'cleanAll') {
    await removeOverpricedItems(wallet, config, true);
    break;
  } else if (config.mode === 'chooseAccount') {
    showAccountSelection = true;
    // eslint-disable-next-line no-continue
    continue;
  } else if (config.mode === 'turnIntoGems') {
    await turnIntoGems(config, wallet);
  } else if (config.mode === 'custom') {
    await sendZwolofOffer(wallet);
  } else if (config.mode === 'exit') {
    break;
  }

  showAccountSelection = false;
}

logger.log('Thanks for using this script!');

process.exit(0);
