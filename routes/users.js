const router = require("express").Router()
const { employeeliststats, createemployee, employeelist, changepositionemployee, managerlist } = require("../controllers/users")
const { protectsuperadmin } = require("../middleware/middleware")

router

    //  #region SUPERADMIN

    .get("/employeeliststats", protectsuperadmin, employeeliststats)
    .get("/employeelist", protectsuperadmin, employeelist)
    .get("/managerlist", protectsuperadmin, managerlist)
    .post("/createemployee", protectsuperadmin, createemployee)
    .post("/changepositionemployee", protectsuperadmin, changepositionemployee)

    //  #endregion

module.exports = router;
