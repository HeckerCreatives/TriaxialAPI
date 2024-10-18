const router = require("express").Router()
const { createclients, clientlist } = require("../controllers/clients")
const { protectsuperadmin } = require("../middleware/middleware")

router

    //  #region SUPERADMIN

    .get("/clientlist", protectsuperadmin, clientlist)
    .post("/createclients", protectsuperadmin, createclients)

    //  #endregion

module.exports = router;
