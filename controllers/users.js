const { default: mongoose } = require("mongoose")
const Users = require("../models/Users")
const Userdetails = require("../models/Userdetails")
const Teams = require("../models/Teams")
const bcrypt = require('bcrypt');

const encrypt = async password => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
}

//  #region USERS

exports.changepassword = async (req, res) => {
    const {id, email} = req.user

    const {currentpw, newpw} = req.body

    const userdata = await Users.findOne({email: email})
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting user data. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please try again later"})
    })

    if (!userdata){
        return res.status(401).json({message: "failed", data: "No existing user found"})
    }

    if (!(await userdata.matchPassword(currentpw))){
        return res.status(400).json({message: "failed", data: "Current password does not match!"})
    }

    
    const hashPassword = bcrypt.hashSync(newpw, 10)

    await Users.findOneAndUpdate({email: email}, {password: hashPassword})
    .catch(err => {
        console.log(`There's a problem getting updating password for ${email} ${id}. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please try again later"})
    })

    return res.json({message: "success"})
}

//  #endregion

//  #region SUPERADMIN

exports.employeeliststats = async (req, res) => {
    const {id, email} = req.user

    const {positionfilter} = req.query

    const result = await Users.aggregate([
        {
          $match: {
            auth: positionfilter // Filter by auth role (e.g., employee, manager, etc.)
          }
        },
        {
          $facet: {
            totalUsers: [{ $count: 'total' }], // Count total users with the given auth filter
            activeUsers: [
              { $match: { status: 'active' } }, // Filter for active users
              { $count: 'total' }
            ],
            bannedUsers: [
              { $match: { status: 'banned' } }, // Filter for banned users (you can adjust the banned status name)
              { $count: 'total' }
            ]
          }
        },
        {
          $project: {
            totalUsers: { $arrayElemAt: ['$totalUsers.total', 0] }, // Access the count of total users
            activeUsers: { $arrayElemAt: ['$activeUsers.total', 0] }, // Access the count of active users
            bannedUsers: { $arrayElemAt: ['$bannedUsers.total', 0] }  // Access the count of banned users
          }
        }
      ]);

      const data = {
        stats:{}
      }

      result.forEach(tempdata => {
        const {totalUsers, activeUsers, bannedUsers} = tempdata

        data["stats"] = {
            totalUsers: totalUsers != null ? totalUsers : 0,
            activeUsers: activeUsers != null ? activeUsers : 0,
            bannedUsers: bannedUsers != null ? bannedUsers : 0
        }
      })

      return res.json({message: "success", data: data})
}

exports.createemployee = async (req, res) => {
    const {id} = req.user

    const {email, password, firstname, initial, lastname, contactnumber, reportingto, position, resource} = req.body

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const withSpecialCharRegex = /^[A-Za-z0-9@/[\]#]+$/;
    const nameRegex = /^[a-zA-Z .-]+$/;
    

    if (!email) return res.status(400).json({message: "failed", data: "Enter your email first!"})
    if (!emailRegex.test(email)) return res.status(400).json({message: "failed", data: "Please enter valid email!"})
    if (!password) return res.status(400).json({message: "failed", data: "Enter your password first!"})
    if (password.length < 5 || password.length > 20) return res.status(400).json({message: "failed", data: "Password minimum of 5 characters up to 20 characters"})
    if (!withSpecialCharRegex.test(password)) return res.status(400).json({message: "failed", data: "Only alphanumeric and selected special characters (@/[]#) only!"})
    if (!resource) return res.status(400).json({message: "failed", data: "Please select a resource"})
    if (resource != "Civil" && resource != "Structural" && resource != "Drafter" && resource != "Hydraulic" && resource != "Remedial" && resource != "Admin") return res.status(400).json({message: "failed", data: "Please select a valid resource type"})
    if (!nameRegex.test(firstname)) return res.status(400).json({message: "failed", data: "Please enter a valid first name!"})
    if (!nameRegex.test(lastname)) return res.status(400).json({message: "failed", data: "Please enter a valid last name!"})
    if (!nameRegex.test(initial)) return res.status(400).json({message: "failed", data: "Please enter a valid initial!"})
    if (firstname.length > 25) return res.status(400).json({message: "failed", data: "First name should be less than 25 characters!"})
    if (lastname.length > 15) return res.status(400).json({message: "failed", data: "Last name should be less than 15 characters!"})
    if (initial.length > 10) return res.status(400).json({message: "failed", data: "Initial should be less than 10 characters!"})
    if (contactnumber.length > 20) return res.status(400).json({message: "failed", data: "Contact number should be less than 20 characters!"})
    // if (!email){
    //     return res.status(400).json({message: "failed", data: "Enter your email first!"})
    // } else if (!emailRegex.test(email)){
    //     return res.status(400).json({message: "failed", data: "Please enter valid email!"})
    // } else if (!password){
    //     return res.status(400).json({message: "failed", data: "Enter your password first!"})
    // } else if (password.length < 5 || password.length > 20){
    //     return res.status(400).json({message: "failed", data: "Password minimum of 5 characters up to 20 characters"})
    // } else if (!withSpecialCharRegex.test(password)){
    //     return res.status(400).json({message: "failed", data: "Only alphanumeric and selected special characters (@/[]#) only!"})
    // } else if (!resource){
    //     return res.status(400).json({message: "failed", data: "Please select a resource"})
    // } else if (resource != "Civil" && resource != "Structural" && resource != "Drafter" && resource != "Hydraulic" && resource != "Remedial" && resource != "Admin"){
    //     return res.status(400).json({message: "failed", data: "Please select a valid resource type"})
    // } else if (!nameRegex.test(firstname)){
    //     return res.status(400).json({message: "failed", data: "Please enter a valid first name!"})
    // } else if (!nameRegex.test(lastname)){
    //     return res.status(400).json({message: "failed", data: "Please enter a valid last name!"})
    // } else if (!nameRegex.test(initial)){
    //     return res.status(400).json({message: "failed", data: "Please enter a valid initial!"})
    // } else if (firstname.length > 25){
    //     return res.status(400).json({message: "failed", data: "First name should be less than 25 characters!"})
    // } else if (lastname.length > 15){
    //     return res.status(400).json({message: "failed", data: "Last name should be less than 15 characters!"})
    // } else if (initial.length > 10){
    //     return res.status(400).json({message: "failed", data: "Initial should be less than 10 characters!"})
    // } else if (contactnumber.length > 20){
    //     return res.status(400).json({message: "failed", data: "Contact number should be less than 20 characters!"})
    // }


    const userlogin = await Users.findOne({email: { $regex: new RegExp('^' + email + '$', 'i') }})
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting the userlogins. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
    })

    if (userlogin){
        return res.status(400).json({message: "failed", data: "There's an existing email already. Please use a different user email"})
    }

    const userdeets = await Userdetails.findOne({
        $or: [
          {
            $and: [
              { firstname: { $regex: new RegExp(firstname, 'i') } }, 
              { lastname: { $regex: new RegExp(lastname, 'i') } }
            ]
          },
          { contactno: contactnumber }
        ]
    })
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting user details. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
    });

    if (userdeets){
        return res.status(400).json({message: "failed", data: "There's an existing user details already. Please use a different user credentials"})
    }

    const user = await Users.create({email: email, password: password, token: "", banddate: "", status: "active", auth: position})
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem creating user login. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
    });

    await Userdetails.create({owner: new mongoose.Types.ObjectId(user._id), firstname: firstname, lastname: lastname, initial: initial, contactno: contactnumber, reportingto: new mongoose.Types.ObjectId(reportingto), resource: resource})
    .catch(async err => {
        console.log(`There's a problem creating user details. Error ${err}`)

        await Users.findOneAndDelete({_id: new mongoose.Types.ObjectId(user._id)})

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
    });

    return res.json({message: "success"})
}

