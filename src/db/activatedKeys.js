import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Check if a key has already been activated (consumed)
 * @param {string} productKey - The product key to check
 * @returns {Promise<boolean>} - True if key was already activated/consumed
 */
const isKeyActivated = async (productKey) => {
    const key = await prisma.activatedKey.findUnique({
        where: {
            productKey,
        },
    });

    // Key is considered "activated" if it was successfully consumed
    // This includes: successfully activated, already owned, or used by another account
    // Keys with success: true are consumed and shouldn't be retried
    return key !== null && key.success === true;
};

/**
 * Store an activated key in the database
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
    return prisma.activatedKey.upsert({
        where: {
            productKey,
        },
        update: {
            accountId,
            success,
            packageId,
            errorMessage,
            activatedAt: new Date(),
        },
        create: {
            productKey,
            accountId,
            success,
            packageId,
            errorMessage,
        },
    });
};

/**
 * Get all activated keys for an account
 * @param {number} accountId - The account ID
 * @returns {Promise<Array>} - Array of activated keys
 */
const getActivatedKeysByAccount = async (accountId) => {
    return prisma.activatedKey.findMany({
        where: {
            accountId,
        },
        orderBy: {
            activatedAt: "desc",
        },
    });
};

/**
 * Get activation statistics for an account
 * @param {number} accountId - The account ID
 * @returns {Promise<Object>} - Statistics object with success/failure counts
 */
const getActivationStats = async (accountId) => {
    const allKeys = await prisma.activatedKey.findMany({
        where: {
            accountId,
        },
    });

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
