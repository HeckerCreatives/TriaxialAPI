const router = require("express").Router()
const { createteam, listteam, teamsearchlist,listprojectduedates, deleteteams, teamdata, editteam, listownteam, searchteam, listteammembers, listallteams, listteamselect, listprojectduedatessuperadmin, listallteamsforselect, updateteamindexes } = require("../controllers/teams")
const { protectsuperadmin, protecthr, protectmanager, protectemployee, protectfinance, protectalluser } = require("../middleware/middleware")

router

    //  #region SUPERADMIN

    .get("/teamdata", protectsuperadmin, teamdata)
    .get("/teamsearchlist", protectsuperadmin, teamsearchlist)
    .get("/listteam", protectsuperadmin, listteam)
    .get("/listteammembers", protectalluser, listteammembers)
    .post("/createteam", protectsuperadmin, createteam)
    .post("/deleteteams", protectsuperadmin, deleteteams)
    .post("/editteam", protectsuperadmin, editteam)
    .get("/listallteamssa", protectsuperadmin, listallteams)
    .get("/listprojectduedatesa", protectsuperadmin, listprojectduedatessuperadmin)
    

    //  #endregion

    //  #region HR

    .get("/listteamhr", protecthr, listteam)

    //  #endregion

    //  #region MANAGER
    
    .get("/managerlistownteam", protectmanager, listownteam)
    .get("/listprojectduedates", protectmanager, listprojectduedates)
    .get("/managersearchteam", protectmanager, searchteam)
    .get("/listteammembersmanager", protectalluser, listteammembers)

    //  #endregion 

     //  #region EMPLOYEE

     .get("/employeelistownteam", protectemployee, listownteam)
     
     //  #endregion 

     // #region FINANCE
     .get("/listallteamsfn", protectfinance, listallteams)

     // #endregion
      
     .get("/listteamselect", protectalluser, listteamselect)
     .get("/listallteams", protectalluser, listallteams)
     .get("/listteamau", protectalluser, listteam)
     .get("/listallteamsforselect", protectalluser, listallteamsforselect)
     .post("/updateteamindexes", protectalluser, updateteamindexes)

module.exports = router;
