const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");

function formatAddress(row) {
  return {
    id: row.id,
    label: row.label,
    address: row.address,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function syncDefaultToUserProfile(userId, addressRow) {
  if (!addressRow?.isDefault) return;

  await prisma.user.update({
    where: { id: userId },
    data: {
      address: addressRow.address,
      city: addressRow.city || null,
      state: addressRow.state || null,
      latitude: addressRow.latitude ?? null,
      longitude: addressRow.longitude ?? null,
    },
  });
}

async function listAddresses(userId) {
  const rows = await prisma.userAddress.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  return rows.map(formatAddress);
}

async function createAddress(userId, data) {
  const created = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.userAddress.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const isFirst = (await tx.userAddress.count({ where: { userId } })) === 0;
    const shouldDefault = data.isDefault || isFirst;

    const row = await tx.userAddress.create({
      data: {
        userId,
        label: data.label || null,
        address: data.address,
        city: data.city || null,
        state: data.state || null,
        pincode: data.pincode || null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        isDefault: shouldDefault,
      },
    });

    if (shouldDefault) {
      await tx.user.update({
        where: { id: userId },
        data: {
          address: row.address,
          city: row.city,
          state: row.state,
          latitude: row.latitude,
          longitude: row.longitude,
        },
      });
    }

    return row;
  });

  return formatAddress(created);
}

async function updateAddress(userId, addressId, data) {
  const existing = await prisma.userAddress.findFirst({
    where: { id: addressId, userId },
  });
  if (!existing) throw new AppError("Address not found", 404);

  const updated = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.userAddress.updateMany({
        where: { userId, isDefault: true, NOT: { id: addressId } },
        data: { isDefault: false },
      });
    }

    const row = await tx.userAddress.update({
      where: { id: addressId },
      data: {
        ...(data.label !== undefined ? { label: data.label || null } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.city !== undefined ? { city: data.city || null } : {}),
        ...(data.state !== undefined ? { state: data.state || null } : {}),
        ...(data.pincode !== undefined ? { pincode: data.pincode || null } : {}),
        ...(data.latitude !== undefined ? { latitude: data.latitude ?? null } : {}),
        ...(data.longitude !== undefined ? { longitude: data.longitude ?? null } : {}),
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
      },
    });

    if (row.isDefault) {
      await tx.user.update({
        where: { id: userId },
        data: {
          address: row.address,
          city: row.city,
          state: row.state,
          latitude: row.latitude,
          longitude: row.longitude,
        },
      });
    }

    return row;
  });

  return formatAddress(updated);
}

async function setDefaultAddress(userId, addressId) {
  const existing = await prisma.userAddress.findFirst({
    where: { id: addressId, userId },
  });
  if (!existing) throw new AppError("Address not found", 404);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.userAddress.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });

    const row = await tx.userAddress.update({
      where: { id: addressId },
      data: { isDefault: true },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        address: row.address,
        city: row.city,
        state: row.state,
        latitude: row.latitude,
        longitude: row.longitude,
      },
    });

    return row;
  });

  return formatAddress(updated);
}

async function deleteAddress(userId, addressId) {
  const existing = await prisma.userAddress.findFirst({
    where: { id: addressId, userId },
  });
  if (!existing) throw new AppError("Address not found", 404);

  await prisma.$transaction(async (tx) => {
    await tx.userAddress.delete({ where: { id: addressId } });

    if (existing.isDefault) {
      const nextDefault = await tx.userAddress.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
      });

      if (nextDefault) {
        await tx.userAddress.update({
          where: { id: nextDefault.id },
          data: { isDefault: true },
        });
        await tx.user.update({
          where: { id: userId },
          data: {
            address: nextDefault.address,
            city: nextDefault.city,
            state: nextDefault.state,
            latitude: nextDefault.latitude,
            longitude: nextDefault.longitude,
          },
        });
      } else {
        await tx.user.update({
          where: { id: userId },
          data: { address: null, city: null, state: null, latitude: null, longitude: null },
        });
      }
    }
  });
}

module.exports = {
  listAddresses,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
};
