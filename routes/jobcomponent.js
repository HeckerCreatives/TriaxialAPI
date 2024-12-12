const router = require("express").Router()
const { createjobcomponent, listjobcomponent, editstatushours, yourworkload, editjobcomponentdetails, editjobmanagercomponents, editalljobcomponentdetails, getjobcomponentdashboard, individualworkload, getmanagerjobcomponentdashboard, getsuperadminjobcomponentdashboard, completejobcomponent, viewduedatesgraph, getjobcomponentindividualrequest } = require("../controllers/jobcomponent")
const { protectsuperadmin, protectemployee, protectmanager, protectusers, protectalluser } = require("../middleware/middleware")

router

    //  #region USER

    .get("/yourworkload", protectusers, yourworkload)

    //  #endregion

    //  #region MANAGER

    .get("/getmanagerjobcomponentdashboard", protectmanager, getmanagerjobcomponentdashboard)
    .get("/getindividualrequests", protectmanager, getmanagerjobcomponentdashboard)
    .get("/listjobcomponent", protectmanager, listjobcomponent)
    .get("/viewduedatesgraph", protectmanager, viewduedatesgraph)
    .post("/createjobcomponent", protectmanager, createjobcomponent)
    .get("/completejobcomponent", protectmanager, completejobcomponent)
    .post("/editstatushours", protectmanager, editstatushours)
    .post("/editjobcomponentdetails", protectmanager, editjobcomponentdetails)
    .post("/editjobmanagercomponents", protectmanager, editjobmanagercomponents)
    .post("/editalljobcomponentdetails", protectmanager, editalljobcomponentdetails)
    .get("/getjobcomponentdashboardmanager", protectmanager, getjobcomponentdashboard)
    .get("/individualworkloadmanager", protectmanager, individualworkload)
    
    //  #endregion
    
    //  #region EMPLOYEE
    
    .get("/listjobcomponentemployee", protectemployee, listjobcomponent)
    .post("/editstatushoursemployee", protectemployee, editstatushours)
    .post("/editjobmanagercomponentsjbmngr", protectemployee, editjobmanagercomponents)
    
    //  #endregion
    
    //  #region SUPERADMIN
    
    .get("/listjobcomponentsa", protectsuperadmin, listjobcomponent)
    .get("/getjobcomponentdashboard", protectsuperadmin, getjobcomponentdashboard)
    .get("/individualworkloadsuperadmin", protectsuperadmin, individualworkload)
    .get("/getsuperadminjobcomponentdashboard", protectsuperadmin, getsuperadminjobcomponentdashboard)
    
    //  #endregion

    //  #region ALL USERS
    .get("/getjobcomponentindividualrequest", protectalluser, getjobcomponentindividualrequest)
    
    // #endregion
    module.exports = router;
    