const router = require("express").Router()
const { createevents, listevents, getevents, geteventsusers, editevents, geteventdata, deleteevent } = require("../controllers/events")
const { protectsuperadmin, protectusers, protecthr } = require("../middleware/middleware")

router

    //  #region USERS

    .get("/geteventsusers", protectusers, geteventsusers)

    //  #endregion

    //  #region SUPERADMIN

    .get("/getevents", protectsuperadmin, getevents)
    .get("/listevents", protectsuperadmin, listevents)
    .get("/geteventdata", protectsuperadmin, geteventdata)
    .post("/createevents", protectsuperadmin, createevents)
    .post("/editevents", protectsuperadmin, editevents)
    .post("/deleteevent", protectsuperadmin, deleteevent)

    //  #endregion

    //  #region HR

    .get("/geteventshr", protecthr, getevents)
    .get("/listeventshr", protecthr, listevents)
    .get("/geteventdatahr", protecthr, geteventdata)
    .post("/createeventshr", protecthr, createevents)
    .post("/editeventshr", protecthr, editevents)
    .post("/deleteeventhr", protecthr, deleteevent)

    //  #endregion

module.exports = router;