exports.changepositionemployee = async (req, res) => {
    const {id, email} = req.user

    const {userids, position} = req.body

    if (!userids || !Array.isArray(userids) || userids.length === 0 || !position) {
        return res.status(400).json({message: "failed", data: "Invalid users or position"})
    }

    const employees = []

    userids.forEach(tempdata => {
        employees.push({
            updateOne: {
                filter: {_id: new mongoose.Types.ObjectId(tempdata)},
                update: { $set: {auth: position}}
            }
        })
    })

    await Users.bulkWrite(employees)

    return res.json({message: "success"})
}

exports.employeelist = async (req, res) => {
    const { positionfilter, page, limit, fullnamefilter } = req.query;

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10
    };

    const matchStage = {};
    const fullnameMatchStage = {}
    if (positionfilter) {
      matchStage['auth'] = positionfilter;
    }

    // Add search filter for first name, last name, or combined
    if (fullnamefilter) {
        const searchRegex = new RegExp(fullnamefilter, 'i'); // 'i' for case-insensitive search
        fullnameMatchStage.$or = [
            { 'details.firstname': { $regex: fullnamefilter, $options: 'i' } },
            { 'details.lastname': { $regex: fullnamefilter, $options: 'i' } },
            { $expr: { $regexMatch: { input: { $concat: ['$details.firstname', ' ', '$details.lastname'] }, regex: fullnamefilter, options: 'i' } } } // Search for first + last name
        ];
    }

    const employees = await Users.aggregate([
        {
            $match: matchStage // Apply the dynamic auth filter if provided
        },
        {
            $lookup: {
                from: 'userdetails', // Collection name for the 'userDetails' schema
                localField: '_id',
                foreignField: 'owner',
                as: 'details'
            }
        },
        {
            $unwind: '$details' // Deconstruct the 'details' array to a single object
        },
        {
            $match: fullnameMatchStage // Apply the dynamic auth filter if provided
        },
        {
            $lookup: {
                from: 'userdetails', // Lookup reporting manager's details directly
                localField: 'details.reportingto', // `reportingto` points directly to the ObjectId of the reporting manager's details
                foreignField: 'owner', // Match the 'owner' field (which is the user ID) in userdetails
                as: 'reportingDetails'
            }
        },
        {
            $unwind: { path: '$reportingDetails', preserveNullAndEmptyArrays: true } // reportingDetails might be null
        },
        {
            $lookup: {
                from: 'teams', // Assuming there's a collection for team names
                localField: 'details.owner', // Adjust according to your schema structure
                foreignField: 'members',
                as: 'teamInfo'
            }
        },
        {
            $group: {
                _id: '$_id',
                name: { $first: { $concat: ['$details.firstname', ' ', '$details.lastname'] } },
                auth: { $first: "$auth" },
                initial: { $first: '$details.initial' },
                email: { $first: '$email' },
                reportingTo: { 
                    $first: {
                        $cond: {
                            if: { $and: ['$reportingDetails.firstname', '$reportingDetails.lastname'] },
                            then: { $concat: ['$reportingDetails.firstname', ' ', '$reportingDetails.lastname'] },
                            else: null
                        }
                    }
                },
                resource: { $first: '$details.resource'},
                dateCreated: { $first: '$details.createdAt' },
                status: { $first: '$status' },
                teams: { $addToSet: '$teamInfo.teamname' } // Collect all team names into an array
            }
        },
        {
            $project: {
                employeeId: '$_id',
                name: 1,
                auth: 1,
                initial: 1,
                email: 1,
                reportingTo: 1,
                dateCreated: 1,
                status: 1,
                resource: 1,
                teams: { 
                    $cond: {
                        if: { $eq: [{ $size: '$teams' }, 0] }, 
                        then: [""], 
                        else: '$teams'
                    }
                } // If no teams, provide an empty string
            }
        },
        { $skip: pageOptions.page * pageOptions.limit },
        { $limit: pageOptions.limit }
    ]);

    // Combine matchStage and fullnameMatchStage for counting the total number of documents
    const combinedMatchStage = { $and: [matchStage, fullnameMatchStage] };

    const total = await Users.aggregate([
        { $match: matchStage },
        { $lookup: {
            from: 'userdetails',
            localField: '_id',
            foreignField: 'owner',
            as: 'details'
        }},
        { $unwind: '$details' },
        { $match: fullnameMatchStage },
        { $count: 'total' }
    ]);

    const totalPages = Math.ceil((total[0]?.total || 0) / pageOptions.limit);

    const data = {
        employeelist: [],
        totalpages: totalPages
    };

    employees.forEach(tempdata => {
        const { employeeId, name, teams, initial, email, dateCreated, status, auth, reportingTo, resource } = tempdata;

        data.employeelist.push({
            employeeid: employeeId,
            name: name,
            teamname: teams.length ? teams.join(', ') : "", // Join team names into a single string
            initial: initial,
            email: email,
            dateCreated: dateCreated,
            status: status,
            auth: auth,
            reportingto: reportingTo == null ? "" : reportingTo,
            resource: resource
        });
    });

    return res.json({ message: "success", data: data });
};

