const router = require("express").Router()
const { createteam, listteam } = require("../controllers/teams")
const { protectsuperadmin } = require("../middleware/middleware")

router

    //  #region SUPERADMIN

    .get("/listteam", protectsuperadmin, listteam)
    .post("/createteam", protectsuperadmin, createteam)

    //  #endregion

module.exports = router;
