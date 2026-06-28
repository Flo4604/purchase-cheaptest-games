import { promisify } from "node:util";

export const roundPrice = (price: number): number =>
	Math.round(price * 100) / 100;

export const removeDuplicates = <T>(array: T[]): T[] =>
	Array.from(new Set(array));

export const sleep = (ms: number): Promise<void> =>
	promisify(setTimeout)(ms) as unknown as Promise<void>;

export const asyncFilter = async <T>(
	arr: T[],
	predicate: (value: T, index: number) => unknown | Promise<unknown>,
): Promise<T[]> =>
	Promise.all(arr.map(predicate)).then((results) =>
		arr.filter((_v, index) => results[index]),
	);

export const toCents = (price: number | string): string =>
	String(Math.round(Number(price) * 100)).replace(/,|\./g, "");

export const getPriceWithoutFees = (price: number | string): number =>
	Number.parseFloat(String(price)) -
	Number.parseFloat(String(price)) * 0.13043478261;
