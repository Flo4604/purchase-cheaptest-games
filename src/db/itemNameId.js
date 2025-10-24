import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Get item name ID from database
 * @param {number} appId - The Steam app ID
 * @param {string} marketHashName - The market hash name
 * @returns {Promise<string|null>} - The name ID or null if not found
 */
const getItemNameId = async (appId, marketHashName) => {
    const item = await prisma.itemNameId.findUnique({
        where: {
            appId_marketHashName: {
                appId,
                marketHashName,
            },
        },
    });

    return item?.nameId || null;
};

/**
 * Store item name ID in database
 * @param {number} appId - The Steam app ID
 * @param {string} marketHashName - The market hash name
 * @param {string} nameId - The item name ID
 * @returns {Promise<Object>} - The stored record
 */
const storeItemNameId = async (appId, marketHashName, nameId) => {
    return prisma.itemNameId.upsert({
        where: {
            appId_marketHashName: {
                appId,
                marketHashName,
            },
        },
        update: {
            nameId,
        },
        create: {
            appId,
            marketHashName,
            nameId,
        },
    });
};

export { getItemNameId, storeItemNameId };
