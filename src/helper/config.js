import axios from "axios";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import inquirer from "inquirer";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { updateConfig } from "../db/account";
import logger from "./logger";
import { roundPrice } from "./util";
import {
    HIGHEST_GAME_BADGE,
    EXTRA_OPTIONS,
    BADGES,
    TRANSLATION,
    MAX_PRICES,
} from "./constants";

const fileName = fileURLToPath(import.meta.url);
const directoryName = dirname(fileName);

const confirm = async (message) => {
    const answers = await inquirer.prompt([
        {
            type: "confirm",
            message,
            name: "confirm",
        },
    ]);

    return answers.confirm;
};

const getExtraOptions = (optionsFlag) => {
    const options = [];

    Object.entries(EXTRA_OPTIONS).forEach(([, value]) => {
        Object.entries(value).forEach(([obj, v]) => {
            // eslint-disable-next-line no-bitwise
            if (optionsFlag & v) options.push(TRANSLATION[obj]);
        });
    });

    return options;
};

const sellChoices = async () => {
    const extraOptions = await inquirer.prompt([
        {
            type: "checkbox",
            message: "Choose extra options",
            name: "options",
            choices: Object.entries(EXTRA_OPTIONS.SELLING).map(
                ([key, value]) => ({
                    name: TRANSLATION[key],
                    value,
                    checked: value === EXTRA_OPTIONS.SELLING.ALL_TRADING_CARDS,
                }),
            ),
        },
    ]);

    // eslint-disable-next-line no-bitwise
    const sellOptionsFlag = extraOptions.options.reduce((a, b) => a | b, 0);

    const priceCalculation = await inquirer.prompt([
        {
            type: "list",
            message: "Choose how the script should calculate the price",
            name: "priceCalculation",
            choices: [
                {
                    name: "Remove a fixed amount",
                    value: "fixed",
                },
                {
                    name: "Remove a percentage",
                    value: "percentage",
                },
            ],
        },
    ]);

    const priceToRemoveAnswer = await inquirer.prompt([
        {
            type: "input",
            message: "How much should be removed from the price?",
            name: "priceToRemove",
            default: priceCalculation.priceCalculation === "fixed" ? 0.03 : 1,
            validate: (value) =>
                Number.isNaN(value) ? "Please enter a valid number" : true,
        },
    ]);

    const minPriceAnswer = await inquirer.prompt([
        {
            type: "input",
            message: "What should be the minimum sell price? (in USD)",
            name: "minPrice",
            default: 0,
            validate: (value) =>
                /\d/.test(value) ? true : "Please enter a number",
        },
    ]);

    return {
        mode: "sell",
        sellOptionsFlag,
        minPrice: Number.parseFloat(minPriceAnswer.minPrice) * 100,
        priceToRemove: priceToRemoveAnswer.priceToRemove,
        priceCalculation: priceCalculation.priceCalculation,
    };
};

const gemChoices = async () => {
    const extraOptions = await inquirer.prompt([
        {
            type: "checkbox",
            message: "Choose extra options",
            name: "options",
            choices: Object.entries(EXTRA_OPTIONS.SELLING).map(
                ([key, value]) => ({
                    name: TRANSLATION[key],
                    value,
                    checked: value === EXTRA_OPTIONS.SELLING.ALL_TRADING_CARDS,
                }),
            ),
        },
    ]);

    // eslint-disable-next-line no-bitwise
    const sellOptionsFlag = extraOptions.options.reduce((a, b) => a | b, 0);

    const priceCalculation = await inquirer.prompt([
        {
            type: "list",
            message: "Choose how the script should calculate the price",
            name: "priceCalculation",
            choices: [
                {
                    name: "Remove a fixed amount",
                    value: "fixed",
                },
                {
                    name: "Remove a percentage",
                    value: "percentage",
                },
            ],
        },
    ]);

    const priceToRemoveAnswer = await inquirer.prompt([
        {
            type: "input",
            message: "How much should be removed from the price?",
            name: "priceToRemove",
            default: priceCalculation.priceCalculation === "fixed" ? 0.03 : 1,
            validate: (value) =>
                Number.isNaN(value) ? "Please enter a valid number" : true,
        },
    ]);

    return {
        mode: "sell",
        sellOptionsFlag,
        priceToRemove: priceToRemoveAnswer.priceToRemove,
        priceCalculation: priceCalculation.priceCalculation,
    };
};

