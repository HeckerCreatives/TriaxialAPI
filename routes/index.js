const routers = app => {
    console.log("Routers are all available");

    app.use("/auth", require("./auth"))
    app.use("/users", require("./users"))
    app.use("/teams", require("./teams"))
    app.use("/clients", require("./clients"))
    app.use("/wellnessday", require("./wellnessday"))
    app.use("/leave", require("./leave"))
    app.use("/events", require("./events"))
    app.use("/wfh", require("./wfh"))
    app.use("/email", require("./email"))
}

module.exports = routers