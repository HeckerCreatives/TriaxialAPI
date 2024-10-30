const { default: mongoose } = require("mongoose");
const Workfromhome = require("../models/wfh")

//  #region ALL USERS

exports.showdatawfhrequest = async (req, res) => {
    const {id, email} = req.user

    const {requestid} = req.query

    if (!requestid){
        return res.status(400).json({message: "failed", data: "Please select a request first!"})
    }

    const requestdata = await Workfromhome.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(requestid)
            }
        },
        {
            $lookup: {
                from: 'userdetails', // The collection name of `userDetailsSchema`
                localField: 'owner',
                foreignField: 'owner',
                as: 'userDetails'
            }
        },
        { $unwind: '$userDetails' }, // Flatten the `userDetails` array
        {
            $project: {
                _id: 1,
                owner: 1,
                requestdate: 1,
                requestend: 1,
                wellnessdaycycle: 1,
                totalhourswfh: 1,
                hoursofleave: 1,
                reason: 1,
                fullname: 'userDetails.firstname' + 'userDetails.lastname',
                status: 1
            }
        },
    ])

    if (requestdata.length <= 0){
        return res.status(400).json({message: "failed", data: "Please select a valid WFH Request!"})
    }

    const data = {
        requestid: requestdata[0]._id,
        userid: requestdata[0].owner._id,
        requestdate: requestdata[0].requestdate,
        requestend: requestdata[0].requestend,
        wellnessdaycycle: requestdata[0].wellnessdaycycle,
        totalhourswfh: requestdata[0].totalhourswfh,
        hoursofleave: requestdata[0].hoursofleave,
        reason: requestdata[0].reason,
        fullname: requestdata[0].fullname
    }

    return res.json({message: "success", data: data})
}

//  #endregion

//  #region SUPERADMIN

exports.listwfhrequestadmin = async (req, res) => {
    const { id, email } = req.user;
    const { page, limit, statusfilter, fullnamefilter } = req.query;

    if (!statusfilter){
        return res.status(400).json({message: "failed", data: "Please select a status filter first!"})
    }

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10
    };

    let matchConditions = {};

    if (fullnamefilter) {
        matchConditions = {
            $or: [
                { 'userDetails.firstname': { $regex: fullnamefilter, $options: 'i' } }, // Case-insensitive search
                { 'userDetails.lastname': { $regex: fullnamefilter, $options: 'i' } },
                {
                    $expr: {
                        $regexMatch: {
                            input: { $concat: ['$userDetails.firstname', ' ', '$userDetails.lastname'] },
                            regex: fullnamefilter,
                            options: 'i'
                        }
                    }
                }
            ]
        };
    }

    const wfhlist = await Workfromhome.aggregate([
        {
            $match: {
                status: statusfilter
            }
        },
        {
            $lookup: {
                from: 'userdetails', // The collection name of `userDetailsSchema`
                localField: 'owner',
                foreignField: 'owner',
                as: 'userDetails'
            }
        },
        { $unwind: '$userDetails' }, // Flatten the `userDetails` array
        {
            $match: matchConditions // Apply the dynamic match conditions
        },
        {
            $project: {
                _id: 1,
                owner: 1,
                requestdate: 1,
                requestend: 1,
                wellnessdaycycle: 1,
                totalhourswfh: 1,
                hoursofleave: 1,
                reason: 1,
                fullname: {$concat: ['$userDetails.firstname', ' ', '$userDetails.lastname']},
                status: 1
            }
        },
        { $skip: pageOptions.page * pageOptions.limit }, // Skip documents based on page number
        { $limit: pageOptions.limit } // Limit the number of documents per page
    ])
    .catch(err => {
        console.log(`There's a problem with getting wfh list. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support for more details."})
    });

    // Get total count for pagination metadata
    const totalRecords = await Workfromhome.aggregate([
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
        { $match: matchConditions },
        { $count: "total" }
    ])
    .catch(err => {
        console.log(`There's a problem with getting wfh list count. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support for more details."})
    });

    const totalCount = totalRecords.length > 0 ? totalRecords[0].total : 0;
    const totalPages = Math.ceil(totalCount / pageOptions.limit);

    const data = {
        totalpage: totalPages,
        wfhlist: []
    }

    wfhlist.forEach(tempdata => {
        const {_id, owner, requestdate, requestend, wellnessdaycycle, totalhourswfh, hoursofleave, reason, status, fullname} = tempdata

        data.wfhlist.push({
            requestid: _id,
            userid: owner._id,
            fullname: fullname,
            requestdate: requestdate,
            requestend: requestend,
            wellnessdaycycle: wellnessdaycycle,
            totalhourswfh: totalhourswfh,
            hoursofleave: hoursofleave,
            reason: reason,
            status: status
        })
    })

    return res.json({message: "success", data: data});
};

