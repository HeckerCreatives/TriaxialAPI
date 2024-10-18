const routers = app => {
    console.log("Routers are all available");

    app.use("/auth", require("./auth"))
    app.use("/users", require("./users"))
    app.use("/teams", require("./teams"))
    app.use("/clients", require("./clients"))
}

module.exports = routers