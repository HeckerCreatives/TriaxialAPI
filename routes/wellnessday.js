const router = require("express").Router()
const { wellnessdayrequest, wellnessdaylistrequest, requestlist } = require("../controllers/wellnessday")
const { protectsuperadmin, protectusers } = require("../middleware/middleware")

router

    //  #region SUPERADMIN

    .get("/wellnessdaylistrequest", protectsuperadmin, wellnessdaylistrequest)

    //  #endregion

    //  #region USERS

    .post("/wellnessdayrequest", protectusers, wellnessdayrequest)
    .get("/wellnessdaylist",protectusers, requestlist)

    //  #endregion

module.exports = router;
