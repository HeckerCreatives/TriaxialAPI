const router = require("express").Router()
const { createemployee, employeelist, changepositionemployee } = require("../controllers/users")
const { protectsuperadmin } = require("../middleware/middleware")

router

    //  #region SUPERADMIN

    .get("/employeelist", protectsuperadmin, employeelist)
    .post("/createemployee", protectsuperadmin, createemployee)
    .post("/changepositionemployee", protectsuperadmin, changepositionemployee)

    //  #endregion

module.exports = router;
