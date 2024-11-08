const router = require("express").Router()
const { createjobcomponent, listjobcomponent, editstatushours } = require("../controllers/jobcomponent")
const { protectsuperadmin, protectemployee, protectmanager, protectusers } = require("../middleware/middleware")

router

    //  #region MANAGER

    .get("/listjobcomponent", protectmanager, listjobcomponent)
    .post("/createjobcomponent", protectmanager, createjobcomponent)
    .post("/editstatushours", protectmanager, editstatushours)

    //  #endregion

    //  #region EMPLOYEE

    .get("/listjobcomponentemployee", protectemployee, listjobcomponent)
    .post("/editstatushoursemployee", protectmanager, protectemployee)

    //  #endregion

    //  #region SUPERADMIN

    .get("/listjobcomponentsa", protectmanager, listjobcomponent)

    //  #endregion

module.exports = router;
