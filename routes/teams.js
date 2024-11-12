const router = require("express").Router()
const { createteam, listteam, teamsearchlist, deleteteams, teamdata, editteam, listownteam, searchteam, listteammembers } = require("../controllers/teams")
const { protectsuperadmin, protecthr, protectmanager, protectemployee } = require("../middleware/middleware")

router

    //  #region SUPERADMIN

    .get("/teamdata", protectsuperadmin, teamdata)
    .get("/teamsearchlist", protectsuperadmin, teamsearchlist)
    .get("/listteam", protectsuperadmin, listteam)
    .get("/listteammembers", protectsuperadmin, listteammembers)
    .post("/createteam", protectsuperadmin, createteam)
    .post("/deleteteams", protectsuperadmin, deleteteams)
    .post("/editteam", protectsuperadmin, editteam)

    //  #endregion

    //  #region HR

    .get("/listteamhr", protecthr, listteam)

    //  #endregion

    //  #region MANAGER

    .get("/managerlistownteam", protectmanager, listownteam)
    .get("/managersearchteam", protectmanager, searchteam)
    .get("/listteammembersmanager", protectmanager, listteammembers)

    //  #endregion 

     //  #region EMPLOYEE

     .get("/employeelistownteam", protectemployee, listownteam)

     //  #endregion 

module.exports = router;