exports.managerlist = async (req, res) => {
    const {id, email} = req.user

    const {fullname} = req.query

    const matchStage = {};

    if (fullname) {
        matchStage['$or'] = [
            { 'details.firstname': { $regex: fullname, $options: 'i' } },
            { 'details.lastname': { $regex: fullname, $options: 'i' } }
        ];
    }

    const managers = await Users.aggregate([
        {
            $match: {auth: "manager"} // Apply the dynamic auth filter if provided
        },
        {
            $lookup: {
                from: 'userdetails', // Collection name for the 'userDetails' schema
                localField: '_id',
                foreignField: 'owner',
                as: 'details'
            }
        },
        {
            $unwind: '$details' // Deconstruct the 'details' array to a single object
        },
        {
            $match: matchStage // Apply the match stage if fullname is provided
        },
        {
            $project: {
                name: { $concat: ['$details.firstname', ' ', '$details.lastname'] },
            }
        },
        {
            $sort: { name: 1 }
        }
    ])

    const data = {
        managerlist: []
    }

    managers.forEach(tempdata => {
        const {_id, name} = tempdata

        data.managerlist.push({
            employeeid: _id,
            name: name
        })
    })

    return res.json({message: "success", data: data})
}

exports.employeesearchlist = async (req, res) => {
    const {id, email} = req.user

    const {fullname} = req.query

    const matchStage = {};

    if (fullname) {
        matchStage['$or'] = [
            { 'details.firstname': { $regex: fullname, $options: 'i' } },
            { 'details.lastname': { $regex: fullname, $options: 'i' } }
        ];
    }

    const managers = await Users.aggregate([
        {
            $match: {
                auth: {
                    $nin: ["hr", "finance", "superadmin"]
                }
            }
        },
        {
            $lookup: {
                from: 'userdetails', // Collection name for the 'userDetails' schema
                localField: '_id',
                foreignField: 'owner',
                as: 'details'
            }
        },
        {
            $unwind: '$details' // Deconstruct the 'details' array to a single object
        },
        {
            $match: matchStage // Apply the match stage if fullname is provided
        },
        {
            $project: {
                _id: 1, // Keep the employee _id
                name: { $concat: ['$details.firstname', ' ', '$details.lastname'] }, // Combine first and last name
            }
        },
        {
            $sort: { name: 1 } // Sort by name
        }

    ]);

    const data = {
        employeelist: []
    }

    managers.forEach(tempdata => {
        const {_id, name} = tempdata

        data.employeelist.push({
            employeeid: _id,
            name: name
        })
    })

    return res.json({message: "success", data: data})
}

