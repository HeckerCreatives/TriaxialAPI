const { default: mongoose } = require("mongoose")
const Users = require("../models/Users")

//  #region SUPERADMIN

exports.createemployee = async (req, res) => {
    const {id} = req.user

    const {email, password} = req.body

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const withSpecialCharRegex = /^[A-Za-z0-9@/[\]#]+$/;

    if (!email){
        return res.status(400).json({message: "failed", data: "Enter your email first!"})
    }
    else if (!emailRegex.test(email)){
        return res.status(400).json({message: "failed", data: "Please enter valid email!"})
    }
    else if (!password){
        return res.status(400).json({message: "failed", data: "Enter your password first!"})
    }
    else if (password.length < 5 || password.length > 20){
        return res.status(400).json({message: "failed", data: "Password minimum of 5 characters up to 20 characters"})
    }
    else if (!withSpecialCharRegex.test(password)){
        return res.status(400).json({message: "failed", data: "Only alphanumeric and selected special characters (@/[]#) only!"})
    }

    
}

//  #endregion