const router = require("express").Router()
const { createclients, clientlist, getclientdata, deleteclients, editclient, clientlistall } = require("../controllers/clients")
const { protectsuperadmin, protectmanager, protectfinance, protectalluser } = require("../middleware/middleware")

router

    //  #region SUPERADMIN

    .get("/getclientdata", protectsuperadmin, getclientdata)
    .get("/clientlist", protectsuperadmin, clientlist)
    .post("/createclients", protectsuperadmin, createclients)
    .post("/deleteclients", protectsuperadmin, deleteclients)
    .post("/editclient", protectsuperadmin, editclient)

    //  #endregion

    //  #region MANAGER

    
    //  #endregion

    // #region FINANCE

    .get("/clientlistfn", protectfinance, clientlist)
    // #endregion

    // #region ALL USER
    .get("/clientlistallmanager", protectalluser, clientlistall)
    // #endregion

module.exports = router;