const buyChoices = async (account, wallet, ownedGameCount) => {
    const answers = await inquirer.prompt([
        {
            type: "list",
            message: "Choose how the script should work",
            name: "usage",
            choices: [
                {
                    name: "Buy certain amount of games",
                    value: "amount",
                },
                {
                    name: "Buy games until the wallet is empty",
                    checked: true,
                    value: "max",
                },
                {
                    name: "Buy games for a certain amount of money",
                    value: "balance",
                },
                {
                    name: "Preview how much money it would cost for a certain badge",
                    value: "preview",
                },
                {
                    name: "Buy until the next badge",
                    value: "next",
                },
            ],
        },
    ]);

    let limit;
    if (answers.usage === "amount") {
        const answer = await inquirer.prompt([
            {
                type: "input",
                message: "How many games should be bought?",
                name: "amount",
                validate: (value) =>
                    /\d/.test(value) ? true : "Please enter a number",
            },
        ]);
        limit = answer.amount;
    } else if (answers.usage === "balance") {
        const answer = await inquirer.prompt([
            {
                type: "input",
                message: `Which balance amount would you like to spend? (in ${wallet.currency})`,
                name: "amount",
                validate: (value) => {
                    if (Number.isNaN(Number(value)))
                        return "Please enter a number";

                    if (Number(value) > wallet.balance)
                        return `You cant spend more than ${wallet.balance} ${wallet.currency}`;

                    return true;
                },
            },
        ]);

        limit = answer.amount;
    } else if (answers.usage === "preview") {
        const answer = await inquirer.prompt([
            {
                type: "list",
                message: "Choose a badge",
                name: "badge",
                choices: BADGES.filter((i) => i >= ownedGameCount),
            },
        ]);

        limit = answer.badge - ownedGameCount;
    } else if (answers.usage === "next") {
        logger.info(
            `You currently own ${ownedGameCount} games and the next badge is at ${BADGES.find(
                (i) => i >= ownedGameCount,
            )} games. `,
        );
        limit = BADGES.find((i) => i >= ownedGameCount) - ownedGameCount;
    } else {
        limit = 0;
    }

    const maxPrice = await inquirer.prompt([
        {
            type: "input",
            message: `What should be the maximum price for a game? (in ${wallet.currency})`,
            suffix: ` (max ${MAX_PRICES[wallet.currency]})`,
            name: "maxPrice",
            default: 0,
            validate: (value) =>
                /\d/.test(value) &&
                parseFloat(value) <= MAX_PRICES[wallet.currency]
                    ? true
                    : "Please enter a number",
        },
    ]);

    const extraOptions = await inquirer.prompt([
        {
            type: "checkbox",
            message: "Choose extra options",
            name: "options",
            choices: Object.entries(EXTRA_OPTIONS.BUYING).map(
                ([key, value]) => ({
                    name: TRANSLATION[key],
                    value,
                }),
            ),
        },
    ]);

    // go through all the options and create a flag
    // eslint-disable-next-line no-bitwise
    const priceOptionsFlag = extraOptions.options.reduce((a, b) => a | b, 0);

    if (
        answers.usage !== "preview" &&
        (await confirm("Do you want to save these settings?"))
    ) {
        await updateConfig(
            account.id,
            limit,
            answers.usage,
            maxPrice.maxPrice,
            priceOptionsFlag,
        );
    }

    return {
        mode: "buy",
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

    for (const badge of BADGES) {
        if (!existsSync(`${directoryName}/../../assets/badge_${badge}.png`)) {
            writeFileSync(
                `./assets/badge_${badge}.png`,
                await axios
                    .get(
                        `https://community.cloudflare.steamstatic.com/public/images/badges/13_gamecollector/${badge}_54.png?v=4`,
                        { responseType: "arraybuffer" },
                    )
                    .then((response) => response.data),
            );
        }
    }

    if (!existsSync("./debug")) {
        mkdirSync("./debug");
    }

    if (account.limit !== undefined && account.usage !== undefined) {
        const answers = await inquirer.prompt([
            {
                type: "list",
                message:
                    "Would you like to continue with the old config or change it?",
                name: "usage",
                choices: [
                    {
                        name: `Buy games with old config:
            Limit: ${account.limit === "0" ? "∞" : account.limit}
            Usage: ${TRANSLATION[account.usage]}
            Max Price: ${
                account.maxPrice === 0
                    ? "∞"
                    : `${account.maxPrice} ${wallet.currency}`
            }
            Extra options: ${getExtraOptions(account.priceOptionsFlag).join(
                "|",
            )}`,
                        value: "continue",
                        checked: true,
                    },
                    {
                        name: "Edit config",
                        value: "edit",
                    },
                    {
                        name: "Sell Items",
                        value: "sell",
                    },
                    {
                        name: "Clean up Market Listings",
                        value: "cleanup",
                    },
                    {
                        name: "Remove Listings",
                        value: "cleanAll",
                    },
                    {
                        name: "Turn everything into gems",
                        value: "turnIntoGems",
                    },
                    {
                        name: "Redeem Apps",
                        value: "redeemApps",
                    },
                    {
                        name: "Exit",
                        value: "exit",
                    },
                    {
                        name: "Choose a different account",
                        value: "chooseAccount",
                    },
                ],
            },
        ]);

        if (answers.usage === "continue") {
            return {
                mode: "buy",
                limit: account.limit,
                usage: account.usage,
                maxPrice: account.maxPrice,
                priceOptionsFlag: account.priceOptionsFlag,
            };
        }

        if (answers.usage === "sell") {
            return sellChoices(account, wallet);
        }

        if (answers.usage === "edit") {
            return buyChoices(account, wallet, ownedGameCount);
        }

        if (answers.usage === "redeemApps") {
            return redeemAppChoices(account, wallet);
        }

        // if (answers.usage === 'turnIntoGems') {
        //   return gemChoices(account, wallet);
        // }

        return {
            mode: answers.usage,
        };
    }

    return buyChoices(account, wallet, ownedGameCount);
};

const redeemAppChoices = async () => {
    const gameList = await inquirer.prompt([
        {
            type: "input",
            message: "Comma Separated list of AppIDs to redeem",
            name: "list",
            default: 0,
        },
    ]);

    console.log(gameList);

    return {
        mode: "redeemApps",
        list: gameList.list.split(","),
    };
};

const showGamesToBuy = async (games, config, wallet) => {
    const totalPrice = roundPrice(
        games.reduce((acc, game) => acc + game.price, 0),
    );
    const averagePrice = roundPrice(totalPrice / games.length);

    logger.info(
        `We have ${games.length} apps to buy in total for a total price of ${totalPrice} ${wallet.currency} | average price of ${averagePrice} ${wallet.currency}`,
    );

    const stepAnswer = await inquirer.prompt([
        {
            type: "list",
            message: "How should we proceed?",
            name: "usage",
            choices: [
                {
                    name: "Confirm purchase",
                    checked: true,
                    value: "confirm",
                },
                {
                    name: "Select Games to buy",
                    value: "select",
                },
            ],
        },
    ]);

    if (stepAnswer.usage === "confirm") {
        // only add as many games as that fit into the limit
        return games.slice(0, config.limit);
    }

    const answers = await inquirer.prompt([
        {
            type: "checkbox",
            message: "Which games do you want to buy?",
            name: "games",
            choices: games.map((game) => ({
                name: `${game.name} | ${game.price} ${wallet.currency}`,
                value: game,
            })),
        },
    ]);

    return answers.games;
};

export { setupConfig, showGamesToBuy, BADGES };
