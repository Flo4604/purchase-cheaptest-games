// LEGACY shim for the reference CLI only. New code (engine) uses `db` directly
// from @psg/db — do not grow this layer.
import { activatedKey, db } from "@psg/db";
import { desc, eq } from "drizzle-orm";

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

const getActivatedKeysByAccount = async (accountId) =>
	db
		.select()
		.from(activatedKey)
		.where(eq(activatedKey.accountId, accountId))
		.orderBy(desc(activatedKey.activatedAt));

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
