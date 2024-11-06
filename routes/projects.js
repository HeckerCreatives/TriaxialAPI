const router = require("express").Router()
const { createproject, listprojects } = require("../controllers/projects")
const { protectsuperadmin, protectemployee, protectmanager, protectusers } = require("../middleware/middleware")

router

    //  #region USERS

    .get("/listprojects", protectmanager, listprojects)
    .post("/createproject", protectmanager, createproject)

    //  #endregion

module.exports = router;
