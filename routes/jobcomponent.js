const router = require("express").Router()
const { createjobcomponent, listjobcomponent, editstatushours, yourworkload, editjobcomponentdetails, editjobmanagercomponents, editalljobcomponentdetails, getjobcomponentdashboard, individualworkload, getmanagerjobcomponentdashboard, getsuperadminjobcomponentdashboard, completejobcomponent, viewduedatesgraph, getjobcomponentindividualrequest, listteamjobcomponent, listJobComponentNamesByTeam, archivejobcomponent, listarchivedteamjobcomponent, createvariationjobcomponent, editMultipleStatusHours, editMemberDetails, updateMember, updateMemberNotes } = require("../controllers/jobcomponent")
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
    .post("/createvariationjobcomponent", protectalluser, createvariationjobcomponent)
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
    .get("/getsuperadminjobcomponentdashboard", protectalluser, getsuperadminjobcomponentdashboard)
    .get("/listemployeeindividualrequests", protectalluser, getjobcomponentindividualrequest)
    
    //  #endregion
    
    //  #region ALL USERS
    .post("/editmultiplestatushours", protectalluser, editMultipleStatusHours)
    .get("/getjobcomponentindividualrequest", protectalluser, getjobcomponentindividualrequest)
    .get("/listarchivedteamjobcomponent", protectalluser, listarchivedteamjobcomponent)
    .get("/listteamjobcomponent", protectalluser, listteamjobcomponent)
    .get("/listjobcomponent", protectalluser, listjobcomponent)
    .post("/editstatushours", protectalluser, editstatushours)
    .post("/editjobcomponentdetails", protectalluser, editjobcomponentdetails)
    .post("/editjobmanagercomponents", protectalluser, editjobmanagercomponents)
    .post("/updatemember", protectalluser, updateMember)
    .post("/updatemembernotes", protectalluser, updateMemberNotes)
    .post("/archivejobcomponent", protectalluser, archivejobcomponent)
    
    // #endregion
    module.exports = router;
    