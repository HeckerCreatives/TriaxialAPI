const router = require("express").Router()
const { calculateleavedays, requestleave, employeeleaverequestlist } = require("../controllers/leave")
const { protectsuperadmin, protectusers, protectemployee } = require("../middleware/middleware")

router

    //  #region USERS

    .get("/calculateleavedays", protectusers, calculateleavedays)

    //  #endregion

    //  #region EMPLOYEE

    .get("/employeeleaverequestlist", protectemployee, employeeleaverequestlist)
    .post("/requestleave", protectemployee, requestleave)

    //  #endregion

    //  #region SUPERADMIN

    //  #endregion

module.exports = router;
