const router = require("express").Router()
const { createclients, clientlist, getclientdata, deleteclients, editclient, clientlistall } = require("../controllers/clients")
const { protectsuperadmin, protectmanager, protectfinance } = require("../middleware/middleware")

router

    //  #region SUPERADMIN

    .get("/getclientdata", protectsuperadmin, getclientdata)
    .get("/clientlist", protectsuperadmin, clientlist)
    .post("/createclients", protectsuperadmin, createclients)
    .post("/deleteclients", protectsuperadmin, deleteclients)
    .post("/editclient", protectsuperadmin, editclient)

    //  #endregion

    //  #region MANAGER

    .get("/clientlistallmanager", protectmanager, clientlistall)

    //  #endregion

    .get("/clientlistfn", protectfinance, clientlist)


module.exports = router;
