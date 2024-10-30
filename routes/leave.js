const router = require("express").Router()
const { calculateleavedays, requestleave, employeeleaverequestlist, superadminleaverequestlist, processleaverequest, leaverequestdata, editrequestleave } = require("../controllers/leave")
const { protectsuperadmin, protectusers, protectemployee } = require("../middleware/middleware")

router

    //  #region USERS

    .get("/calculateleavedays", protectusers, calculateleavedays)

    //  #endregion

    //  #region EMPLOYEE

    .get("/employeeleaverequestlist", protectemployee, employeeleaverequestlist)
    .get("/leaverequestdataemployee", protectemployee, leaverequestdata)
    .post("/requestleave", protectemployee, requestleave)
    .post("/editrequestleave", protectemployee, editrequestleave)

    //  #endregion

    //  #region SUPERADMIN

    .get("/superadminleaverequestlist", protectsuperadmin, superadminleaverequestlist)
    .get("/leaverequestdataadmin", protectsuperadmin, leaverequestdata)
    .post("/superadminprocessleaverequest", protectsuperadmin, processleaverequest)

    //  #endregion

module.exports = router;
