import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const getAccounts = async () => prisma.account.findMany();

const getAccount = async (id) => prisma.account.findFirst({
  where: {
    id,
  },
});

const storeAccount = async (username, password) => prisma.account.create({
  data: {
    username,
    password,
  },
});

const updateOAuthToken = async (id, oAuthToken) => prisma.account.update({
  where: {
    id,
  },
  data: {
    oAuthToken,
  },
});

const updateSteamGuard = async (id, steamGuard) => prisma.account.update({
  where: {
    id,
  },
  data: {
    steamGuard,
  },
});

const updateConfig = async (id, limit, usage, maxPrice, optionsFlag) => prisma.account.update({
  where: {
    id,
  },
  data: {
    limit: `${limit}`,
    usage,
    maxPrice: Number(maxPrice),
    optionsFlag,
  },
});

const updateAccount = async (id, username, password) => {
  const account = await getAccount(id);
  if (account) {
    return prisma.account.update({
      where: {
        id,
      },
      data: {
        username,
        password,
      },
    });
  }
  return null;
};

export {
  getAccounts,
  getAccount,
  storeAccount,
  updateOAuthToken,
  updateConfig,
  updateAccount,
  updateSteamGuard,
};
