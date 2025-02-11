const router = require("express").Router()
const { employeeliststats, createemployee, employeelist, changepositionemployee, managerlist, employeesearchlist, banemployees, viewemployeedata, editemployees, changepassword, viewteamemployees, getuserdetails, multiplebanunbanuser } = require("../controllers/users")
const { protectsuperadmin, protectusers, protectemployee, protectmanager, protectalluser } = require("../middleware/middleware")

router

    //  #region USERS

    .post("/changepassword", protectusers, changepassword)
    .get("/getuserdetails", protectusers, getuserdetails)

    //  #endregion

    //  #region SUPERADMIN

    .get("/employeeliststats", protectsuperadmin, employeeliststats)
    .get("/employeelist", protectsuperadmin, employeelist)
    .get("/managerlist", protectsuperadmin, managerlist)
    .get("/employeesearchlist", protectsuperadmin, employeesearchlist)
    .get("/viewemployeedata", protectsuperadmin, viewemployeedata)
    .get("/viewteamemployees", protectsuperadmin, viewteamemployees)
    .post("/createemployee", protectsuperadmin, createemployee)
    .post("/changepositionemployee", protectsuperadmin, changepositionemployee)
    .post("/banemployees", protectsuperadmin, banemployees)
    .post("/editemployees", protectsuperadmin, editemployees)

    //  #endregion

    //  #region MANAGER

    
    //  #endregion
    
    //  #region EMPLOYEE
    
    .get("/searchlistemployee", protectemployee, employeesearchlist)
    
    //  #endregion
    
    // #region ALL USER
    .get("/managerlistmanager", protectalluser, managerlist)
    .get("/employeesearchlistmanager", protectalluser, employeesearchlist)
    
    // #endregion
    module.exports = router;
    