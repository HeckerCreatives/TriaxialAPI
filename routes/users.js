const router = require("express").Router()
const { employeeliststats, createemployee, employeelist, changepositionemployee, managerlist, employeesearchlist, banemployees, viewemployeedata, editemployees } = require("../controllers/users")
const { protectsuperadmin } = require("../middleware/middleware")

router

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
