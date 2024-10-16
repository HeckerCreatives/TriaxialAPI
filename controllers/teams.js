const { default: mongoose } = require("mongoose")
const Users = require("../models/Users")

//  #region SUPERADMIN

exports.createteam = async (req, res) => {
    const {id, email} = req.user

    const {teamname, directorpartner, associate, managerid, members} = req.body

    if (!teamname){
        return res.status(400).json({message: "failed", data: "Please enter team name"})
    }
    else if (!directorpartner){
        return res.status(400).json({message: "failed", data: "Please enter a director partner"})
    }
    else if (!associate){
        return res.status(400).json({message: "failed", data: "Please enter a associate"})
    }
    else if (!managerid){
        return res.status(400).json({message: "failed", data: "Please select a manager"})
    }
    else if (members.length < 0){
        return res.status(400).json({message: "failed", data: "Please select 1 or more members"})
    }
    else if (Array.isArray(members)){
        return res.status(400).json({message: "failed", data: "Invalid users"})
    }

    const memberusers = []

    members.forEach(tempdata => {
        memberusers.push(new mongoose.Types.ObjectId(tempdata))
    })

    
}

//  #endregion