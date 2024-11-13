const router = require("express").Router()
const { getinvoicedata } = require("../controllers/invoice")
const { protectsuperadmin, protectusers, protectemployee, protectmanager } = require("../middleware/middleware")

router

    //  #region MANAGER

    .get("/getinvoicedatamanager", protectmanager, getinvoicedata)

    //  #endregion

    //  #region EMPLOYEE

    .get("/getinvoicedataemployee", protectemployee, getinvoicedata)

    //  #endregion

module.exports = router;
