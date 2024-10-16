const router = require("express").Router()
const { login } = require("../controllers/auth")
// const { validateplayeradmin, protectplayer } = require("../middleware/middleware")

router
    .get("/login", login)

module.exports = router;
