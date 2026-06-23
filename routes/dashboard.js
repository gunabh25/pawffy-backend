const express = require("express");
const router = express.Router();
const validate = require("../middleware/validate");
const v = require("../validators");
const dashboardController = require("../controllers/dashboardController");

router.post("/dashboard", validate(v.dashboardSchema), dashboardController.getDashboard);
router.get("/users/:id", dashboardController.getUserById);
router.post("/partners", validate(v.partnersNearbySchema), dashboardController.getPartnersNearby);
router.get("/notifications/:id", dashboardController.getNotificationsById);
router.get("/categories", dashboardController.getActiveCategories);
router.get("/banner", dashboardController.getBanner);

module.exports = router;
