const router = require("express").Router()
const { listemail } = require("../controllers/email")
const { protectsuperadmin, protectemployee, protectmanager, protectusers } = require("../middleware/middleware")

router

    //  #region USERS

    .get("/listemail", protectusers, listemail)

    //  #endregion

module.exports = router;
