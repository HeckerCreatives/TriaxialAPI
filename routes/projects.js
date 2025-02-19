const router = require("express").Router()
const { createproject, createprojectvariation, listprojects, viewprojectdetails, editproject, changeprojectstatus, saprojectlist, listprojectsemployee, listallprojects, teamprojectlist, listprojectsuperadmin } = require("../controllers/projects")
const { protectsuperadmin, protectemployee, protectmanager, protectusers, protectfinance, protectalluser } = require("../middleware/middleware")

router

    //  #region USERS

    .get("/listallprojects", protectusers, listallprojects)
    .get("/listprojects", protectusers, listprojects)

    //  #endregion

    //  #region MANAGER

    .get("/viewprojectdetails", protectmanager, viewprojectdetails)
    .get("/teamprojectlistmanager", protectmanager, teamprojectlist)
    .post("/changeprojectstatus", protectmanager, changeprojectstatus)
    .post("/createproject", protectmanager, createproject)
    .post("/createprojectvariation", protectmanager, createprojectvariation)
    
    .post("/editproject", protectmanager, editproject)

    //  #endregion

    //  #region SUPERADMIN
    .get("/listprojectsa", protectsuperadmin, listprojectsuperadmin)
    .get("/saprojectlist", protectalluser, saprojectlist)
    .get("/teamprojectlist", protectsuperadmin, teamprojectlist)

    //  #endregion

    //  #region EMPLOYEE

    .get("/listprojectsemployee", protectemployee, listprojectsemployee)

    //  #endregion

    // #region FINANCE
    .get("/fnprojectlist", protectfinance, saprojectlist)
    // #endregion
module.exports = router;
