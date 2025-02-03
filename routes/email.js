const router = require("express").Router()
const { listemail, unreadEmails, reademail, deletereceiverfromemail } = require("../controllers/email")
const { protectsuperadmin, protectemployee, protectmanager, protectusers } = require("../middleware/middleware")

router

    //  #region USERS

    .get("/listemail", protectusers, listemail)
    .get("/unreademail", protectusers, unreadEmails)
    .get("/reademail", protectusers, reademail)
    .get("/deletereceiverfromemail", protectusers, deletereceiverfromemail)
    //  #endregion

module.exports = router;
