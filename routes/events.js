const router = require("express").Router()
const { createevents, listevents, getevents, geteventsusers } = require("../controllers/events")
const { protectsuperadmin, protectusers } = require("../middleware/middleware")

router

    //  #region USERS

    .get("/geteventsusers", protectusers, geteventsusers)

    //  #endregion

    //  #region SUPERADMIN

    .get("/getevents", protectsuperadmin, getevents)
    .get("/listevents", protectsuperadmin, listevents)
    .post("/createevents", protectsuperadmin, createevents)

    //  #endregion

module.exports = router;
