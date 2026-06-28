import { desc, eq } from "drizzle-orm";
import { db } from "./client.js";
import { activatedKey } from "./schema.js";

/**
 * Check if a key has already been activated (consumed)
 * @param {string} productKey - The product key to check
 * @returns {Promise<boolean>} - True if key was already activated/consumed
 */
const isKeyActivated = async (productKey) => {
	const rows = await db
		.select()
		.from(activatedKey)
		.where(eq(activatedKey.productKey, productKey));
	const key = rows[0];

	// Key is considered "activated" only if it was successfully consumed; keys
	// with success: true shouldn't be retried.
	return key != null && key.success === true;
};

/**
 * Store an activated key in the database (upsert on productKey)
 * @param {string} productKey - The product key
 * @param {number} accountId - The account ID
 * @param {boolean} success - Whether the activation was successful
 * @param {string|null} packageId - The package ID (if successful)
 * @param {string|null} errorMessage - The error message (if failed)
 * @returns {Promise<Object>} - The stored key record
 */
const storeActivatedKey = async (
	productKey,
	accountId,
	success,
	packageId = null,
	errorMessage = null,
) => {
	const rows = await db
		.insert(activatedKey)
		.values({ productKey, accountId, success, packageId, errorMessage })
		.onConflictDoUpdate({
			target: activatedKey.productKey,
			set: {
				accountId,
				success,
				packageId,
				errorMessage,
				activatedAt: new Date(),
			},
		})
		.returning();
	return rows[0];
};

/**
 * Get all activated keys for an account
 * @param {number} accountId - The account ID
 * @returns {Promise<Array>} - Array of activated keys
 */
const getActivatedKeysByAccount = async (accountId) =>
	db
		.select()
		.from(activatedKey)
		.where(eq(activatedKey.accountId, accountId))
		.orderBy(desc(activatedKey.activatedAt));

/**
 * Get activation statistics for an account
 * @param {number} accountId - The account ID
 * @returns {Promise<Object>} - Statistics object with success/failure counts
 */
const getActivationStats = async (accountId) => {
	const allKeys = await db
		.select()
		.from(activatedKey)
		.where(eq(activatedKey.accountId, accountId));

	const successCount = allKeys.filter((key) => key.success).length;
	const failureCount = allKeys.filter((key) => !key.success).length;

	return {
		total: allKeys.length,
		success: successCount,
		failure: failureCount,
	};
};

export {
	isKeyActivated,
	storeActivatedKey,
	getActivatedKeysByAccount,
	getActivationStats,
};
