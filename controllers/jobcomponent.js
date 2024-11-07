const { default: mongoose } = require("mongoose")
const Jobcomponents = require("../models/Jobcomponents")
const Projects = require("../models/Projects")

//  #region MANAGER

exports.createjobcomponent = async (req, res) => {
    const {id, email} = req.user

    const {projectid, jobcomponentvalue} = req.body


    if (!projectid){
        return res.status(400).json({message: "failed", data: "Please select a valid project"})
    }
    else if (!jobcomponentvalue){
        return res.status(400).json({message: "failed", data: "Please complete the job component form!"})
    }
    else if (!Array.isArray(jobcomponentvalue)){
        return res.status(400).json({message: "failed", data: "The form you saving is not valid!"})
    }
    else if (jobcomponentvalue["jobno"] == null){
        return res.status(400).json({message: "failed", data: "Please enter job no"})
    }
    else if (jobcomponentvalue["jobmanager"] == null){
        return res.status(400).json({message: "failed", data: "Please select job manager"})
    }
    else if (jobcomponentvalue["budgettype"] == null){
        return res.status(400).json({message: "failed", data: "Please select budget type"})
    }
    else if (jobcomponentvalue["estimatedbudget"] == null){
        return res.status(400).json({message: "failed", data: "Please enter estimated budget for job component"})
    }
    else if (jobcomponentvalue["jobcomponent"] == null){
        return res.status(400).json({message: "failed", data: "Please enter job component name"})
    }

    const projectdata = await Projects.findOne({_id: new mongoose.Types.ObjectId(projectid)})
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting project details for project: ${projectid}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support"})
    })

    if (!projectdata){
        return res.status(403).json({message: "failed", data: "No existing project data. Please select a valid project"})
    }

    const members = [
        {
            role: "Engr.",
            notes: "",
            dates: []
        },
        {
            role: "Engr. Revr",
            notes: "",
            dates: []
        },
        {
            role: "Drft.",
            notes: "",
            dates: []
        },
        {
            role: "Drft. Revr.",
            notes: "",
            dates: []
        }
    ]

    const componentBulkWrite = []

    jobcomponentvalue.forEach(tempdata => {
        const {jobno, jobmanager, budgettype, estimatedbudget, jobcomponent} = tempdata

        componentBulkWrite.push({
            project: new mongoose.Types.ObjectId(projectdata._id), 
            jobno: jobno,
            jobmanager: new mongoose.Types.ObjectId(jobmanager),
            budgettype: budgettype,
            estimatedbudget: estimatedbudget,
            jobcomponent: jobcomponent,
            members: members
        })
    })

    await Jobcomponents.insertMany(componentBulkWrite)
    .catch(err => {
        console.log(`There's a problem getting saving job components: ${projectid}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support"})
    })

    return res.json({message: "success"})
}

exports.editprojectmanager = async (req, res) => {
    // const {}
}

//  #endregion