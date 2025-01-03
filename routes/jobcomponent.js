const router = require("express").Router()
const { createjobcomponent, listjobcomponent, editstatushours, yourworkload, editjobcomponentdetails, editjobmanagercomponents, editalljobcomponentdetails, getjobcomponentdashboard, individualworkload, getmanagerjobcomponentdashboard, getsuperadminjobcomponentdashboard, completejobcomponent, viewduedatesgraph, getjobcomponentindividualrequest, listteamjobcomponent, listJobComponentNamesByTeam, archivejobcomponent, listarchivedteamjobcomponent } = require("../controllers/jobcomponent")
const { protectsuperadmin, protectemployee, protectmanager, protectusers, protectalluser } = require("../middleware/middleware")

router

    //  #region USER

    .get("/yourworkload", protectusers, yourworkload)
    .get("/listjobcomponentnamesbyteam", protectusers, listJobComponentNamesByTeam)
    //  #endregion

    //  #region MANAGER

    .get("/getmanagerjobcomponentdashboard", protectalluser, getmanagerjobcomponentdashboard)
    .get("/getindividualrequests", protectalluser, getmanagerjobcomponentdashboard)
    .get("/viewduedatesgraph", protectalluser, viewduedatesgraph)
    .post("/createjobcomponent", protectalluser, createjobcomponent)
    .get("/completejobcomponent", protectalluser, completejobcomponent)
    .post("/editalljobcomponentdetails", protectalluser, editalljobcomponentdetails)
    .get("/getjobcomponentdashboardmanager", protectalluser, getjobcomponentdashboard)
    .get("/individualworkloadmanager", protectalluser, individualworkload)
    
    //  #endregion
    
    //  #region EMPLOYEE
    
    .get("/listjobcomponentemployee", protectalluser, listjobcomponent)
    .post("/editstatushoursemployee", protectalluser, editstatushours)
    .post("/editjobmanagercomponentsjbmngr", protectalluser, editjobmanagercomponents)
    
    //  #endregion
    
    //  #region SUPERADMIN
    
    .get("/listjobcomponentsa", protectsuperadmin, listjobcomponent)
    .get("/getjobcomponentdashboard", protectsuperadmin, getjobcomponentdashboard)
    .get("/individualworkloadsuperadmin", protectsuperadmin, individualworkload)
    .get("/getsuperadminjobcomponentdashboard", protectsuperadmin, getsuperadminjobcomponentdashboard)
    .get("/listemployeeindividualrequests", protectsuperadmin, getjobcomponentindividualrequest)

    //  #endregion
    
    //  #region ALL USERS
    .get("/getjobcomponentindividualrequest", protectalluser, getjobcomponentindividualrequest)
    .get("/listarchivedteamjobcomponent", protectalluser, listarchivedteamjobcomponent)
    .get("/listteamjobcomponent", protectalluser, listteamjobcomponent)
    .get("/listjobcomponent", protectalluser, listjobcomponent)
    .post("/editstatushours", protectalluser, editstatushours)
    .post("/editjobcomponentdetails", protectalluser, editjobcomponentdetails)
    .post("/editjobmanagercomponents", protectalluser, editjobmanagercomponents)
    .post("/archivejobcomponent", protectalluser, archivejobcomponent)
    
    // #endregion
    module.exports = router;
    