exports.banemployees = async (req, res) => {
    const {id, email} = req.user

    const {employeeid, status } = req.body

    if (!employeeid){
        return res.status(400).json({message: "failed", data: "Please select one or more employee first"})
    }
    else if (!Array.isArray(employeeid)){
        return res.status(400).json({message: "failed", data: "Invalid selected employee"})
    }


    const employees = []

    employeeid.forEach(tempdata => {
        employees.push({
            updateOne: {
                filter: {_id: new mongoose.Types.ObjectId(tempdata)},
                update: { $set: {status: status, bandate: status == "banned" ? new Date() : ""} }
            }
        })
    })

    await Users.bulkWrite(employees)

    return res.json({message: "success"})
}



exports.viewemployeedata = async (req, res) => {
    const {id, email} = req.user

    const {employeeid} = req.query

    if (!employeeid){
        return res.status(400).json({message: "failed", data: "Please select a employee first!"})
    }

    const employee = await Users.aggregate([
        {
            $match: { _id: new mongoose.Types.ObjectId(employeeid) }
        },
        {
            $lookup: {
                from: 'userdetails', // Collection name for the 'userDetails' schema
                localField: '_id',
                foreignField: 'owner',
                as: 'details'
            }
        },
        {
            $unwind: '$details' // Deconstruct the 'details' array to a single object
        },
        {
            $lookup: {
                from: 'userdetails', // Collection name for the 'userDetails' schema
                localField: 'details.reportingto',
                foreignField: 'owner',
                as: 'reportingto'
            }
        },
        {
            // Use preserveNullAndEmptyArrays to keep documents with no matching 'reportingto'
            $unwind: {
                path: '$reportingto',
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                _id: 1,
                email: 1,
                firstname: '$details.firstname',
                lastname: '$details.lastname',
                initial: '$details.initial',
                contactno: '$details.contactno',
                reportingto: {
                    employeeid: '$reportingto.owner',
                    firstname: '$reportingto.firstname',
                    lastname: '$reportingto.lastname'
                },
                resource: '$details.resource'
            }
        }
    ]);
    


    if (!employee[0]){
        return res.status(400).json({message: "failed", data: "Selected employee does not exist!"})
    }

    const data = {
        employeeid: employee[0]._id,
        email: employee[0].email,
        firstname: employee[0].firstname,
        lastname: employee[0].lastname,
        initial: employee[0].initial,
        contactno: employee[0].contactno,
        reportingto: employee[0].reportingto,
        resource: employee[0].resource
    }

    return res.json({message: "success", data: data})
}

