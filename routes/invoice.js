const router = require("express").Router()
const { getinvoicedata, createinvoice } = require("../controllers/invoice")
const { protectsuperadmin, protectusers, protectemployee, protectmanager } = require("../middleware/middleware")

router

    //  #region MANAGER

    .get("/getinvoicedatamanager", protectmanager, getinvoicedata)
    .post("/createinvoicemanager", protectmanager, createinvoice)

    //  #endregion

    //  #region EMPLOYEE

    .get("/getinvoicedataemployee", protectemployee, getinvoicedata)
    .post("/createinvoicemployee", protectemployee, createinvoice)

    //  #endregion

module.exports = router;
