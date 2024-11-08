const router = require("express").Router()
const { createjobcomponent, listjobcomponent, editstatushours, yourworkload, editjobcomponentdetails, editjobmanagercomponents } = require("../controllers/jobcomponent")
const { protectsuperadmin, protectemployee, protectmanager, protectusers } = require("../middleware/middleware")

router

    //  #region USER

    .get("/yourworkload", protectusers, yourworkload)

    //  #endregion

    //  #region MANAGER

    .get("/listjobcomponent", protectmanager, listjobcomponent)
    .post("/createjobcomponent", protectmanager, createjobcomponent)
    .post("/editstatushours", protectmanager, editstatushours)
    .post("/editjobcomponentdetails", protectmanager, editjobcomponentdetails)
    .post("/editjobmanagercomponents", protectmanager, editjobmanagercomponents)

    //  #endregion

    //  #region EMPLOYEE

    .get("/listjobcomponentemployee", protectemployee, listjobcomponent)
    .post("/editstatushoursemployee", protectemployee, editstatushours)

    //  #endregion

    //  #region SUPERADMIN

    .get("/listjobcomponentsa", protectsuperadmin, listjobcomponent)

    //  #endregion

module.exports = router;
