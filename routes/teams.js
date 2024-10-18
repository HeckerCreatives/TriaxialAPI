const router = require("express").Router()
const { createteam, listteam, teamsearchlist, deleteteams } = require("../controllers/teams")
const { protectsuperadmin } = require("../middleware/middleware")

router

    //  #region SUPERADMIN

    .get("/teamsearchlist", protectsuperadmin, teamsearchlist)
    .get("/listteam", protectsuperadmin, listteam)
    .post("/createteam", protectsuperadmin, createteam)
    .post("/deleteteams", protectsuperadmin, deleteteams)

    //  #endregion

module.exports = router;
