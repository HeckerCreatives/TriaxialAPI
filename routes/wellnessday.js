const router = require("express").Router()
const { wellnessdayrequest, wellnessdaylistrequest, requestlist, createhrwellnessevent, wellnessdayeventlist, getwellnessdayeventdata, edithrwellnessevent } = require("../controllers/wellnessday")
const { protectsuperadmin, protectusers, protecthr } = require("../middleware/middleware")

router

    //  #region SUPERADMIN

    .get("/wellnessdaylistrequest", protectsuperadmin, wellnessdaylistrequest)
    .get("/wellnessdayeventlistadmin", protectsuperadmin, wellnessdayeventlist)
    .get("/getwellnessdayeventdataadmin", protectsuperadmin, getwellnessdayeventdata)
    .post("/createadminwellnessevent", protectsuperadmin, createhrwellnessevent)
    .post("/edithrwellnesseventadmin", protectsuperadmin, edithrwellnessevent)

    //  #endregion

    //  #region USERS

    .post("/wellnessdayrequest", protectusers, wellnessdayrequest)
    .get("/wellnessdaylist",protectusers, requestlist)

    //  #endregion

    //  #region HR

    .get("/wellnessdayeventlisthr", protecthr, wellnessdayeventlist)
    .get("/getwellnessdayeventdatahr", protecthr, getwellnessdayeventdata)
    .post("/createhrwellnessevent", protecthr, createhrwellnessevent)
    .post("/edithrwellnesseventhr", protecthr, edithrwellnessevent)

    //  #endregion

module.exports = router;
