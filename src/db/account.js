import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const getAccounts = async () => prisma.account.findMany();

const getAccount = async (id) => prisma.account.findFirst({
  where: {
    id,
  },
});

const storeAccount = async (username, accessToken, refreshToken) => prisma.account.create({
  data: {
    username,
    accessToken,
    refreshToken,
  },
});

const updateConfig = async (id, limit, usage, maxPrice, priceOptionsFlag) => prisma.account.update({
  where: {
    id,
  },
  data: {
    limit: `${limit}`,
    usage,
    maxPrice: Number(maxPrice),
    priceOptionsFlag,
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
  updateConfig,
  updateAccount,
};
