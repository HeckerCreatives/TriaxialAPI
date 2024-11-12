const router = require("express").Router()
const { createproject, listprojects, viewprojectdetails, editproject, changeprojectstatus, saprojectlist, listprojectsemployee, listallprojects, teamprojectlist } = require("../controllers/projects")
const { protectsuperadmin, protectemployee, protectmanager, protectusers } = require("../middleware/middleware")

router

    //  #region USERS

    .get("/listallprojects", protectusers, listallprojects)

    //  #endregion

    //  #region MANAGER

    .get("/listprojects", protectmanager, listprojects)
    .get("/viewprojectdetails", protectmanager, viewprojectdetails)
    .post("/changeprojectstatus", protectmanager, changeprojectstatus)
    .post("/createproject", protectmanager, createproject)
    .post("/editproject", protectmanager, editproject)

    //  #endregion

    //  #region SUPERADMIN

    .get("/saprojectlist", protectsuperadmin, saprojectlist)
    .get("/teamprojectlist", protectsuperadmin, teamprojectlist)

    //  #endregion

    //  #region EMPLOYEE

    .get("/listprojectsemployee", protectemployee, listprojectsemployee)

    //  #endregion

module.exports = router;
