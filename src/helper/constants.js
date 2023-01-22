const HIGHEST_GAME_BADGE = 32;

const EXTRA_OPTIONS = {
  TRADING_CARDS: 1 << 0,
  TRADING_CARDS_LIMITED: 1 << 1,
};

const BADGES = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

const TRANSLATION = {
  amount: 'Buy certain amount of games',
  max: 'Buy games until the wallet is empty',
  money: 'Buy games for a certain amount of money',
  preview: 'Preview how much money it would cost for a certain badge',
  TRADING_CARDS: 'Trading Cards (Only Games that add to count)',
  TRADING_CARDS_LIMITED: 'Trading Cards (All Games)',
};

export {
  EXTRA_OPTIONS,
  HIGHEST_GAME_BADGE,
  BADGES,
  TRANSLATION,
};
