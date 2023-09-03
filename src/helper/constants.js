/* eslint-disable no-bitwise */
const HIGHEST_GAME_BADGE = 32;

const EXTRA_OPTIONS = {
  BUYING: {
    TRADING_CARDS: 1 << 0,
    TRADING_CARDS_LIMITED: 1 << 1,
  },
  SELLING: {
    ALL_TRADING_CARDS: 1 << 2,
    NORMAL_TRADING_CARDS: 1 << 3,
    FOIL_TRADING_CARDS: 1 << 4,
  },
};

const MAX_PRICES = {
  ARS: 840,
  TL: 60,
  EUR: 60,

};

const CURRENCY_CODES = {
  ARS: 34,
  TL: 17,
  EUR: 3,
};

const BADGES = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

const TRANSLATION = {
  amount: 'Buy certain amount of games',
  next: 'Buy until the next badge',
  max: 'Buy games until the wallet is empty',
  money: 'Buy games for a certain amount of money',
  preview: 'Preview how much money it would cost for a certain badge',
  TRADING_CARDS: 'Trading Cards (Only Games that add to count)',
  TRADING_CARDS_LIMITED: 'Trading Cards (All Games)',
  FOIL_TRADING_CARDS: 'Foil Trading Cards',
  NORMAL_TRADING_CARDS: 'Normal Trading Cards',
  ALL_TRADING_CARDS: 'All Trading Cards',
};

export {
  EXTRA_OPTIONS,
  HIGHEST_GAME_BADGE,
  BADGES,
  TRANSLATION,
  MAX_PRICES,
  CURRENCY_CODES,
};
