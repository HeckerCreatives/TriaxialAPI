const routers = app => {
    console.log("Routers are all available");

    app.use("/auth", require("./auth"))
}

module.exports = routers