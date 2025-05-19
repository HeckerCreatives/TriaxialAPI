const { default: mongoose } = require("mongoose")
const Projects = require("../models/Projects")
const Jobcomponents = require("../models/Jobcomponents")

//  #region MANAGER

exports.createproject = async (req, res) => {
    const {id, email} = req.user

    const {jobno, team, projectname, client, startdate, deadlinedate} = req.body

    if (!team){
        return res.status(400).json({message: "failed", data: "Please select a team first!"})
    }
    else if (!jobno){
        return res.status(400).json({message: "failed", data: "Enter a job number first!"})
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

    await Projects.create({team: new mongoose.Types.ObjectId(team), jobno: jobno, projectname: projectname, client: new mongoose.Types.ObjectId(client), invoiced: 0, status: "On-going", startdate: new Date(startdate), deadlinedate: new Date(deadlinedate)})
    .catch(err => {
        console.log(`There's a problem creating projects, project name: ${projectname}. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
    })

    return res.json({message: "success"})
}

exports.createprojectvariation = async (req, res) => {
    const {id, email} = req.user

    const {jobno, team, projectname, client, startdate, deadlinedate, projectid } = req.body

    if (!team){
        return res.status(400).json({message: "failed", data: "Please select a team first!"})
    }
    else if (!jobno){
        return res.status(400).json({message: "failed", data: "Enter a job number first!"})
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

    await Projects.create({
        team: new mongoose.Types.ObjectId(team),
        jobno: jobno,
        projectname: projectname,
        client: new mongoose.Types.ObjectId(client),
        invoiced: 0,
        status: "On-going",
        startdate: new Date(startdate),
        deadlinedate: new Date(deadlinedate),
      })
        .then(async (newProject) => {
          const originalData = await Jobcomponents.find({ project: new mongoose.Types.ObjectId(projectid) }).lean();
      
          const duplicatedData = originalData.map((doc) => {
            const newDoc = { ...doc };
      
            delete newDoc._id;
      
            newDoc.project = newProject._id;
      
            newDoc.members = newDoc.members.map((member) => {
              const newMember = { ...member };
              delete newMember.dates;
              return newMember;
            });
      
            newDoc.duplicatedAt = new Date();
      
            return newDoc;
          });
      
           await Jobcomponents.insertMany(duplicatedData)
           .catch(err => {
            console.log(`There's a problem while creating Project Variation. Error: ${err}`)
           })

           return res.status(200).json({ message: "success" })
      
        })
        .catch((error) => {
          console.error("Error creating project and duplicating Jobcomponents:", error);
        });
      

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
       matchStage = {
            $or: [
                { projectname: { $regex: searchproject, $options: 'i' } },
                { jobno: { $regex: searchproject, $options: 'i' } },
                { 'teamData.teamname': { $regex: searchproject, $options: 'i' } },
                { 'clientData.clientname': { $regex: searchproject, $options: 'i' } }
            ]
       }
    }

    const projectlist = await Projects.aggregate([
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
                from: 'clients',
                localField: 'client',
                foreignField: '_id',
                as: 'clientData'
            }
        },
        { $unwind: { path: '$clientData', preserveNullAndEmptyArrays: true } },
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
            $lookup: {
                from: 'userdetails',
                localField: 'jobComponentData.members.employee',
                foreignField: 'owner',
                as: 'jobComponentMemberDetails'
            }
        },
        {
            $addFields: {
                'jobComponentData.memberInitials': {
                    $map: {
                        input: '$jobComponentMemberDetails',
                        as: 'member',
                        in: '$$member.initial'
                    }
                }
            }
        },
        { $match: matchStage },
        {
            $match: {
                $or: [
                    { 'teamData.manager': new mongoose.Types.ObjectId(id) },
                    { 'teamData.teamleader': new mongoose.Types.ObjectId(id) },
                    { 'teamData.members': { $elemMatch: { $eq: new mongoose.Types.ObjectId(id) } } },
                    { 'jobComponentData.members': { $elemMatch: { employee: new mongoose.Types.ObjectId(id) } } },
                    { 'jobComponentData.jobmanager': new mongoose.Types.ObjectId(id) }
                ]
            }
        },
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
                jobno: { $first: '$jobno' },
                invoiced: { $first: '$invoiced' },
                status: { $first: '$status' },
                startdate: { $first: '$startdate' },
                deadlinedate: { $first: '$deadlinedate' },
                teamname: { $first: '$teamData.teamname' },
                teamid: { $first: '$teamData._id' },
                client: { $first: '$clientData.clientname' },
                priority: { $first: '$clientData.priority' },
                managerName: { $first: { $concat: ['$managerDetails.firstname', ' ', '$managerDetails.lastname'] } },
                createdAt: { $first: '$createdAt' },
                updatedAt: { $first: '$updatedAt' },
                jobComponents: {
                    $push: {
                        name: '$jobComponentData.jobcomponent',
                        id: '$jobComponentData._id',
                        isVariation: '$jobComponentData.isVariation',
                        estimatedBudget: '$jobComponentData.estimatedbudget',
                        members: '$jobComponentData.memberInitials'
                    }
                }
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
                    { 'teamData.manager': new mongoose.Types.ObjectId(id) },
                    { 'teamData.teamleader': new mongoose.Types.ObjectId(id) },
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

