const router = require("express").Router()
const { getinvoicedata, createinvoice, getinvoicelist, approvedenieinvoice, listteamtotalinvoice, listClientTotalInvoice } = require("../controllers/invoice")
const { protectsuperadmin, protectusers, protectemployee, protectmanager, protectfinance, protectalluser } = require("../middleware/middleware")

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

    .get("/listteamtotalinvoice", protectalluser, listteamtotalinvoice)
    .get("/listclienttotalinvoice", protectalluser, listClientTotalInvoice)

module.exports = router;
