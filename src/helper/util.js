import { promisify } from 'util';

const roundPrice = (price) => Math.round(price * 100) / 100;

const removeDuplicates = (array) => Array.from(new Set(array));

const sleep = (ms) => promisify(setTimeout)(ms);

const asyncFilter = async (arr, predicate) => Promise.all(arr.map(predicate))
  .then((results) => arr.filter((_v, index) => results[index]));

export {
  roundPrice, removeDuplicates, sleep, asyncFilter,
};
