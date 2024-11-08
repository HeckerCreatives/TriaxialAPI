const router = require("express").Router()
const { createproject, listprojects, viewprojectdetails, editproject, changeprojectstatus, saprojectlist, listprojectsemployee } = require("../controllers/projects")
const { protectsuperadmin, protectemployee, protectmanager, protectusers } = require("../middleware/middleware")

router

    //  #region USERS

    .get("/listprojects", protectmanager, listprojects)
    .get("/viewprojectdetails", protectmanager, viewprojectdetails)
    .get("/changeprojectstatus", protectmanager, changeprojectstatus)
    .post("/createproject", protectmanager, createproject)
    .post("/editproject", protectmanager, editproject)

    //  #endregion

    //  #region SUPERADMIN

    .get("/saprojectlist", protectsuperadmin, saprojectlist)

    //  #endregion

    //  #region EMPLOYEE

    .get("/listprojectsemployee", protectemployee, listprojectsemployee)

    //  #endregion

module.exports = router;