exports.editemployees = async (req, res) => {
    const {id} = req.user

    const {employeeid, email, password, firstname, lastname, initial, contactnumber, reportingto, resource} = req.body

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const withSpecialCharRegex = /^[A-Za-z0-9@/[\]#]+$/;

    if (!employeeid){
        return res.status(400).json({message: "failed", data: "Select a employee first!"})
    }
    else if (!email){
        return res.status(400).json({message: "failed", data: "Enter an email first!"})
    }
    else if (!emailRegex.test(email)){
        return res.status(400).json({message: "failed", data: "Please enter valid email!"})
    }
    else if (!firstname){
        return res.status(400).json({message: "failed", data: "Enter an first name first!"})
    }
    else if (!lastname){
        return res.status(400).json({message: "failed", data: "Enter an last name first!"})
    }
    else if (!initial){
        return res.status(400).json({message: "failed", data: "Enter an initial first!"})
    }
    else if (!contactnumber){
        return res.status(400).json({message: "failed", data: "Enter a contact no first!"})
    }
    else if (!reportingto){
        return res.status(400).json({message: "failed", data: "Select a reporting to first!"})
    }
    else if (!resource){
        return res.status(400).json({message: "failed", data: "Please select a resource"})
    }
    else if (resource != "Civil" && resource != "Structural" && resource != "Drafter" && resource != "Hydraulic" && resource != "Remedial" && resource != "Admin"){
        return res.status(400).json({message: "failed", data: "Please select a valid resource type"})
    }

    const userloginupdate = {
        email: email
    }

    if (password){
        if (password.length < 5 || password.length > 20){
            return res.status(400).json({message: "failed", data: "Password minimum of 5 characters up to 20 characters"})
        }
        else if (!withSpecialCharRegex.test(password)){
            return res.status(400).json({message: "failed", data: "Only alphanumeric and selected special characters (@/[]#) only!"})
        }

        const finalpassword = await encrypt(password)

        userloginupdate["password"] = finalpassword
    }

    const userdeets = await Userdetails.findOne({
        $or: [
          {
            $and: [
              { firstname: { $regex: new RegExp(firstname, 'i') } }, 
              { lastname: { $regex: new RegExp(lastname, 'i') } }
            ]
          },
          { contactno: contactnumber }
        ]
    })
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting user details. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
    });

    if (userdeets){
        if (userdeets.owner != employeeid){
            return res.status(400).json({message: "failed", data: "There's an existing user details already. Please use a different user credentials"})
        }
    }

    const userlogindetails = await Users.findOne({email: { $regex: new RegExp('^' + email + '$', 'i') }})
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting user login data ${employeeid} ${email}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support for more details"})
    })

    if (userlogindetails){
        if (userlogindetails._id != employeeid){
            return res.status(400).json({message: "failed", data: "There's an existing email already. Please use a different user credentials"})
        }
    }

    await Users.findOneAndUpdate({_id: new mongoose.Types.ObjectId(employeeid)}, userloginupdate)
    .catch(err => {
        console.log(`There's a problem saving user login data ${employeeid} ${email}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support for more details"})
    })

    await Userdetails.findOneAndUpdate({owner: new mongoose.Types.ObjectId(employeeid)}, {firstname: firstname, lastname: lastname, initial: initial, contactno: contactnumber, reportingto: new mongoose.Types.ObjectId(reportingto), resource: resource})
    .catch(err => {
        console.log(`There's a problem saving user details data ${employeeid} ${email}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support for more details"})
    })

    return res.json({message: "success"})
}

