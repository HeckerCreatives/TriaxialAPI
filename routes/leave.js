const router = require("express").Router()
const { calculateleavedays, requestleave, employeeleaverequestlist, superadminleaverequestlist, processleaverequest, leaverequestdata, editrequestleave, managerleaverequestlistemployee, deleterequestleave, checkwellnesdayinleave } = require("../controllers/leave")
const { protectsuperadmin, protectusers, protectemployee, protectmanager } = require("../middleware/middleware")

router

    //  #region USERS

    // .get("/calculateleavedays", protectusers, calculateleavedays)

    //  #endregion

    //  #region USERS

    .get("/leaverequestlist", protectusers, employeeleaverequestlist)
    .get("/leaverequestdata", protectusers, leaverequestdata)
    .post("/requestleave", protectusers, requestleave)
    .post("/editrequestleave", protectusers, editrequestleave)
    .post("/deleterequestleave", protectusers, deleterequestleave)
    .get("/checkwellnessdayinleave", protectusers, checkwellnesdayinleave)

    //  #endregion

    //  #region SUPERADMIN

    .get("/superadminleaverequestlist", protectsuperadmin, superadminleaverequestlist)
    .get("/leaverequestdataadmin", protectsuperadmin, leaverequestdata)
    .post("/superadminprocessleaverequest", protectsuperadmin, processleaverequest)

    //  #endregion

    //  #region MANAGER
    .get("/managerleaverequestlist", protectmanager, superadminleaverequestlist)
    .get("/managerleaverequestlistemployee", protectmanager, managerleaverequestlistemployee)
    .get("/managerleaverequestdataemployee", protectmanager, leaverequestdata)
    .post("/managerprocessleaverequest", protectmanager, processleaverequest)

    //  #endregion

module.exports = router;
