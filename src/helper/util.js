import { promisify } from "util";

const roundPrice = (price) => Math.round(price * 100) / 100;

const removeDuplicates = (array) => Array.from(new Set(array));

const sleep = (ms) => promisify(setTimeout)(ms);

const asyncFilter = async (arr, predicate) =>
	Promise.all(arr.map(predicate)).then((results) =>
		arr.filter((_v, index) => results[index]),
	);

const toCents = (price) => String(Math.round(price * 100)).replace(/,|\./g, "");

const getPriceWithoutFees = (price) =>
	parseFloat(price) - parseFloat(price) * 0.13043478261;

export {
	roundPrice,
	removeDuplicates,
	sleep,
	asyncFilter,
	toCents,
	getPriceWithoutFees,
};
