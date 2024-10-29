const router = require("express").Router()
const { login, logout } = require("../controllers/auth")
// const { validateplayeradmin, protectplayer } = require("../middleware/middleware")

router
    .get("/login", login)
    .get("/logout", logout)

module.exports = router;
