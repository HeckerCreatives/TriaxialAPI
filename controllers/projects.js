const { default: mongoose } = require("mongoose")
const Projects = require("../models/Projects")

//  #region MANAGER

exports.createproject = async (req, res) => {
    const {id, email} = req.user

    const {team, projectname, client, startdate, deadlinedate} = req.body

    if (!team){
        return res.status(400).json({message: "failed", data: "Please select a team first!"})
    }
    else if (!projectname){
        return res.status(400).json({message: "failed", data: "Enter a project name!"})
    }
    else if (!client){
        return res.status(400).json({message: "failed", data: "Please select a client!"})
    }
    else if (!startdate){
        return res.status(400).json({message: "failed", data: "Please select a start date"})
    }
    else if (!deadlinedate){
        return res.status(400).json({message: "failed", data: "Please select a deadline date"})
    }

    await Projects.create({team: new mongoose.Types.ObjectId(team), projectname: projectname, client: client, invoiced: 0, status: "On-going", startdate: new Date(startdate), deadlinedate: new Date(deadlinedate)})
    .catch(err => {
        console.log(`There's a problem creating projects, project name: ${projectname}. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
    })

    return res.json({message: "success"})
}

exports.listprojects = async (req, res) => {
    const { id, email } = req.user;
    const { page, limit, searchproject } = req.query;

    // Set pagination options
    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10,
    };

    // Search filter
    let matchStage = {};
    if (searchproject) {
        matchStage["projectname"] = {
            $regex: searchproject, $options: 'i'
        };
    }

    const projectlist = await Projects.aggregate([
        { $match: matchStage },
        {
            $lookup: {
                from: 'teams',
                localField: 'team',
                foreignField: '_id',
                as: 'teamData'
            }
        },
        { $unwind: { path: '$teamData', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'jobcomponents',
                localField: '_id',
                foreignField: 'project',
                as: 'jobComponentData'
            }
        },
        { $unwind: { path: '$jobComponentData', preserveNullAndEmptyArrays: true } },
        {
            $match: {
                $or: [
                    { 'teamData.members': { $elemMatch: { $eq: new mongoose.Types.ObjectId(id) } } },
                    { 'jobComponentData.members': { $elemMatch: { employee: new mongoose.Types.ObjectId(id) } } },
                    { 'jobComponentData.jobmanager': new mongoose.Types.ObjectId(id) }
                ]
            }
        },
        // Lookup for manager details
        {
            $lookup: {
                from: 'userdetails',
                localField: 'teamData.manager',
                foreignField: 'owner',
                as: 'managerDetails'
            }
        },
        { $unwind: { path: '$managerDetails', preserveNullAndEmptyArrays: true } },
        {
            $group: {
                _id: '$_id',
                projectname: { $first: '$projectname' },
                invoiced: { $first: '$invoiced' },
                status: { $first: '$status' },
                startdate: { $first: '$startdate' },
                deadlinedate: { $first: '$deadlinedate' },
                teamname: { $first: '$teamData.teamname' },
                managerName: { $first: { $concat: ['$managerDetails.firstname', ' ', '$managerDetails.lastname'] } },
                createdAt: { $first: '$createdAt' },
                updatedAt: { $first: '$updatedAt' }
            }
        },
        { $skip: pageOptions.page * pageOptions.limit },
        { $limit: pageOptions.limit }
    ]);

    const total = await Projects.aggregate([
        { $match: matchStage },
        {
            $lookup: {
                from: 'teams',
                localField: 'team',
                foreignField: '_id',
                as: 'teamData'
            }
        },
        { $unwind: { path: '$teamData', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'jobcomponents',
                localField: '_id',
                foreignField: 'project',
                as: 'jobComponentData'
            }
        },
        { $unwind: { path: '$jobComponentData', preserveNullAndEmptyArrays: true } },
        {
            $match: {
                $or: [
                    { 'teamData.members': { $elemMatch: { $eq: new mongoose.Types.ObjectId(id) } } },
                    { 'jobComponentData.members': { $elemMatch: { employee: new mongoose.Types.ObjectId(id) } } },
                    { 'jobComponentData.jobmanager': new mongoose.Types.ObjectId(id) }
                ]
            }
        },
        { $count: 'total' }
    ]);

    const totalPages = Math.ceil((total[0]?.total || 0) / pageOptions.limit);

    const data = {
        projectlist,
        totalpages: totalPages
    };

    return res.json({message: "success", data: data})
};

exports.viewprojectdetails = async (req, res) => {
    const {id, email} = req.user

    const {projectid} = req.query

    if (!projectid){
        return res.status(400).json({message: "failed", data: "Select a valid project"})
    }

    const projectdata = await Projects.aggregate([
        {
            $lookup: {
                from: 'teams',
                localField: 'team',
                foreignField: '_id',
                as: 'teamData'
            }
        },
        { $unwind: { path: '$teamData', preserveNullAndEmptyArrays: true } },
        {
            $project: {
                _id: 1,
                projectname: 1,
                team: {
                    teamid: '$teamData._id',
                    teamname: '$teamData.teamname'
                },
                invoiced: 1,
                status: 1,
                startdate: 1,
                deadlinedate: 1
            }
        }
    ])
    .catch(err => {
        console.log(`There's a problem getting the project data for ${projectid}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support."})
    })

    if (projectdata.length <= 0){
        return res.json({message: "success", data: {
            projectdata: {}
        }})
    }
    
    const data = {
        projectdata: {
            projecid: projectdata[0]._id,
            projectname: projectdata[0].projectname,
            team: projectdata[0].team,
            invoiced: projectdata[0].invoiced,
            status: projectdata[0].status,
            startdate: projectdata[0].startdate,
            deadlinedate: projectdata[0].deadlinedate
        }
    }

    return res.json({message: "success", data: data})
}

exports.editproject = async (req, res) => {
    const {id, email} = req.user

    const {projectid, team, projectname, startdate, deadlinedate} = req.body

    if (!projectid){
        return res.status(400).json({message: "failed", data: "Please select a valid project first!"})
    }
    else if (!team){
        return res.status(400).json({message: "failed", data: "Please select a team first!"})
    }
    else if (!projectname){
        return res.status(400).json({message: "failed", data: "Enter a project name!"})
    }
    else if (!startdate){
        return res.status(400).json({message: "failed", data: "Please select a start date"})
    }
    else if (!deadlinedate){
        return res.status(400).json({message: "failed", data: "Please select a deadline date"})
    }

    await Projects.findOneAndUpdate({_id: new mongoose.Types.ObjectId(projectid)}, {team: new mongoose.Types.ObjectId(team), projectname: projectname, invoiced: 0, status: "On-going", startdate: new Date(startdate), deadlinedate: new Date(deadlinedate)})
    .catch(err => {
        console.log(`There's a problem updating projects, project name: ${projectname}. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
    })

    return res.json({message: "success"})
}

exports.changeprojectstatus = async (req, res) => {
    const {id, email} = req.user

    const {projectid, status} = req.body

    if (!status){
        return res.status(400).json({message: "failed", data: "Please select a status"})
    }
    else if (status != "On-going" && status != "Complete" && status != "Beyond Deadline"){
        return res.status(400).json({message: "failed", data: "Please select a status (On-going, Complete, or Beyond Deadline)"})
    }

    await Projects.findOneAndUpdate({_id: new mongoose.Types.ObjectId(projectid)}, {status: status})
    .catch(err => {
        console.log(`There's a problem updating status of project ${projectid}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support"})
    })

    return res.json({message: "success"})
}

//  #endregion

//  #region SUPERADMIN

exports.saprojectlist = async (req, res) => {
    const { id, email } = req.user;
    const { page, limit, searchproject } = req.query;

    // Set pagination options
    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10,
    };

    // Search filter
    let matchStage = {};
    if (searchproject) {
        matchStage["projectname"] = {
            $regex: searchproject, $options: 'i'
        };
    }

    const projectlist = await Projects.aggregate([
        { $match: matchStage },
        {
            $lookup: {
                from: 'teams',
                localField: 'team',
                foreignField: '_id',
                as: 'teamData'
            }
        },
        { $unwind: { path: '$teamData', preserveNullAndEmptyArrays: true } },
        // Lookup for manager details
        {
            $lookup: {
                from: 'userdetails',
                localField: 'teamData.manager',
                foreignField: 'owner',
                as: 'managerDetails'
            }
        },
        { $unwind: { path: '$managerDetails', preserveNullAndEmptyArrays: true } },
        {
            $group: {
                _id: '$_id',
                projectname: { $first: '$projectname' },
                invoiced: { $first: '$invoiced' },
                status: { $first: '$status' },
                startdate: { $first: '$startdate' },
                deadlinedate: { $first: '$deadlinedate' },
                teamname: { $first: '$teamData.teamname' },
                managerName: { $first: { $concat: ['$managerDetails.firstname', ' ', '$managerDetails.lastname'] } },
                createdAt: { $first: '$createdAt' },
                updatedAt: { $first: '$updatedAt' }
            }
        },
        { $skip: pageOptions.page * pageOptions.limit },
        { $limit: pageOptions.limit }
    ]);

    const total = await Projects.aggregate([
        { $match: matchStage },
        { $count: 'total' }
    ]);

    const totalPages = Math.ceil((total[0]?.total || 0) / pageOptions.limit);

    const data = {
        projectlist,
        totalpages: totalPages
    };

    return res.json({message: "success", data: data})
}

//  #endregion

//  #region EMPLOYEE

exports.listprojectsemployee = async (req, res) => {
    const { id, email } = req.user;
    const { page, limit, searchproject } = req.query;

    // Set pagination options
    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10,
    };

    // Search filter
    let matchStage = {};
    if (searchproject) {
        matchStage["projectname"] = {
            $regex: searchproject, $options: 'i'
        };
    }

    const projectlist = await Projects.aggregate([
        { $match: matchStage },
        {
            $lookup: {
                from: 'teams',
                localField: 'team',
                foreignField: '_id',
                as: 'teamData'
            }
        },
        { $unwind: { path: '$teamData', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'jobcomponents',
                localField: '_id',
                foreignField: 'project',
                as: 'jobComponentData'
            }
        },
        { $unwind: { path: '$jobComponentData', preserveNullAndEmptyArrays: true } },
        {
            $match: {
                $or: [
                    { 'teamData.members': { $elemMatch: { $eq: new mongoose.Types.ObjectId(id) } } },
                    { 'jobComponentData.members': { $elemMatch: { employee: new mongoose.Types.ObjectId(id) } } },
                    { 'jobComponentData.jobmanager': new mongoose.Types.ObjectId(id) }
                ]
            }
        },
        // Lookup for manager details
        {
            $lookup: {
                from: 'userdetails',
                localField: 'teamData.manager',
                foreignField: 'owner',
                as: 'managerDetails'
            }
        },
        { $unwind: { path: '$managerDetails', preserveNullAndEmptyArrays: true } },
        {
            $group: {
                _id: '$_id',
                projectname: { $first: '$projectname' },
                status: { $first: '$status' },
                startdate: { $first: '$startdate' },
                deadlinedate: { $first: '$deadlinedate' },
                teamname: { $first: '$teamData.teamname' },
                managerName: { $first: { $concat: ['$managerDetails.firstname', ' ', '$managerDetails.lastname'] } },
                createdAt: { $first: '$createdAt' },
                updatedAt: { $first: '$updatedAt' }
            }
        },
        { $skip: pageOptions.page * pageOptions.limit },
        { $limit: pageOptions.limit }
    ]);

    const total = await Projects.aggregate([
        { $match: matchStage },
        {
            $lookup: {
                from: 'teams',
                localField: 'team',
                foreignField: '_id',
                as: 'teamData'
            }
        },
        { $unwind: { path: '$teamData', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'jobcomponents',
                localField: '_id',
                foreignField: 'project',
                as: 'jobComponentData'
            }
        },
        { $unwind: { path: '$jobComponentData', preserveNullAndEmptyArrays: true } },
        {
            $match: {
                $or: [
                    { 'teamData.members': { $elemMatch: { $eq: new mongoose.Types.ObjectId(id) } } },
                    { 'jobComponentData.members': { $elemMatch: { employee: new mongoose.Types.ObjectId(id) } } },
                    { 'jobComponentData.jobmanager': new mongoose.Types.ObjectId(id) }
                ]
            }
        },
        { $count: 'total' }
    ]);

    const totalPages = Math.ceil((total[0]?.total || 0) / pageOptions.limit);

    const data = {
        projectlist,
        totalpages: totalPages
    };

    return res.json({message: "success", data: data})
};

//  #endregion