const router = require("express").Router()
const { listcomponentprojectinvoice, saveprojectinvoicevalue, listcomponentprojectinvoicesa, savesubconstvalue, listcomponenttotalinvoice, listcomponentclienttotalinvoice } = require("../controllers/projectinvoice")
const { protectsuperadmin, protectemployee, protectmanager, protectusers, protectfinance } = require("../middleware/middleware")

router

    //  #region USER

    //  #endregion

    //  #region MANAGER

    .get("/managerlistcomponentprojectinvoice", protectmanager, listcomponentprojectinvoice)
    .post("/managersaveprojectinvoicevalue", protectmanager, saveprojectinvoicevalue)
    .post("/managersavesubconstvalue", protectmanager, savesubconstvalue)

    //  #endregion

    //  #region EMPLOYEE

    .get("/employeelistcomponentprojectinvoice", protectemployee, listcomponentprojectinvoice)
    .post("/employeesaveprojectinvoicevalue", protectemployee, saveprojectinvoicevalue)

    //  #endregion

    //  #region SUPERADMIN

    .get("/listcomponentprojectinvoicesa", protectsuperadmin, listcomponentprojectinvoicesa)
    .get("/listcomponenttotalinvoice", protectsuperadmin, listcomponenttotalinvoice)
    .get("/listcomponentclienttotalinvoice", protectsuperadmin, listcomponentclienttotalinvoice)
    
    //  #endregion
    // #region FINANCE
    .get("/listcomponenttotalinvoicefn", protectfinance, listcomponenttotalinvoice)
    .get("/listcomponentprojectinvoicefn", protectfinance, listcomponentprojectinvoicesa)
    .get("/listcomponentclienttotalinvoicefn", protectfinance, listcomponentclienttotalinvoice)

    // #endregion
module.exports = router;