exports.showdatawfhrequest = async (req, res) => {
    const {id, email} = req.user

    const {requestid} = req.query

    if (!requestid){
        return res.status(400).json({message: "failed", data: "Please select a request first!"})
    }

    const requestdata = await Workfromhome.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(requestid)
            }
        },
        {
            $lookup: {
                from: 'userdetails', // The collection name of `userDetailsSchema`
                localField: 'owner',
                foreignField: 'owner',
                as: 'userDetails'
            }
        },
        { $unwind: '$userDetails' }, // Flatten the `userDetails` array
        {
            $project: {
                _id: 1,
                owner: 1,
                requestdate: 1,
                requestend: 1,
                wellnessdaycycle: 1,
                totalhourswfh: 1,
                hoursofleave: 1,
                reason: 1,
                fullname: {$concat: ['$userDetails.firstname', ' ', '$userDetails.lastname']},
                status: 1
            }
        },
    ])

    if (requestdata.length <= 0){
        return res.status(400).json({message: "failed", data: "Please select a valid WFH Request!"})
    }

    const data = {
        requestid: requestdata[0]._id,
        userid: requestdata[0].owner._id,
        requestdate: requestdata[0].requestdate,
        requestend: requestdata[0].requestend,
        wellnessdaycycle: requestdata[0].wellnessdaycycle,
        totalhourswfh: requestdata[0].totalhourswfh,
        hoursofleave: requestdata[0].hoursofleave,
        reason: requestdata[0].reason,
        fullname: requestdata[0].fullname
    }

    return res.json({message: "success", data: data})
}