exports.listprojectsuperadmin = async (req, res) => {
    const { id, email } = req.user;
    const { page, limit, searchproject, filter } = req.query;

    // Set pagination options
    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10,
    };

    // Search filter
    let matchStage = {};
    let filterStage = {}
    if (searchproject) {
        matchStage["projectname"] = {
            $regex: searchproject, $options: 'i'
        };
    }

    // filter is teamid
    if (filter) {
        filterStage["team"] = new mongoose.Types.ObjectId(filter);
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
        { $match: filterStage },
        { $unwind: { path: '$teamData', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'clients',
                localField: 'client',
                foreignField: '_id',
                as: 'clientData'
            }
        },
        { $unwind: { path: '$clientData', preserveNullAndEmptyArrays: true } },
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
            $lookup: {
                from: 'userdetails',
                localField: 'jobComponentData.members.employee',
                foreignField: 'owner',
                as: 'jobComponentMemberDetails'
            }
        },
        {
            $addFields: {
                'jobComponentData.memberDetails': {
                    $map: {
                        input: '$jobComponentMemberDetails',
                        as: 'member',
                        in: {
                            initial: '$$member.initial',
                            id: '$$member.owner'
                        }
                    }
                }
            }
        },
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
                jobno: { $first: '$jobno' },
                invoiced: { $first: '$invoiced' },
                status: { $first: '$status' },
                startdate: { $first: '$startdate' },
                deadlinedate: { $first: '$deadlinedate' },
                teamname: { $first: '$teamData.teamname' },
                teamid: { $first: '$teamData._id' },
                client: { $first: '$clientData.clientname' },
                priority: { $first: '$clientData.priority' },
                managerName: { $first: { $concat: ['$managerDetails.firstname', ' ', '$managerDetails.lastname'] } },
                createdAt: { $first: '$createdAt' },
                updatedAt: { $first: '$updatedAt' },
                jobComponents: {
                    $push: {
                        name: '$jobComponentData.jobcomponent',
                        id: '$jobComponentData._id',
                        isVariation: '$jobComponentData.isVariation',
                        estimatedBudget: '$jobComponentData.estimatedbudget',
                        members: '$jobComponentData.memberDetails'
                    }
                }
            }
        },
        { $skip: pageOptions.page * pageOptions.limit },
        { $limit: pageOptions.limit },
        { $sort: { "teamid": -1 } }
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
                    { 'teamData.manager': new mongoose.Types.ObjectId(id) },
                    { 'teamData.teamleader': new mongoose.Types.ObjectId(id) },
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

    const {projectid, jobno, clientid, team, projectname, startdate, deadlinedate} = req.body

    if (!projectid){
        return res.status(400).json({message: "failed", data: "Please select a valid project first!"})
    }
    else if (!jobno){
        return res.status(400).json({message: "failed", data: "Enter a job number first!"})
    }
    else if (!clientid){
        return res.status(400).json({message: "failed", data: "Please select a valid client first!"})
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

    await Projects.findOneAndUpdate({_id: new mongoose.Types.ObjectId(projectid)}, {team: new mongoose.Types.ObjectId(team), jobno: jobno, client: clientid, projectname: projectname, invoiced: 0, status: "On-going", startdate: new Date(startdate), deadlinedate: new Date(deadlinedate)})
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

exports.listallprojects = async (req, res) => {
    const { id, email } = req.user;
    const { searchproject } = req.query;

    // Search filter
    let matchStage = {};
    if (searchproject) {
        matchStage["projectname"] = {
            $regex: searchproject, $options: 'i'
        };
    }

    const projectlist = await Projects.find(matchStage)
    .then(data => data);

    const data = {
        projectlist: []
    };

    projectlist.forEach(tempdata => {
        const {_id, projectname} = tempdata

        data.projectlist.push({
            projectid: _id,
            projectname: projectname
        })
    })

    return res.json({message: "success", data: data})
};

//  #endregion

//  #region SUPERADMIN

exports.saprojectlist = async (req, res) => {
    const { id, email } = req.user;
    const { page, limit, searchproject, teamid } = req.query;

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
        ...(teamid ? [ { $match: { "teamData._id": new mongoose.Types.ObjectId(teamid)}}]: []),
        {
            $lookup: {
                from: 'clients',
                localField: 'client',
                foreignField: '_id',
                as: 'clientData'
            }
        },
        { $unwind: { path: '$clientData', preserveNullAndEmptyArrays: true } },
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
                client: { $first: '$clientData.clientname' },
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

exports.teamprojectlist = async (req, res) => {
    const { id, email } = req.user;
    const { page, limit, teamid } = req.query;

    // Set pagination options
    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10,
    };

    if (!teamid){
        return res.status(400).json({message: "failed", data: "Please select a valid team"})
    }

    const projectlist = await Projects.aggregate([
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
            $match: {
                'teamData._id': new mongoose.Types.ObjectId(teamid)
            }
        },
        {
            $lookup: {
                from: 'clients',
                localField: 'client',
                foreignField: '_id',
                as: 'clientData'
            }
        },
        { $unwind: { path: '$clientData', preserveNullAndEmptyArrays: true } },
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
                client: { $first: '$clientData.clientname' },
                managerName: { $first: { $concat: ['$managerDetails.firstname', ' ', '$managerDetails.lastname'] } },
                createdAt: { $first: '$createdAt' },
                updatedAt: { $first: '$updatedAt' }
            }
        },
        { $skip: pageOptions.page * pageOptions.limit },
        { $limit: pageOptions.limit }
    ]);

    const total = await Projects.aggregate([
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
            $match: {
                'teamData._id': new mongoose.Types.ObjectId(teamid)
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
                from: 'clients',
                localField: 'client',
                foreignField: '_id',
                as: 'clientData'
            }
        },
        { $unwind: { path: '$clientData', preserveNullAndEmptyArrays: true } },
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
                jobno: { $first: '$jobno' },
                status: { $first: '$status' },
                startdate: { $first: '$startdate' },
                deadlinedate: { $first: '$deadlinedate' },
                teamname: { $first: '$teamData.teamname' },
                client: { $first: '$clientData.clientname' },
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