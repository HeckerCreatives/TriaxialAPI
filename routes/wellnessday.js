const router = require("express").Router()
const { wellnessdayrequest, wellnessdaylistrequest, requestlist, createhrwellnessevent } = require("../controllers/wellnessday")
const { protectsuperadmin, protectusers, protecthr } = require("../middleware/middleware")

router

    //  #region SUPERADMIN

    .get("/wellnessdaylistrequest", protectsuperadmin, wellnessdaylistrequest)

    //  #endregion

    //  #region USERS

    .post("/wellnessdayrequest", protectusers, wellnessdayrequest)
    .get("/wellnessdaylist",protectusers, requestlist)

    //  #endregion

    //  #region HR

    .post("/createhrwellnessevent", protecthr, createhrwellnessevent)

    //  #endregion

module.exports = router;