exports.viewteamemployees = async (req, res) => {
    const {id, username} = req.user

    const {employeeid} = req.query

    if (!employeeid) {
        return res.status(400).json({message: "failed", data: "Please select a valid employee"})
    }

    const employeeteam = await Teams.find({$or: [
        {manager: new mongoose.Types.ObjectId(employeeid)},
        {teamleader: new mongoose.Types.ObjectId(employeeid)},
        {members: new mongoose.Types.ObjectId(employeeid)}
    ]})
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting the employee team list for user: ${employeeid}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support for more details"})
    })

    const data = {
        list: []
    }

    employeeteam.forEach(tempdata => {
        const {teamname} = tempdata

        data.list.push({teamname: teamname})
    })

    return res.json({message: "success", data: data})
}

//  #endregion

exports.getuserdetails = async (req, res) => {
    const {id, email} = req.user

    const userdetails = await Userdetails.findOne({owner: new mongoose.Types.ObjectId(id)})
    .populate('owner')
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting user details for ${email} ${id}. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please try again later"})
    })

    if (!userdetails){
        return res.status(400).json({message: "failed", data: "No existing user found"})
    }

    const data = {
        id: userdetails.owner._id,
        firstname: userdetails.firstname,
        lastname: userdetails.lastname,
        initial: userdetails.initial,
        contactno: userdetails.contactno,
        reportingto: userdetails.reportingto,
        resource: userdetails.resource,
        profilepicture: userdetails.profilepicture
    }

    return res.json({message: "success", data: data})

}

