const { default: mongoose } = require("mongoose")
const Users = require("../models/Users")
const Userdetails = require("../models/Userdetails")
const Clients = require("../models/Clients")

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

        await Userdetails.create({owner: new mongoose.Types.ObjectId(process.env.ADMIN_USER_ID), firstname: "Triaxial", lastname: "Superadmin", initial: "TSA", contactno: "09672852304"})
        .catch(err => {
            console.log(`There's a problem creating user details for superadmin. Error ${err}`)

            return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
        });
    }

    const firstmanager = await Users.findOne({_id: new mongoose.Types.ObjectId(process.env.FIRST_MANAGER)})
    .then(data => data)
    
    .catch (err => {
        console.log(`There's a problem getting the first manager login data for init. Error ${err}`)

        return
    })

    if (!firstmanager){
        await Users.create({_id: new mongoose.Types.ObjectId(process.env.FIRST_MANAGER), email: "firstmanager@triaxial.com", password: "3qmdYDmHHV71", token: "", bandate: "", status: "active", auth: "manager"})

        await Userdetails.create({owner: new mongoose.Types.ObjectId(process.env.FIRST_MANAGER), firstname: "First", lastname: "Manager", initial: "Triaxial", contactno: "09672852303", reportingto: null, resource: ""})
        .catch(err => {
            console.log(`There's a problem creating user details. Error ${err}`)

            return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
        });
    }

    const triaxialclient = await Clients.findOne({clientname: "Trixial Consulting - Admin", priority: "Priority 3"})
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting the triaxial client data for init. Error ${err}`)

        return
    })

    if (!triaxialclient){
        await Clients.create({clientname: "Trixial Consulting - Admin", priority: "Priority 3"})
        .catch(err => {
            console.log(`There's a problem creating triaxial client. Error ${err}`)

            return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
        })
        console.log("Triaxial Client Created")
    }

    console.log("DONE SERVER INITIALIZATION")
}