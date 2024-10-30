const router = require("express").Router()
const { listwfhrequestadmin, showdatawfhrequest, approvewfhrequestadmin, listwfhrequestemployee, requestwfhemployee, editrequestwfhemployee, listwfhrequestmanager, approvewfhrequestmanager } = require("../controllers/wfh")
const { protectsuperadmin, protectemployee, protectmanager } = require("../middleware/middleware")

router

    //  #region SUPERADMIN

    .get("/listwfhrequestadmin", protectsuperadmin, listwfhrequestadmin)
    .get("/showdatawfhrequestadmin", protectsuperadmin, showdatawfhrequest)
    .post("/approvewfhrequestadmin", protectsuperadmin, approvewfhrequestadmin)

    //  #endregion

    //  #region EMPLOYEE

    .get("/listwfhrequestemployee", protectemployee, listwfhrequestemployee)
    .get("/showdatawfhrequestemployee", protectsuperadmin, showdatawfhrequest)
    .post("/requestwfhemployee", protectemployee, requestwfhemployee)
    .post("/editrequestwfhemployee", protectemployee, editrequestwfhemployee)

    //  #endregion

    //  #region MANAGER

    .get("/listwfhrequestmanager", protectmanager, listwfhrequestmanager)
    .get("/showdatawfhrequestbyemployee", protectmanager, showdatawfhrequest)
    .post("/approvewfhrequestmanager", protectmanager, approvewfhrequestmanager)

    //  #endregion

module.exports = router;
