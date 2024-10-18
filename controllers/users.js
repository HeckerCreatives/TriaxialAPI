const { default: mongoose } = require("mongoose")
const Users = require("../models/Users")
const Userdetails = require("../models/Userdetails")

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

    const {email, password, firstname, initial, lastname, contactnumber, reportingto, position} = req.body

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

    console.log(user)

    await Userdetails.create({owner: new mongoose.Types.ObjectId(user._id), firstname: firstname, lastname: lastname, initial: initial, contactno: contactnumber, reportingto: new mongoose.Types.ObjectId(reportingto)})
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

    if (!Array.isArray(userids)){
        return res.status(400).json({message: "failed", data: "Invalid users"})
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
        const { employeeId, name, teams, initial, email, dateCreated, status, auth, reportingTo } = tempdata;

        data.employeelist.push({
            employeeid: employeeId,
            name: name,
            teamname: teams.length ? teams.join(', ') : "", // Join team names into a single string
            initial: initial,
            email: email,
            dateCreated: dateCreated,
            status: status,
            auth: auth,
            reportingto: reportingTo == null ? "" : reportingTo
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

//  #endregion