const router = require("express").Router()
const { getinvoicedata, createinvoice, getinvoicelist, approvedenieinvoice } = require("../controllers/invoice")
const { protectsuperadmin, protectusers, protectemployee, protectmanager, protectfinance } = require("../middleware/middleware")

router

    //  #region MANAGER

    .get("/getinvoicedatamanager", protectmanager, getinvoicedata)
    .post("/createinvoicemanager", protectmanager, createinvoice)

    //  #endregion

    //  #region EMPLOYEE

    .get("/getinvoicedataemployee", protectemployee, getinvoicedata)
    .post("/createinvoicemployee", protectemployee, createinvoice)

    //  #endregion

    //  #region FINANCE

    .get("/getinvoicelist", protectfinance, getinvoicelist)
    .post("/approvedenieinvoice", protectfinance, approvedenieinvoice)

    //  #endregion

    //  #region SUPERADMIN

    .get("/getinvoicelistsa", protectsuperadmin, getinvoicelist)

    //  #endregion

module.exports = router;
