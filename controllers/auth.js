const Users = require("../models/Users")

const fs = require('fs')
const bcrypt = require('bcrypt');
const jsonwebtokenPromisified = require('jsonwebtoken-promisified');
const path = require("path");
const { default: mongoose } = require("mongoose");
const Userdetails = require("../models/Userdetails");
const privateKey = fs.readFileSync(path.resolve(__dirname, "../keys/private-key.pem"), 'utf-8');

const encrypt = async password => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
}

exports.login = async (req, res) => {
    const {email, password} = req.query

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!email){
        return res.status(400).json({message: "failed", data: "Enter your email first!"})
    }
    else if (!emailRegex.test(email)){
        return res.status(400).json({message: "failed", data: "Please enter valid email!"})
    }
    else if (!password){
        return res.status(400).json({message: "failed", data: "Enter your password first!"})
    }
    

    const userdata = await Users.findOne({email: { $regex: new RegExp('^' + email + '$', 'i') }})
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting user data. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please try again later"})
    })

    if (!userdata){
        return res.json({message: "failed", data: "No existing email found"})
    }

    if (!(await userdata.matchPassword(password))){
        return res.status(400).json({message: "failed", data: "Password does not match!"})
    }

    const userdeets = await Userdetails.findOne({owner: new mongoose.Types.ObjectId(userdata._id)})
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting user details data. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please try again later"})
    })

    const token = await encrypt(privateKey)

    await Users.findOneAndUpdate({_id: new mongoose.Types.ObjectId(userdata._id)}, {token: token})
    .catch(err => {
        console.log(`There's a problem saving token to user data for ${email}. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please try again later"})
    })

    const payload = {id: userdata._id, email: userdata.email, token: token, auth: userdata.auth, fullname: `${(userdeets.firstname != "" ? userdeets.firstname : "")} ${(userdeets.lastname != "" ? userdeets.lastname : "")}`, reportingto: userdeets.reportingto != "" ? userdeets.reportingto : ""}

    let jwtoken = ""

    try {
        jwtoken = await jsonwebtokenPromisified.sign(payload, privateKey, { algorithm: 'RS256' });
    } catch (error) {
        console.error('Error signing token:', error.message);

        return res.status(400).json({message: "bad-request", data: `There's a problem logging in your account! Error: ${err}`})
    }

    res.cookie('sessionToken', jwtoken, { secure: true, sameSite: 'None' } )
    
    return res.json({message: "success", data: {
        auth: userdata.auth
    }})
}

exports.logout = async (req, res) => {
    res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
    return res.json({message: "success"})
}