exports.approvewfhrequestadmin = async (req, res) => {
    const {id, email} = req.user

    const {requestid, approvalstatus} = req.body

    if (!approvalstatus){
        return res.status(400).json({message: "failed", data: "Please enter an approval status first!"})
    }
    else if (approvalstatus != "Approved" && approvalstatus != "Denied"){
        return res.status(400).json({message: "failed", data: "Invalid approval status! Please select Approved or Denied only!"})
    }

    await Workfromhome.findOneAndUpdate({_id: new mongoose.Types.ObjectId(requestid)}, {status: approvalstatus})
    .catch(err => {
        console.log(`There's a problem with approval of wfh request of ${requestid}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    return res.json({message: "success"})
}

//  #endregion

//  #region EMPLOYEE

exports.listwfhrequestemployee = async (req, res) => {
    const {id, email} = req.user

    const {page, limit, statusfilter} = req.query

    if (!statusfilter){
        return res.status(400).json({message: "failed", data: "Please select a status filter first!"})
    }

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10
    };

    const requestlist = await Workfromhome.find({status: statusfilter})
    .sort({createdAt: -1})
    .skip(pageOptions.page * pageOptions.limit)
    .limit(pageOptions.limit)
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem with wfh request list of ${email}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    const totallist = await Workfromhome.countDocuments({status: statusfilter})

    const data = {
        requestlist: [],
        totalpage: Math.ceil(totallist / pageOptions.limit),
    }

    requestlist.forEach(tempdata => {
        const {_id, requestdate, requestend, wellnessdaycycle, totalhourswfh, createdAt} = tempdata

        data.requestlist.push({
            requestid: _id,
            requestdate: requestdate,
            requestend: requestend,
            wellnessdaycycle: wellnessdaycycle,
            totalhourswfh: totalhourswfh,
            createdAt: createdAt
        })
    })

    return res.json({message: "success", data: data})
}

exports.requestwfhemployee = async (req, res) => {
    const {id, email} = req.user

    const {requestdate, requestend, wellnessdaycycle, totalhourswfh, hoursofleave, reason} = req.body

    if (!requestdate){
        return res.status(400).json({message: "failed", data: "Please select a request date first!"})
    }
    else if (!requestend){
        return res.status(400).json({message: "failed", data: "Please select a request end date first!"})
    }
    else if (wellnessdaycycle == null){
        return res.status(400).json({message: "failed", data: "Please select a wellness day cycle status first!"})
    }
    else if (totalhourswfh == null){
        return res.status(400).json({message: "failed", data: "Please select a request date and request end date first!"})
    }
    else if (hoursofleave == null){
        return res.status(400).json({message: "failed", data: "Please enter a hours of leave first!"})
    }
    else if (!reason){
        return res.status(400).json({message: "failed", data: "Please enter a reason for work from home first!"})
    }

    await Workfromhome.create({owner: new mongoose.Types.ObjectId(id), requestdate: requestdate, requestend: requestend, wellnessdaycycle: wellnessdaycycle, totalhourswfh: totalhourswfh, hoursofleave: hoursofleave, reason: reason, status: "Pending"})
    .catch(err => {
        console.log(`There's a problem requesting wfh by ${id}. Error: ${err}`)
        
        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    return res.json({message: "success"})
}

exports.editrequestwfhemployee = async (req, res) => {
    const {id, email} = req.user

    const {requestid, requestdate, requestend, wellnessdaycycle, totalhourswfh, hoursofleave, reason} = req.body

    if (!requestdate){
        return res.status(400).json({message: "failed", data: "Please select a request date first!"})
    }
    else if (!requestend){
        return res.status(400).json({message: "failed", data: "Please select a request end date first!"})
    }
    else if (wellnessdaycycle == null){
        return res.status(400).json({message: "failed", data: "Please select a wellness day cycle status first!"})
    }
    else if (totalhourswfh == null){
        return res.status(400).json({message: "failed", data: "Please select a request date and request end date first!"})
    }
    else if (hoursofleave == null){
        return res.status(400).json({message: "failed", data: "Please enter a hours of leave first!"})
    }
    else if (!reason){
        return res.status(400).json({message: "failed", data: "Please enter a reason for work from home first!"})
    }

    await Workfromhome.findOneAndUpdate({_id: new mongoose.Types.ObjectId(requestid)}, {requestdate: requestdate, requestend: requestend, wellnessdaycycle: wellnessdaycycle, totalhourswfh: totalhourswfh, hoursofleave: hoursofleave, reason: reason, status: "Pending"})
    .catch(err => {
        console.log(`There's a problem requesting wfh by ${id}. Error: ${err}`)
        
        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    return res.json({message: "success"})
}

//  #endregion

//  #region MANAGER

exports.listwfhrequestmanager = async (req, res) => {
    const { id, email } = req.user;
    const { page, limit, statusfilter, fullnamefilter } = req.query;

    if (!statusfilter){
        return res.status(400).json({message: "failed", data: "Please select a status filter first!"})
    }

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10
    };

    let matchConditions = {
        reportingto: new mongoose.Types.ObjectId(id)
    };

    if (fullnamefilter) {
        matchConditions["$or"] = [ 
            { 'userDetails.firstname': { $regex: fullnamefilter, $options: 'i' } }, // Case-insensitive search
            { 'userDetails.lastname': { $regex: fullnamefilter, $options: 'i' } },
            {
                $expr: {
                    $regexMatch: {
                        input: { $concat: ['$userDetails.firstname', ' ', '$userDetails.lastname'] },
                        regex: fullnamefilter,
                        options: 'i'
                    }
                }
            }
        ];
    }

    const wfhlist = await Workfromhome.aggregate([
        {
            $match: {
                status: statusfilter
            }
        },
        {
            $lookup: {
                from: 'userdetails', // The collection name of `userDetailsSchema`
                localField: 'owner',
                foreignField: 'owner',
                as: 'userDetails'
            }
        },
        { $unwind: '$userDetails' }, // Flatten the `userDetails` array
        {
            $match: matchConditions // Apply the dynamic match conditions
        },
        {
            $project: {
                _id: 1,
                owner: 1,
                requestdate: 1,
                requestend: 1,
                wellnessdaycycle: 1,
                totalhourswfh: 1,
                hoursofleave: 1,
                reason: 1,
                fullname: {$concat: ['$userDetails.firstname', ' ', '$userDetails.lastname']},
                status: 1
            }
        },
        { $skip: pageOptions.page * pageOptions.limit }, // Skip documents based on page number
        { $limit: pageOptions.limit } // Limit the number of documents per page
    ])
    .catch(err => {
        console.log(`There's a problem with getting wfh list. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support for more details."})
    });

    // Get total count for pagination metadata
    const totalRecords = await Workfromhome.aggregate([
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
        { $match: matchConditions },
        { $count: "total" }
    ])
    .catch(err => {
        console.log(`There's a problem with getting wfh list count. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support for more details."})
    });

    const totalCount = totalRecords.length > 0 ? totalRecords[0].total : 0;
    const totalPages = Math.ceil(totalCount / pageOptions.limit);

    const data = {
        totalpage: totalPages,
        wfhlist: []
    }

    wfhlist.forEach(tempdata => {
        const {_id, owner, requestdate, requestend, wellnessdaycycle, totalhourswfh, hoursofleave, reason, status, fullname} = tempdata

        data.wfhlist.push({
            requestid: _id,
            userid: owner._id,
            fullname: fullname,
            requestdate: requestdate,
            requestend: requestend,
            wellnessdaycycle: wellnessdaycycle,
            totalhourswfh: totalhourswfh,
            hoursofleave: hoursofleave,
            reason: reason,
            status: status
        })
    })

    return res.json({message: "success", data: data});
};

exports.approvewfhrequestmanager = async (req, res) => {
    const {id, email} = req.user

    const {requestid, approvalstatus} = req.body

    if (!approvalstatus){
        return res.status(400).json({message: "failed", data: "Please enter an approval status first!"})
    }
    else if (approvalstatus != "Approved" && approvalstatus != "Denied"){
        return res.status(400).json({message: "failed", data: "Invalid approval status! Please select Approved or Denied only!"})
    }

    await Workfromhome.findOneAndUpdate({_id: new mongoose.Types.ObjectId(requestid)}, {status: approvalstatus})
    .catch(err => {
        console.log(`There's a problem with approval of wfh request of ${requestid}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })


    return res.json({message: "success", data: data})
}

//  #endregion