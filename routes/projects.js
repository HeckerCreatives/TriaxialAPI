const router = require("express").Router()
const { createproject, listprojects, viewprojectdetails, editproject, changeprojectstatus } = require("../controllers/projects")
const { protectsuperadmin, protectemployee, protectmanager, protectusers } = require("../middleware/middleware")

router

    //  #region USERS

    .get("/listprojects", protectmanager, listprojects)
    .get("/viewprojectdetails", protectmanager, viewprojectdetails)
    .get("/changeprojectstatus", protectmanager, changeprojectstatus)
    .post("/createproject", protectmanager, createproject)
    .post("/editproject", protectmanager, editproject)

    //  #endregion

module.exports = router;
