const asyncHandler = require("../middleware/asyncHandler");
const vendorDiscoveryService = require("../services/vendorDiscovery.service");

exports.listVendors = asyncHandler(async (req, res) => {
  const data = await vendorDiscoveryService.listVendors(req.query);
  res.json({ success: true, data });
});
