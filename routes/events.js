const router = require("express").Router()
const { createevents, listevents } = require("../controllers/events")
const { protectsuperadmin } = require("../middleware/middleware")

router

    //  #region SUPERADMIN

    .get("/listevents", protectsuperadmin, listevents)
    .post("/createevents", protectsuperadmin, createevents)

    //  #endregion

module.exports = router;
