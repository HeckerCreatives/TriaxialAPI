const router = require("express").Router()
const { listcomponentprojectinvoice, saveprojectinvoicevalue, listcomponentprojectinvoicesa, savesubconstvalue, listcomponenttotalinvoice, listcomponentclienttotalinvoice, listcomponentprojectinvoicealluser } = require("../controllers/projectinvoice")
const { protectsuperadmin, protectemployee, protectmanager, protectusers, protectfinance, protectalluser } = require("../middleware/middleware")

router

    //  #region USER

    //  #endregion

    //  #region MANAGER

    .get("/managerlistcomponentprojectinvoice", protectalluser, listcomponentprojectinvoice)
    .post("/managersaveprojectinvoicevalue", protectmanager, saveprojectinvoicevalue)
    .post("/managersavesubconstvalue", protectmanager, savesubconstvalue)

    //  #endregion

    //  #region EMPLOYEE

    .get("/employeelistcomponentprojectinvoice", protectemployee, listcomponentprojectinvoice)
    .post("/employeesaveprojectinvoicevalue", protectemployee, saveprojectinvoicevalue)

    //  #endregion

    //  #region SUPERADMIN

    .get("/listcomponentprojectinvoicesa", protectalluser, listcomponentprojectinvoicesa)
    .get("/listcomponenttotalinvoice", protectsuperadmin, listcomponenttotalinvoice)
    .get("/listcomponentclienttotalinvoice", protectsuperadmin, listcomponentclienttotalinvoice)
    
    //  #endregion
    // #region FINANCE
    .get("/listcomponentprojectinvoicefn", protectfinance, listcomponentprojectinvoicesa)
    
    .get("/listcomponentclienttotalinvoicefn", protectalluser, listcomponentclienttotalinvoice)
    .get("/listcomponenttotalinvoicefn", protectalluser, listcomponenttotalinvoice)
    .get("/listcomponentprojectinvoicealluser", protectalluser, listcomponentprojectinvoicealluser)


    // #endregion
module.exports = router;
