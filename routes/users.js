const router = require("express").Router()
const { employeeliststats, createemployee, employeelist, changepositionemployee, managerlist, employeesearchlist, banemployees, viewemployeedata, editemployees, changepassword } = require("../controllers/users")
const { protectsuperadmin, protectusers } = require("../middleware/middleware")

router

    //  #region USERS

    .post("/changepassword", protectusers, changepassword)

    //  #endregion

    //  #region SUPERADMIN

    .get("/employeeliststats", protectsuperadmin, employeeliststats)
    .get("/employeelist", protectsuperadmin, employeelist)
    .get("/managerlist", protectsuperadmin, managerlist)
    .get("/employeesearchlist", protectsuperadmin, employeesearchlist)
    .get("/viewemployeedata", protectsuperadmin, viewemployeedata)
    .post("/createemployee", protectsuperadmin, createemployee)
    .post("/changepositionemployee", protectsuperadmin, changepositionemployee)
    .post("/banemployees", protectsuperadmin, banemployees)
    .post("/editemployees", protectsuperadmin, editemployees)

    //  #endregion

module.exports = router;
