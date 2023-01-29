import axios from 'axios';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'fs';
import inquirer from 'inquirer';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { updateConfig } from '../db/account';
import logger from './logger';
import { roundPrice } from './util';
import {
  HIGHEST_GAME_BADGE, EXTRA_OPTIONS, BADGES, TRANSLATION,
} from './constants';

const fileName = fileURLToPath(import.meta.url);
const directoryName = dirname(fileName);

const confirm = async (message) => {
  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      message,
      name: 'confirm',
    },
  ]);

  return answers.confirm;
};

const getExtraOptions = (optionsFlag) => {
  const options = [];

  Object.entries(EXTRA_OPTIONS).forEach(([key, value]) => {
    // eslint-disable-next-line no-bitwise
    if (optionsFlag & value) {
      options.push(TRANSLATION[key]);
    }
  });

  return options;
};

const sellChoices = (account, wallet) => {
  const choices = [
    {
      name: 'Sell all trading cards',
      value: 'all',
    },
  ];

  return {
    mode: 'sell',
  };
};

const buyChoices = async (account, wallet, ownedGameCount) => {
  const answers = await inquirer.prompt([
    {
      type: 'list',
      message: 'Choose how the script should work',
      name: 'usage',
      choices: [
        {
          name: 'Buy certain amount of games',
          value: 'amount',
        },
        {
          name: 'Buy games until the wallet is empty',
          checked: true,
          value: 'max',
        },
        {
          name: 'Buy games for a certain amount of money',
          value: 'balance',
        },
        {
          name: 'Preview how much money it would cost for a certain badge',
          value: 'preview',
        },
        {
          name: 'Buy until the next badge',
          value: 'next',
        },
      ],
    },
  ]);

  let limit;
  if (answers.usage === 'amount') {
    const answer = await inquirer.prompt([
      {
        type: 'input',
        message: 'How many games should be bought?',
        name: 'amount',
        validate: (value) => ((/\d/.test(value)) ? true : 'Please enter a number'),
      }]);
    limit = answer.amount;
  } else if (answers.usage === 'balance') {
    const answer = await inquirer.prompt([
      {
        type: 'input',
        message: `Which balance amount would you like to spend? (in ${wallet.currency})`,
        name: 'amount',
        validate: (value) => {
          if (!/\d/.test(value)) return 'Please enter a number';

          if (Number(value) > wallet.balance) return `You cant spend more than ${wallet.balance} ${wallet.currency}`;

          return true;
        },
      }]);

    limit = answer.amount;
  } else if (answers.usage === 'preview') {
    const answer = await inquirer.prompt([
      {
        type: 'list',
        message: 'Choose a badge',
        name: 'badge',
        choices: BADGES.filter((i) => i >= ownedGameCount),
      },

    ]);

    limit = answer.badge - ownedGameCount;
  } else if (answers.usage === 'next') {
    logger.info(`You currently own ${ownedGameCount} games and the next badge is at ${BADGES.find((i) => i >= ownedGameCount)} games. `);
    limit = BADGES.find((i) => i >= ownedGameCount) - ownedGameCount;
  } else {
    limit = 0;
  }

  const maxPrice = await inquirer.prompt([
    {
      type: 'input',
      message: `What should be the maximum price for a game? (in ${wallet.currency})`,
      suffix: ' (max 120)',
      name: 'maxPrice',
      default: 0,
      validate: (value) => ((/\d/.test(value)) && parseFloat(value) <= 120 ? true : 'Please enter a number'),
    }]);

  const extraOptions = await inquirer.prompt([
    {
      type: 'checkbox',
      message: 'Choose extra options',
      name: 'options',
      choices: Object.entries(EXTRA_OPTIONS).map(
        ([key, value]) => ({ name: TRANSLATION[key], value }),
      ),
    }]);

  // go through all the options and create a flag
  // eslint-disable-next-line no-bitwise
  const priceOptionsFlag = extraOptions.options.reduce((a, b) => a | b, 0);

  if (answers.usage !== 'preview' && await confirm('Do you want to save these settings?')) {
    await updateConfig(account.id, limit, answers.usage, maxPrice.maxPrice, priceOptionsFlag);
  }

  return {
    mode: 'buy',
    usage: answers.usage,
    limit,
    maxPrice: maxPrice.maxPrice,
    priceOptionsFlag,
  };
};

