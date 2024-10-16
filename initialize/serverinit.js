const { default: mongoose } = require("mongoose")
const Users = require("../models/Users")

exports.serverinit = async () => {
    
    console.log("STARTING SERVER INITIALIZATION")

    const superadmin = await Users.find()
    .then (data => data)
    .catch (err => {
        console.log(`There's a problem getting the superadmin data for init. Error ${err}`)

        return
    })

    if (superadmin.length <= 0){
        await Users.create({_id: new mongoose.Types.ObjectId(process.env.ADMIN_USER_ID), email: "triaxialadmin@triaxial.com", password: "3qmdYDmHHV71", token: "", bandate: "", status: "active", auth: "superadmin"})
    }

    console.log("DONE SERVER INITIALIZATION")
}