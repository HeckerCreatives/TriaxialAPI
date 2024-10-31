const { default: mongoose } = require("mongoose")
const Emails = require("../models/Email")
const Users = require("../models/Users")
const Userdetails = require("../models/Userdetails")

exports.sendmail = async(sender, receiver, title, content, sendtoall) => {

    await Emails.create({sender: sender, receiver: receiver, title: title, content: content, sendtoall: sendtoall})

    return "success"
}