const router = require("express").Router()
const { listwfhrequestadmin, showdatawfhrequest, approvewfhrequestadmin, listwfhrequestemployee, requestwfhemployee, editrequestwfhemployee, listwfhrequestmanager, approvewfhrequestmanager, deleterequestwfhemployee } = require("../controllers/wfh")
const { protectsuperadmin, protectemployee, protectmanager, protectusers } = require("../middleware/middleware")

router

    //  #region SUPERADMIN

    .get("/listwfhrequestadmin", protectsuperadmin, listwfhrequestadmin)
    .get("/showdatawfhrequestadmin", protectsuperadmin, showdatawfhrequest)
    .post("/approvewfhrequestadmin", protectsuperadmin, approvewfhrequestadmin)

    //  #endregion

    //  #region USERS

    .get("/listwfhrequest", protectusers, listwfhrequestemployee)
    .get("/showdatawfhrequest", protectusers, showdatawfhrequest)
    .post("/requestwfh", protectusers, requestwfhemployee)
    .post("/editrequestwfh", protectusers, editrequestwfhemployee)
    .post("/deleterequestwfh", protectusers, deleterequestwfhemployee)

    //  #endregion

    //  #region MANAGER

    .get("/listwfhrequestmanager", protectmanager, listwfhrequestmanager)
    .get("/showdatawfhrequestbyemployee", protectmanager, showdatawfhrequest)
    .post("/approvewfhrequestmanager", protectmanager, approvewfhrequestmanager)

    //  #endregion

module.exports = router;
