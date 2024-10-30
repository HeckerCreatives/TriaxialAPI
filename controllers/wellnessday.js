const { default: mongoose } = require("mongoose");
const Wellnessday = require ("../models/wellnessday");
const { listSearchIndexes } = require("../models/events");

//  #region USERS

exports.wellnessdayrequest = async (req, res) => {
    const {id, email} = req.user

    const {requestdate} = req.body

    const now = new Date();
    const yearMonth = now.toISOString().slice(0, 7); // Extracts 'YYYY-MM' format

    const existingWellnessDay = await Wellnessday.find({ owner: new mongoose.Types.ObjectId(id), requestdate: { $regex: `^${yearMonth}` } // Matches dates starting with 'YYYY-MM'
    })
    .catch(err => {
        console.log(`There's a problem getting the wellness day leave request datas for ${email}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please try again later"})
    });

    if (existingWellnessDay.length >= 2){
        return res.status(400).json({message: "failed", data: "You already used up your two (2) wellness day leave request"})
    }

    await Wellnessday.create({owner: new mongoose.Types.ObjectId(id), requestdate: requestdate, status: "Pending"})
    .catch(err => {
        console.log(`There's a problem saving the wellness day leave request for ${email}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please try again later"})
    });

    return res.json({message: "success"})
}

exports.requestlist = async (req, res) => {
    const {id, username} = req.user
    const {page, limit} = req.query

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10
    }

    const wellnessdayhistory = await Wellnessday.find({owner: new mongoose.Types.ObjectId(id)})
    .skip(pageOptions.page * pageOptions.limit)
    .limit(pageOptions.limit)
    .sort({'createdAt': -1})
    .then(data => data)
    .catch(err => {
        console.log(`${err}`)
        return res.status(400).json({ message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details." })
    })

    console.log(wellnessdayhistory)

    const totalPages = await Wellnessday.countDocuments({owner: new mongoose.Types.ObjectId(id)})
    .then(data => data)
    .catch(err => {

        console.log(` ${username}, error: ${err}`)

        return res.status(400).json({ message: 'failed', data: `There's a problem with your account. Please contact customer support for more details` })
    })

    const pages = Math.ceil(totalPages / pageOptions.limit)

    const data = {
        totalPages: pages,
        history: []
    }

    const today = new Date();
    const firstdayoftheweek = new Date(today);
    const day = firstdayoftheweek.getDay(),  // Get the current day (0 for Sunday, 1 for Monday, etc.)
    diff = firstdayoftheweek.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday

    wellnessdayhistory.forEach(tempdata => {
        const {wellnessdayId, requestdate, userFullName, reportingManagerFullName, createdAt} = tempdata

        data.history.push({
            createdAt: createdAt,
            requestid: wellnessdayId,
            manager: reportingManagerFullName,
            user: userFullName,
            requestdate: requestdate,
            firstdayofwellnessdaycycle: new Date(firstdayoftheweek.setDate(diff)).toISOString().split('T')[0]
        })
    })

    return res.json({message: "success", data: data})
}

//  #endregion


//  #region SUPERADMIN

exports.wellnessdaylistrequest = async (req, res) => {
    const {id, email} = req.user

    const {page, limit, statusfilter, fullnamefilter} = req.query

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10
    };

    const searchStage = {};
    if (fullnamefilter) {
        const searchRegex = new RegExp(fullnamefilter, 'i'); // 'i' for case-insensitive
        searchStage.$or = [
            { 'userDetails.firstname': { $regex: searchRegex } },
            { 'userDetails.lastname': { $regex: searchRegex } },
            { $expr: { $regexMatch: { input: { $concat: ['$userDetails.firstname', ' ', '$userDetails.lastname'] }, regex: fullnamefilter, options: 'i' } } }
        ];
    }

    const wellnessDayData = await Wellnessday.aggregate([
        {
            $match: {
                status: statusfilter
            }
        },
        {
            // Lookup user details for the owner of the wellness day
            $lookup: {
                from: 'userdetails',
                localField: 'owner',
                foreignField: 'owner',
                as: 'userDetails'
            }
        },
        {
            $unwind: '$userDetails' // Deconstruct the userDetails array
        },
        {
            // Apply the search filter for user's first name, last name, or full name
            $match: searchStage
        },
        {
            // Lookup reporting manager's details
            $lookup: {
                from: 'userdetails',
                localField: 'userDetails.reportingto',
                foreignField: 'owner',
                as: 'reportingManagerDetails'
            }
        },
        {
            $unwind: {
                path: '$reportingManagerDetails',
                preserveNullAndEmptyArrays: true // In case some users don't have a reporting manager
            }
        },
        {
            // Format the output to include only the relevant information
            $project: {
                _id: 0,
                wellnessdayId: '$_id',
                requestdate: 1,
                // Full name of the user
                userFullName: {
                    $concat: ['$userDetails.firstname', ' ', '$userDetails.lastname']
                },
                // Full name of the reporting manager (if available)
                reportingManagerFullName: {
                    $cond: {
                        if: { $and: ['$reportingManagerDetails.firstname', '$reportingManagerDetails.lastname'] },
                        then: { $concat: ['$reportingManagerDetails.firstname', ' ', '$reportingManagerDetails.lastname'] },
                        else: 'N/A'
                    }
                }
            }
        },
        { $skip: pageOptions.page * pageOptions.limit }, // Skip for pagination
        { $limit: pageOptions.limit } // Limit for pagination
    ]);

    const totallistcount = await Wellnessday.aggregate([
        {
            $match: {
                status: statusfilter
            }
        },
        {
            $lookup: {
                from: 'userdetails',
                localField: 'owner',
                foreignField: 'owner',
                as: 'userDetails'
            }
        },
        { $unwind: '$userDetails' },
        { $match: searchStage },
        { $count: "total" }
    ])
    .catch(err => {
        console.log(`There's a problem with getting wellnessday list count. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support for more details."})
    });

    const data = {
        requestlist: [],
        totalpages: Math.ceil(totallistcount.length > 0 ? totallistcount[0].total : 0 / pageOptions.limit)
    }

    const today = new Date();
    const firstdayoftheweek = new Date(today);
    const day = firstdayoftheweek.getDay(),  // Get the current day (0 for Sunday, 1 for Monday, etc.)
    diff = firstdayoftheweek.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday

    wellnessDayData.forEach(tempdata => {
        const {wellnessdayId, requestdate, userFullName, reportingManagerFullName} = tempdata

        data.requestlist.push({
            requestid: wellnessdayId,
            manager: reportingManagerFullName,
            user: userFullName,
            requestdate: requestdate,
            firstdayofwellnessdaycycle: new Date(firstdayoftheweek.setDate(diff)).toISOString().split('T')[0]
        })
    })

    return res.json({message: "success", data: data})
}

//  #endregion