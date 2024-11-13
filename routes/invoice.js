const router = require("express").Router()
const { getinvoicedata, createinvoice, getinvoicelist } = require("../controllers/invoice")
const { protectsuperadmin, protectusers, protectemployee, protectmanager, protectfinance } = require("../middleware/middleware")

router

    //  #region MANAGER

    .get("/getinvoicedatamanager", protectmanager, getinvoicedata)
    .post("/createinvoicemanager", createinvoice)

    //  #endregion

    //  #region EMPLOYEE

    .get("/getinvoicedataemployee", protectemployee, getinvoicedata)
    .post("/createinvoicemployee", protectemployee, createinvoice)

    //  #endregion

    //  #region FINANCE

    .get("/getinvoicelist", protectfinance, getinvoicelist)

    //  #endregion

module.exports = router;
