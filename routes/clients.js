const router = require("express").Router()
const { createclients, clientlist, getclientdata, deleteclients, editclient } = require("../controllers/clients")
const { protectsuperadmin } = require("../middleware/middleware")

router

    //  #region SUPERADMIN

    .get("/getclientdata", protectsuperadmin, getclientdata)
    .get("/clientlist", protectsuperadmin, clientlist)
    .post("/createclients", protectsuperadmin, createclients)
    .post("/deleteclients", protectsuperadmin, deleteclients)
    .post("/editclient", protectsuperadmin, editclient)

    //  #endregion

module.exports = router;
