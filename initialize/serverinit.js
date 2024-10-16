const { default: mongoose } = require("mongoose")
const Users = require("../models/Users")
const Userdetails = require("../models/Userdetails")

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

    const firstmanager = await Users.findOne({_id: new mongoose.Types.ObjectId(process.env.FIRST_MANAGER)})
    .then(data => data)
    
    .catch (err => {
        console.log(`There's a problem getting the first manager login data for init. Error ${err}`)

        return
    })

    if (!firstmanager){
        await Users.create({_id: new mongoose.Types.ObjectId(process.env.FIRST_MANAGER), email: "firstmanager@triaxial.com", password: "3qmdYDmHHV71", token: "", bandate: "", status: "active", auth: "manager"})

        await Userdetails.create({owner: new mongoose.Types.ObjectId(process.env.FIRST_MANAGER), firstname: "First", lastname: "Manager", initial: "Triaxial", contactno: "09672852303"})
        .catch(err => {
            console.log(`There's a problem creating user details. Error ${err}`)

            return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
        });
    }

    console.log("DONE SERVER INITIALIZATION")
}