const setupConfig = async (account, wallet, ownedGameCount) => {
  for (let i = 2; i < HIGHEST_GAME_BADGE; i += 1) {
    BADGES.push(i * 1000);
  }

  BADGES.forEach(async (badge) => {
    if (!existsSync(`${directoryName}/../../assets/badge_${badge}.png`)) {
      writeFileSync(
        `./assets/badge_${badge}.png`,
        await axios.get(
          `https://community.cloudflare.steamstatic.com/public/images/badges/13_gamecollector/${badge}_54.png?v=4`,
          { responseType: 'arraybuffer' },
        ).then((response) => response.data),
      );
    }
  });

  if (!existsSync('./debug')) {
    mkdirSync('./debug');
  }

  if (account.limit !== undefined && account.usage !== undefined) {
    // const text =
    const answers = await inquirer.prompt([
      {
        type: 'list',
        message: 'Would you like to continue with the old config or change it?',
        name: 'usage',
        choices: [
          {
            name: `Continue with old config:
            Limit: ${account.limit === '0' ? '∞' : account.limit}
            Usage: ${TRANSLATION[account.usage]}
            Max Price: ${account.maxPrice === 0 ? 'No limit' : `${account.maxPrice} ${wallet.currency}`}
            Extra options: ${getExtraOptions(account.priceOptionsFlag).join('|')}`,
            value: 'continue',
            checked: true,
          },
          {
            name: 'Edit config',
            value: 'edit',
          },
        ],
      },
    ]);

    if (answers.usage === 'continue') {
      return {
        mode: 'buy',
        limit: account.limit,
        usage: account.usage,
        maxPrice: account.maxPrice,
        priceOptionsFlag: account.priceOptionsFlag,
      };
    }
  }

  const answers = await inquirer.prompt([
    {
      type: 'list',
      message: 'What do you want to do?',
      name: 'usage',
      choices: [
        {
          name: 'Buy games',
          value: 'buy',
          checked: true,
        },
        {
          name: 'Sell Trading Cards',
          value: 'sell',
        },
        {
          name: 'Clean up Trading Card Listings',
          value: 'cleanup',
        },
      ],
    },
  ]);

  if (answers.usage === 'sell') {
    return sellChoices(account, wallet);
  }
  if (answers.usage === 'cleanup') {
    return {
      mode: 'cleanup',
    };
  }

  return buyChoices(account, wallet, ownedGameCount);
};

const showGamesToBuy = async (games, wallet) => {
  const totalPrice = roundPrice(games.reduce((acc, game) => acc + game.price, 0));
  const averagePrice = roundPrice(totalPrice / games.length);

  logger.info(`We have ${games.length} apps to buy in total for a total price of ${totalPrice} ${wallet.currency} | average price of ${averagePrice} ${wallet.currency}`);

  const stepAnswer = await inquirer.prompt([
    {
      type: 'list',
      message: 'How should we proceed?',
      name: 'usage',
      choices: [
        {
          name: 'Confirm purchase',
          checked: true,
          value: 'confirm',
        },
        {
          name: 'Select Games to buy',
          value: 'select',
        },
      ],
    },
  ]);

  if (stepAnswer.usage === 'confirm') {
    return games;
  }

  const answers = await inquirer.prompt([
    {
      type: 'checkbox',
      message: 'Which games do you want to buy?',
      name: 'games',
      choices: games.map((game) => ({
        name: `${game.name} | ${game.price} ${wallet.currency}`,
        value: game,
      })),
    },
  ]);

  return answers.games;
};

export {
  setupConfig,
  showGamesToBuy,
  BADGES,
};
