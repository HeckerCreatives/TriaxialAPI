const Clients = require("../models/Clients")

//  #region SUPERADMIN

exports.createclients = async (req, res) => {
    const {id, email} = req.user

    const {clientname, priority, teams} = req.body

    if (!clientname){
        return res.status(400).json({message: "failed", data: "Enter a client name first!"})
    }
    else if (!priority){
        return res.status(400).json({message: "failed", data: "Select a priority first!"})
    }
    else if (!teams){
        return res.status(400).json({message: "failed", data: "Select one or more teams!"})
    }
    else if (Array.isArray(teams)){
        return res.status(400).json({message: "failed", data: "Team selected is invalid!"})
    }

    
}

//  #endregion