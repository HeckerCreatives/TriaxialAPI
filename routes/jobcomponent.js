const router = require("express").Router()
const { createjobcomponent } = require("../controllers/jobcomponent")
const { protectsuperadmin, protectemployee, protectmanager, protectusers } = require("../middleware/middleware")

router

    //  #region MANAGER

    .post("/createjobcomponent", protectmanager, createjobcomponent)

    //  #endregion

module.exports = router;
