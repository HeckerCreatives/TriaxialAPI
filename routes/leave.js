const router = require("express").Router()
const { calculateleavedays, requestleave, employeeleaverequestlist, superadminleaverequestlist, processleaverequest } = require("../controllers/leave")
const { protectsuperadmin, protectusers, protectemployee } = require("../middleware/middleware")

router

    //  #region USERS

    .get("/calculateleavedays", protectusers, calculateleavedays)

    //  #endregion

    //  #region EMPLOYEE

    .get("/employeeleaverequestlist", protectusers, employeeleaverequestlist)
    .post("/requestleave", protectusers, requestleave)

    //  #endregion

    //  #region SUPERADMIN

    .get("/superadminleaverequestlist", protectsuperadmin, superadminleaverequestlist)
    .post("/superadminprocessleaverequest", protectsuperadmin, processleaverequest)

    //  #endregion

module.exports = router;
