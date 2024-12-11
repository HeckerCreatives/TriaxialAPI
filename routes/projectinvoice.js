const router = require("express").Router()
const { listcomponentprojectinvoice, saveprojectinvoicevalue, listcomponentprojectinvoicesa, savesubconstvalue, listcomponenttotalinvoice } = require("../controllers/projectinvoice")
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

    //  #endregion
    // #region FINANCE
    .get("/listcomponentprojectinvoicefn", protectfinance, listcomponentprojectinvoicesa)
    // #endregion
module.exports = router;
