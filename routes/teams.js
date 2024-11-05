const router = require("express").Router()
const { createteam, listteam, teamsearchlist, deleteteams, teamdata, editteam, listownteam } = require("../controllers/teams")
const { protectsuperadmin, protecthr, protectmanager, protectemployee } = require("../middleware/middleware")

router

    //  #region SUPERADMIN

    .get("/teamdata", protectsuperadmin, teamdata)
    .get("/teamsearchlist", protectsuperadmin, teamsearchlist)
    .get("/listteam", protectsuperadmin, listteam)
    .post("/createteam", protectsuperadmin, createteam)
    .post("/deleteteams", protectsuperadmin, deleteteams)
    .post("/editteam", protectsuperadmin, editteam)

    //  #endregion

    //  #region HR

    .get("/listteamhr", protecthr, listteam)

    //  #endregion

    //  #region MANAGER

    .get("/managerlistownteam", protectmanager, listownteam)

    //  #endregion 

     //  #region EMPLOYEE

     .get("/employeelistownteam", protectemployee, listownteam)

     //  #endregion 

module.exports = router;
