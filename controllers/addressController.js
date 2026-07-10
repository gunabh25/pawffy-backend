const asyncHandler = require("../middleware/asyncHandler");
const addressService = require("../services/address.service");

exports.listAddresses = asyncHandler(async (req, res) => {
  const data = await addressService.listAddresses(req.user.id);
  res.json({ success: true, data });
});

exports.createAddress = asyncHandler(async (req, res) => {
  const data = await addressService.createAddress(req.user.id, req.body);
  res.status(201).json({ success: true, message: "Address saved", data });
});

exports.updateAddress = asyncHandler(async (req, res) => {
  const data = await addressService.updateAddress(req.user.id, req.params.id, req.body);
  res.json({ success: true, message: "Address updated", data });
});

exports.setDefaultAddress = asyncHandler(async (req, res) => {
  const data = await addressService.setDefaultAddress(req.user.id, req.params.id);
  res.json({ success: true, message: "Primary address updated", data });
});

exports.deleteAddress = asyncHandler(async (req, res) => {
  await addressService.deleteAddress(req.user.id, req.params.id);
  res.json({ success: true, message: "Address deleted" });
});
