const { default: mongoose } = require("mongoose")
const Jobcomponents = require("../models/Jobcomponents")
const Projects = require("../models/Projects")
const moment = require("moment-timezone");
const Users = require("../models/Users");
const { sendmail } = require("../utils/email");
const Clients = require("../models/Clients");
const { getAllUserIdsExceptSender } = require("../utils/user");
const Teams = require("../models/Teams");
const Invoice = require("../models/invoice");
const Userdetails = require("../models/Userdetails");
const { formatCurrency } = require("../utils/currency");
const Leave = require("../models/leave");
const Workfromhome = require("../models/wfh");
const Wellnessday = require("../models/wellnessday");
const Events = require("../models/events");
const { changepositionemployee } = require("./users");

//  #region MANAGER
exports.createjobcomponent = async (req, res) => {
    const { id, email } = req.user;
    const { jobcomponentvalue, clientid, projectname, start, teamid, jobno, priority, isvariation, description, adminnotes } = req.body;

    if (!teamid) return res.status(400).json({ message: "failed", data: "Please select a team first!" });
    if (!jobno) return res.status(400).json({ message: "failed", data: "Enter a job number first!" });
    if (!projectname) return res.status(400).json({ message: "failed", data: "Enter a project name!" });
    if (!start) return res.status(400).json({ message: "failed", data: "Please select a start date" });

    if (!jobcomponentvalue || !Array.isArray(jobcomponentvalue)) {
        return res.status(400).json({ message: "failed", data: "Invalid job component form!" });
    }

    let startdate 
    let end

    let parsedDate;
    if (moment(start, 'YYYY-MM-DD', true).isValid()) {
        parsedDate = moment(start, 'YYYY-MM-DD');
    } else if (moment(start, 'M/D/YYYY', true).isValid()) {
        parsedDate = moment(start, 'M/D/YYYY');
    } else {
        return res.status(400).json({ message: "failed", data: "Invalid date format. Use YYYY-MM-DD or M/D/YYYY" });
    }
    
    startdate = parsedDate.toDate();
    end = parsedDate.clone().add(1, 'years').toDate();
    
    let jobmanagerz
    let client;
    if (!mongoose.Types.ObjectId.isValid(clientid)) {
        try {
            // check if clientname is existing
            const clientExists = await Clients.findOne({ clientname: clientid });

            if (clientExists) {
                client = clientExists._id;
            } else {    
                const createClient = await Clients.create({ 
                    clientname: clientid || 'Unknown Client', 
                    priority: "Others" 
                });
                client = createClient._id;
            }
        } catch (err) {
            console.error('Error handling client:', err);
            return res.status(400).json({ 
                message: "failed", 
                data: "Error creating/finding client" 
            });
        }
    } else {
        client = clientid;
    }

    // Validate client before using
    if (!client) {
        return res.status(400).json({
            message: "failed",
            data: "Invalid client data"
        });
    }

    try {
        const projectdata = await Projects.create({
            team: new mongoose.Types.ObjectId(teamid),
            jobno,
            projectname,
            client: new mongoose.Types.ObjectId(client),
            invoiced: 0,
            status: "On-going",
            startdate: startdate,
            deadlinedate: end,
        });

        if (!projectdata) {
            return res.status(403).json({ message: "failed", data: "Invalid project selection" });
        }

        const componentBulkWrite = [];
        const emailDetails = [];
        const jobManagerIds = new Set();
        const allEmployeeIds = new Set();

        for (const job of jobcomponentvalue) {
            const { jobmanager, budgettype, estimatedbudget, jobcomponent, members } = job;

            jobmanagerz = jobmanager || null;
            if (!Array.isArray(members)) {
                return res.status(400).json({ message: "failed", data: "Invalid selected members" });
            }

            const membersArray = members.map(({ employeeid, role }) => {
                if (employeeid) allEmployeeIds.add(employeeid);
                return { employee: employeeid ? new mongoose.Types.ObjectId(employeeid) : null, role, notes: "", dates: [] };
            });

            componentBulkWrite.push({
                project: new mongoose.Types.ObjectId(projectdata._id),
                jobmanager: new mongoose.Types.ObjectId(jobmanager),
                budgettype,
                isVariation: isvariation,
                adminnotes: adminnotes,
                comments: description,
                estimatedbudget,
                jobcomponent,
                members: membersArray,
            });

            jobManagerIds.add(jobmanager);
            emailDetails.push({ jobcomponent, jobmanager, budgettype, estimatedbudget });
        }

        await Jobcomponents.insertMany(componentBulkWrite);

        const financeUsers = await Users.findOne({ auth: "finance" }).select("_id");
        const superadminUsers = await Users.find({ auth: "superadmin" }).select("_id");

        const team = await Teams.findById(teamid).select("manager members teamname").populate("members", "_id");
        const teamMemberIds = team ? team.members.map(m => m._id.toString()) : [];
        const feesemail = await Users.findOne({ email: "fees@triaxial.au" })
        .catch(err => {
            console.log(`There's moa problem with getting the fees email details for email content details in create job component. Error: ${err}`)
        })

        const allRecipientIds = new Set([
            ...(financeUsers?._id ? [financeUsers?._id.toString()] : []),             
            ...jobManagerIds,
            ...(feesemail?._id ? [feesemail?._id.toString()] : []) // Conditionally add fees email if it exists
        ]);

        allRecipientIds.delete(id); 
        
        const project = await Projects.findOne({ _id: new mongoose.Types.ObjectId(projectdata._id) })
        .catch(err => {
            console.log(`There's a problem with getting the project details for email content details in create job component. Error: ${err}`)
            return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
        })
        const clientz = await Clients.findOne({ _id: new mongoose.Types.ObjectId(client) })
        .catch(err => {
            console.log(`There's a problem with getting the client details for email content details in create job component. Error: ${err}`)
            return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
        })
        const jobManager = await Userdetails.findOne({ owner: new mongoose.Types.ObjectId(jobmanagerz) })
        .catch(err => {
            console.log(`There's a problem with getting the job manager details for email content details in create job component. Error: ${err}`)
            return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
        })


        let emailContent
        let titlecontent

        if(isvariation === true){
        emailContent = `
        A component of the project shown below is a Variation Project.
                                        
        Team Name:                    ${team.teamname}
        Job Manager:                  ${jobManager.firstname} ${jobManager.lastname}
        Job Number:                   ${project.jobno}
        Client Name:                  ${clientz.clientname}
        Project Name:                 ${project.projectname}
        Variation Fee:                $${jobcomponentvalue[0].estimatedbudget}
        Variation Name:               ${jobcomponentvalue[0].jobcomponent}
        Description:                  ${description}
        Admin Notes:                  ${adminnotes}

        Note: This is an auto generated message.
        `;

        titlecontent = `${project.jobno} - ${project.projectname} - Variation Project`
        } else {
        emailContent = `
        A component of the project shown below has been created.
    
        Team Name:                    ${team.teamname}
        Job Manager:                  ${jobManager.firstname} ${jobManager.lastname}
        Job Number:                   ${project.jobno}
        Client Name:                  ${clientz.clientname}
        Project Name:                 ${project.projectname}
        Budget Fee:                   $${formatCurrency(jobcomponentvalue[0].estimatedbudget)}
        Job Component:                ${jobcomponentvalue[0].jobcomponent}
    
        Note: This is an auto generated message.
    `;
            titlecontent = `${project.jobno} - ${project.projectname} - New Job Component`
        }

        await sendmail(new mongoose.Types.ObjectId(id), Array.from(allRecipientIds), titlecontent, emailContent)
            .catch(err => console.error("Failed to send email:", err));

        return res.json({ message: "success" });
    } catch (err) {
        console.error("Error saving job components:", err);
        return res.status(500).json({ message: "server-error", data: "Server error! Contact support." });
    }
};

exports.createvariationjobcomponent = async (req, res) => {
    const { id, email } = req.user;
    const { projectid, jobcomponentvalue } = req.body;

    if (!projectid) {
        return res.status(400).json({ message: "failed", data: "Please select a valid project" });
    } else if (!jobcomponentvalue) {
        return res.status(400).json({ message: "failed", data: "Please complete the job component form!" });
    } else if (!Array.isArray(jobcomponentvalue)) {
        return res.status(400).json({ message: "failed", data: "The form you are saving is not valid!" });
    }

    try {
        const projectdata = await Projects.findOne({ _id: new mongoose.Types.ObjectId(projectid) }).populate('team');
        if (!projectdata) {
            return res.status(403).json({ message: "failed", data: "No existing project data. Please select a valid project" });
        }

        const componentBulkWrite = [];
        const emailDetails = [];
        const jobManagerIds = new Set();

        for (let i = 0; i < jobcomponentvalue.length; i++) {
            const { jobmanager, budgettype, estimatedbudget, jobcomponent, members } = jobcomponentvalue[i];
            if (!Array.isArray(members)) {
                return res.status(400).json({ message: "failed", data: "Invalid selected members" });
            }

            const membersArray = members.map(tempdata => {
                const { employeeid, role } = tempdata;
                return {
                    employee: employeeid ? new mongoose.Types.ObjectId(employeeid) : null,
                    role: role,
                    notes: "",
                    dates: []
                };
            });

            componentBulkWrite.push({
                project: new mongoose.Types.ObjectId(projectdata._id),
                jobmanager: new mongoose.Types.ObjectId(jobmanager),
                budgettype: budgettype,
                isVariation: true,
                estimatedbudget: estimatedbudget,
                jobcomponent: jobcomponent,
                members: membersArray
            });

            const jobManager = await Users.findOne({ _id: new mongoose.Types.ObjectId(jobmanager) });
            if (jobManager && jobManager._id) {
                jobManagerIds.add(jobManager._id);
            }

            


            const employeeIds = members.map(m => m.employeeid).filter(id => id);

            // Lookup employee details
            const employeeDetails = await Userdetails.find({
                owner: { $in: employeeIds.map(id => new mongoose.Types.ObjectId(id)) }
            });

            // Create a map of employee IDs to full names
            const employeeNameMap = employeeDetails.reduce((map, employee) => {
                map[employee.owner.toString()] = `${employee.firstname} ${employee.lastname}`;
                return map;
            }, {});

            // Update the emailDetails push
            emailDetails.push({
                jobcomponent,
                jobmanager: jobManager ? `${jobManager.firstname} ${jobManager.lastname}` : "Unknown Manager",
                budgettype,
                estimatedbudget,
                members: members.map(m => 
                    `Employee: ${employeeNameMap[m.employeeid] || 'Unknown'}, Role: ${m.role}`
                ).join(", ")
            });
        }

        await Jobcomponents.insertMany(componentBulkWrite);

        const financeUsers = await Users.find({ auth: "finance" });
        const superadminUsers = await Users.find({ auth: "superadmin" });
        const financeUserIds = financeUsers.map(user => user._id);
        const superadminUserIds = superadminUsers.map(user => user._id);

        const teams = projectdata.team;
        const teamMemberIds = [
            teams.manager,
        ].filter(Boolean);

        const allRecipientIds = Array.from(new Set([
            ...financeUserIds,
            ...superadminUserIds,
            ...teamMemberIds,
            ...jobManagerIds
        ]));


        const sender = new mongoose.Types.ObjectId(id);
        await sendmail(sender, allRecipientIds, "New Job Components Created", emailContent, false)
            .catch(err => {
                console.error(`Failed to send email notification. Error: ${err}`);
            });

        return res.json({ message: "success" });
    } catch (err) {
        console.error(`There's a problem saving job components for project: ${projectid}. Error: ${err}`);
        return res.status(500).json({ message: "server-error", data: "There's a problem with the server. Please contact customer support." });
    }
};
exports.editjobcomponentdetails = async (req, res) => {
    const { id, email } = req.user;
    const { jobcomponentid, projectid, jobmanagerid } = req.body;

    if (!jobcomponentid) {
        return res.status(400).json({ message: "failed", data: "Select a valid job component" });
    } else if (!projectid) {
        return res.status(400).json({ message: "failed", data: "Select a valid project" });
    } else if (!jobmanagerid) {
        return res.status(400).json({ message: "failed", data: "Select a valid job manager" });
    }

    try {
        // Fetch job component details
        const jobcomponent = await Jobcomponents.findById(new mongoose.Types.ObjectId(jobcomponentid));
        if (!jobcomponent) {
            return res.status(404).json({ message: "failed", data: "Job component not found" });
        }

        const jobName = jobcomponent.jobcomponent;

        // Fetch project details
        const projectdata = await Projects.findOne({ _id: new mongoose.Types.ObjectId(projectid) }).populate('team');
        if (!projectdata) {
            return res.status(404).json({ message: "failed", data: "Project not found" });
        }

        // Update job component details
        await Jobcomponents.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(jobcomponentid) },
            {
                project: new mongoose.Types.ObjectId(projectid),
                jobmanager: new mongoose.Types.ObjectId(jobmanagerid),
            }
        );

        // Fetch relevant users for email notification
        const financeUsers = await Users.find({ auth: "finance" });
        const superadminUsers = await Users.find({ auth: "superadmin" });
        const team = projectdata.team;

        const financeUserIds = financeUsers.map(user => user._id);
        const superadminUserIds = superadminUsers.map(user => user._id);
        const teamMemberIds = [
            team.manager,
        ].filter(Boolean);

        const allRecipientIds = Array.from(new Set([
            ...financeUserIds,
            ...superadminUserIds,
            ...teamMemberIds,
            new mongoose.Types.ObjectId(jobmanagerid)
        ]));

        // Construct email content
        // Get job manager details first
        const jobManagerDetails = await Userdetails.findOne({ owner: new mongoose.Types.ObjectId(jobmanagerid) });
        if (!jobManagerDetails) {
            return res.status(404).json({ message: "failed", data: "Job manager details not found" });
        }

        const emailContent = `
        Good Day,
        
        The job component "${jobName}" has been updated with new details:
        
        Project Name:            ${projectdata.projectname}
        New Job Manager:         ${jobManagerDetails.firstname} ${jobManagerDetails.lastname}
        
        Note: This is an auto-generated message.
        `;

        // Send email notification
        const sender = new mongoose.Types.ObjectId(id);
        await sendmail(sender, allRecipientIds, "Job Component Details Updated", emailContent, false)
            .catch(err => {
                console.error(`Failed to send email notification for updated job component: ${jobcomponentid}. Error: ${err}`);
                return res.status(400).json({
                    message: "bad-request",
                    data: "Email notification failed! Please contact customer support for more details.",
                });
            });

        return res.json({ message: "success" });
    } catch (err) {
        console.error(`There's a problem with editing the job component details ${jobcomponentid}. Error: ${err}`);
        return res.status(500).json({
            message: "server-error",
            data: "There's a problem with the server. Please contact customer support.",
        });
    }
};

// exports.editalljobcomponentdetails = async (req, res) => {
//     const { id, email } = req.user;
//     const { jobcomponentid, projectid, jobmanagerid, members } = req.body;

//     // Validate input
//     if (!jobcomponentid) {
//         return res.status(400).json({ message: "failed", data: "Select a valid job component" });
//     }
//     if (!projectid) {
//         return res.status(400).json({ message: "failed", data: "Select a valid project" });
//     }
//     if (!jobmanagerid) {
//         return res.status(400).json({ message: "failed", data: "Select a valid job manager" });
//     }
//     if (!Array.isArray(members) || members.length < 1 || members.length > 4) {
//         return res.status(400).json({ message: "failed", data: "Invalid members data. There should be 1 to 4 members." });
//     }

//     try {
//         // Fetch the job component
//         const jobcomponent = await Jobcomponents.findById(jobcomponentid);
//         if (!jobcomponent) {
//             return res.status(404).json({ message: "failed", data: "Job component not found" });
//         }

//         const jobName = jobcomponent.jobcomponent;

//         // Update job component details
//         await Jobcomponents.findByIdAndUpdate(jobcomponentid, {
//             project: projectid,
//             jobmanager: jobmanagerid,
//         });

//         // Ensure unique roles and update members
//         const employeeRoleMap = new Map();

//         for (const memberData of members) {
            
//             const { employee, role, notes } = memberData;

//             if (employeeRoleMap.has(employee)) {
//                 return res.status(400).json({
//                     message: "failed",
//                     data: `Employee ${employee} cannot have more than one role.`,
//                 });
//             }

//             if ([...employeeRoleMap.values()].includes(role)) {
//                 return res.status(400).json({
//                     message: "failed",
//                     data: `The role "${role}" has already been assigned to another member.`,
//                 });
//             }

//             employeeRoleMap.set(employee, role);


//             const memberIndex = jobcomponent.members.findIndex(
//                 (m) => m.employee?.toString() === employee.toString()
//             );

//             if (memberIndex !== -1) {
//                 // Update existing member's details
//                 jobcomponent.members[memberIndex].role = role;
//                 jobcomponent.members[memberIndex].notes = notes || jobcomponent.members[memberIndex].notes;
//             } else {
//                 // Add new member
//                 if (jobcomponent.members.length >= 4) {
//                     jobcomponent.members.shift(); // Maintain a maximum of 4 members
//                 }
//                 jobcomponent.members.push({
//                     employee,
//                     role,
//                     notes,
//                     dates: [], // Reset dates
//                 });
//             }
//         }

//         await jobcomponent.save();

//         // Construct email content
//         const emailContent = `
//             Hello Team,
            
//             The job component "${jobName}" has been updated with the following details:
            
//             Project ID: ${projectid}
//             Job Manager ID: ${jobmanagerid}
//             Updated Members:
//             ${members.map(member => `Employee: ${member.employee}, Role: ${member.role}`).join("\n")}
            
//             If you have any questions or concerns, please reach out.
            
//             Thank you!
            
//             Best Regards,
//             ${email}`;

//         // Send email notification
//         const sender = new mongoose.Types.ObjectId(id);
//         const recipientIds = []; // Add appropriate recipient logic here if needed
//         await sendmail(sender, recipientIds, "Job Component Details Updated", emailContent, true)
//             .catch(err => {
//                 console.error(`Failed to send email notification for updated job component: ${jobcomponentid}. Error: ${err}`);
//                 return res.status(400).json({
//                     message: "bad-request",
//                     data: "Email notification failed! Please contact customer support for more details.",
//                 });
//             });

//         return res.json({ message: "success" });
//     } catch (err) {
//         console.error(`Error updating job component details: ${err}`);
//         return res.status(500).json({ message: "server-error", data: "An error occurred. Please contact support." });
//     }
// };

exports.editalljobcomponentdetails = async (req, res) => {
    const { id, email } = req.user;
    const { jobcomponentid, projectid, jobno, jobmanagerid, members, budgettype, budget, adminnotes, jobcomponentname, clientid } = req.body;

    // Validate input
    if (!jobcomponentid) {
        return res.status(400).json({ message: "failed", data: "Select a valid job component" });
    }
    if (!projectid) {
        return res.status(400).json({ message: "failed", data: "Select a valid project" });
    }
    if (!jobmanagerid) {
        return res.status(400).json({ message: "failed", data: "Select a valid job manager" });
    }
    if (!Array.isArray(members) || members.length < 1 || members.length > 4) {
        return res.status(400).json({ message: "failed", data: "Invalid members data. There should be 1 to 4 members." });
    } 

    let project 
    let client


    try {
        // Fetch the job component
        const jobcomponent = await Jobcomponents.findById(jobcomponentid);
        if (!jobcomponent) {
            return res.status(404).json({ message: "failed", data: "Job component not found" });
        }

        if (!mongoose.Types.ObjectId.isValid(clientid)) {
            // check if clientname is existing
            const clientExists = await Clients.findOne({ clientname: clientid });
    
            if(clientExists){
                client = clientExists._id
                // return res.status(400).json({ message: "failed", data: "Client already exists" });
            } else {    
                const createClient = await Clients.create({ clientname: clientid, priority: "Priority 3" })
                client = createClient._id
            }
        }

        if(!mongoose.Types.ObjectId.isValid(projectid)){

            // check if projectname is existing
            const projectExists = await Projects.findOne({ projectname: projectid });

            if(projectExists){
                project = projectExists._id

                if(jobno){
                    projectExists.jobno = jobno
                    await projectExists.save()
                }
                // return res.status(400).json({ message: "failed", data: "Project already exists" });
            } else {   
                const data = await Projects.findOne({ _id: new mongoose.Types.ObjectId(jobcomponent.project) })
                
                const createProject = await Projects.create({
                    team: data.team,
                    jobno: jobno,
                    projectname: projectid,
                    client: new mongoose.Types.ObjectId(client),
                    invoiced: 0,
                    status: "On-going",
                    startdate: data.startdate,
                    deadlinedate: data.deadlinedate,
                })

                project = createProject._id
            }
        }

        const jobName = jobcomponent.jobcomponent;

        // Update job component details
        await Jobcomponents.findByIdAndUpdate(
            jobcomponentid,
            {
            project: new mongoose.Types.ObjectId(project),
            client: new mongoose.Types.ObjectId(client),
            jobmanager: jobmanagerid,
            budgettype: budgettype,
            estimatedbudget: budget,
            adminnotes: adminnotes,
            jobcomponent: jobcomponentname,
            members: members.map(({ employee, role, notes }) => ({
                employee,
                role,
                notes: notes || "",
                dates: [],
            })),
            },
            { new: true }
        );


        // Filter out empty or invalid employee IDs
        const validEmployees = members
            .map(m => m.employee)
            .filter(employeeId => employeeId && mongoose.Types.ObjectId.isValid(employeeId));

        // Get member details only for valid employee IDs
        const memberDetails = await Userdetails.find({ 
            owner: { $in: validEmployees } 
        });
        // Create a map of employee IDs to full names, with validation
        const employeeNameMap = memberDetails.reduce((map, member) => {
            if (member.owner) {
                map[member.owner.toString()] = `${member.firstname} ${member.lastname}`;
            }
            return map;
        }, {});
        // Construct email content
        // Fetch project details
        const projectData = await Projects.findById(new mongoose.Types.ObjectId(project))
            .catch(err => {
                console.error("Error fetching project details:", err);
                return null;
            });

        // Fetch job manager details
        const jobManager = await Userdetails.findOne({ owner: new mongoose.Types.ObjectId(jobmanagerid) })
            .catch(err => {
                console.error("Error fetching job manager details:", err); 
                return null;
            });

        // Construct email content
        const emailContent = `
        Hello Team,

        The job component "${jobName}" has been updated with the following details:

        Project Name: ${projectData?.projectname || 'N/A'}
        Job Manager: ${jobManager?.firstname} ${jobManager?.lastname || 'N/A'}

        Updated Members:
        ${members
            .map(
                member => 
        `
        Name: ${employeeNameMap[member.employee?.toString()] || 'N/A'}
        Role: ${member.role || 'N/A'}`
            )
            .join("\n\n")}

        If you have any questions or concerns, please reach out.

        Thank you!

        Best Regards,
        ${email}`;

        // Send email notification
        const sender = new mongoose.Types.ObjectId(id);

        const receiver = await getAllUserIdsExceptSender(id)

        await sendmail(sender, receiver, "Job Component Details Updated", emailContent)
            .catch(err => {
                console.error(`Failed to send email notification for updated job component: ${jobcomponentid}. Error: ${err}`);
                return res.status(400).json({
                    message: "bad-request",
                    data: "Email notification failed! Please contact customer support for more details.",
                });
            });

        return res.json({ message: "success" });
    } catch (err) {
        console.error(`Error updating job component details: ${err}`);
        return res.status(500).json({ message: "server-error", data: "An error occurred. Please contact support." });
    }
};

exports.updateMemberNotes = async (req, res) => {
    const { id, email } = req.user;
    const { jobcomponentid, memberid, notes } = req.body;

    // Validate input
    if (!jobcomponentid) {
        return res.status(400).json({ message: "failed", data: "Select a valid job component" });
    }

    if (!memberid || !notes ) {
        return res.status(400).json({ message: "failed", data: "Member data and notes are required" });
    }

    try {
        // Fetch the job component
        const jobcomponent = await Jobcomponents.findById(jobcomponentid);
        if (!jobcomponent) {
            return res.status(404).json({ message: "failed", data: "Job component not found" });
        }

        // Find the member index using memberid
        const memberIndex = jobcomponent.members.findIndex(
            m => m._id?.toString() === memberid?.toString()
        );

        if (memberIndex === -1) {
            return res.status(404).json({
                message: "failed",
                data: "Member not found in this job component"
            });
        }
        // Update notes only
        jobcomponent.members[memberIndex].notes = notes;

        // Save changes
        await jobcomponent.save();

        return res.json({ 
            message: "success",
        });
    } catch (err) {
        console.error(`Error updating member notes: ${err}`);
        return res.status(500).json({ 
            message: "server-error", 
            data: "An error occurred. Please contact support." 
        });
    }
};

exports.updateMember = async (req, res) => {
    const { id, email } = req.user;
    const { jobcomponentid, memberid, member } = req.body;

    // Validate input
    if (!jobcomponentid) {
        return res.status(400).json({ message: "failed", data: "Select a valid job component" });
    }

    if (!memberid || !member ) {
        return res.status(400).json({ message: "failed", data: "Member data are required" });
    }

    try {
        // Fetch the job component
        const jobcomponent = await Jobcomponents.findById(jobcomponentid);
        if (!jobcomponent) {
            return res.status(404).json({ message: "failed", data: "Job component not found" });
        }

        // Find the member index using memberid
        const memberIndex = jobcomponent.members.findIndex(
            m => m._id?.toString() === memberid?.toString()
        );

        if (memberIndex === -1) {
            return res.status(404).json({
                message: "failed",
                data: "Member not found in this job component"
            });
        }

        // Update role only
        jobcomponent.members[memberIndex].employee = member;

        // Save changes
        await jobcomponent.save();

        return res.json({ 
            message: "success",
        });
    } catch (err) {
        console.error(`Error updating member role: ${err}`);
        return res.status(500).json({ 
            message: "server-error", 
            data: "An error occurred. Please contact support." 
        });
    }
};

exports.completejobcomponent = async (req, res) => {
    const { id, email } = req.user;
    const { id: jobcomponentId, comments, adminnotes } = req.query;

    // Validate input
    if (!jobcomponentId) {
        return res.status(400).json({ message: "failed", data: "Please select a Job Component to update." });
    }

    try {
        const jobComponentObjectId = new mongoose.Types.ObjectId(jobcomponentId);

        // Fetch the job component
        const jobcomponent = await Jobcomponents.findById(jobComponentObjectId);
        if (!jobcomponent) {
            return res.status(404).json({ message: "failed", data: "Job Component not found." });
        }

        // Update the job component status to "completed"
        jobcomponent.status = "archived";
        jobcomponent.comments = comments;
        jobcomponent.adminnotes = adminnotes;

        await jobcomponent.save();

        // Fetch job manager details
        const jobManager = await Userdetails.findOne({ owner: jobcomponent.jobmanager});
        if (!jobManager) {
            console.error(`Job Manager with ID ${jobcomponent.jobmanager} not found.`);
            return res.status(404).json({ message: "failed", data: "Job Manager not found." });
        }
        const financeUsers = await Users.find({ auth: "finance" });


        // send email content details
        const project = await Projects.findOne({ _id: new mongoose.Types.ObjectId(jobcomponent.project) })
        .catch(err => {
            console.log(`There's a problem with getting the project details for email content details in create invoice. Error: ${err}`)
            return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
        })

        // update project status to "archived"

        project.status = "archived"
        await project.save()

        const client = await Clients.findOne({ _id: new mongoose.Types.ObjectId(project.client) })
        .catch(err => {
            console.log(`There's a problem with getting the client details for email content details in create invoice. Error: ${err}`)
            return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
        })
        const team = await Teams.findOne({ _id: new mongoose.Types.ObjectId(project.team) })
        .catch(err => {
            console.log(`There's a problem with getting the team details for email content details in create invoice. Error: ${err}`)
            return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
        })

        const findCurrinvoice = await Invoice.findOne({ jobcomponent: new mongoose.Types.ObjectId(jobcomponentId), status: "Approved" }).sort({ createdAt: -1 })
        .catch(err => {
            console.log(`There's a problem with getting the current invoice details for email content details in create invoice. Error: ${err}`)
            return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
        })
        
        let emailContent
        
        const invoiceamount = jobcomponent?.estimatedbudget || 0;
        const newinvoice = findCurrinvoice?.newinvoice || 0;

        const claimamount = (invoiceamount * ((newinvoice || 100) / 100))
        const thisclaimpercentage = 100 - newinvoice


        if(jobcomponent.budgettype.toString() == 'rates'){

            emailContent = `
        A component of the project shown below has now been removed 
        from the Workload Spreadsheet and has now been recorded to 
        Invoice Spreadsheet.
                                                  
        Team Name:                    ${team?.teamname || 'N/A'}
        Job Manager:                  ${jobManager?.firstname || ''} ${jobManager?.lastname || ''}
        Job Number:                   ${project?.jobno || 'N/A'}
        Client Name:                  ${client?.clientname || 'N/A'}
        Project Name:                 ${project?.projectname || 'N/A'}
        Job Component:                ${jobcomponent?.jobcomponent || 'N/A'}
        Component Budget:             $${formatCurrency(jobcomponent?.estimatedbudget) || 0.00}
        This Claim Amount:            $${formatCurrency(findCurrinvoice?.invoiceamount) || 0.00}
        Admin Notes:                  ${adminnotes || ''}
        JM Comments:                  ${comments || ''}(Complete)

        Note: This is an auto generated message.    
        `

        // , please do not reply. For your inquiries, 
        // comments and/or concerns please use the button "Troubleshoot/Bug Fix" at 
        // the Workload spreadsheet
        } else if(jobcomponent.budgettype.toString() == 'lumpsum'){
        emailContent = `
        A component of the project shown below has now been removed 
        from the Workload Spreadsheet and has now been recorded to 
        Invoice Spreadsheet.
                                                      
        Team Name:                    ${team?.teamname || 'N/A'}
        Job Manager:                  ${jobManager?.firstname || ''} ${jobManager?.lastname || ''}
        Job Number:                   ${project?.jobno || 'N/A'}
        Client Name:                  ${client?.clientname || 'N/A'}
        Project Name:                 ${project?.projectname || 'N/A'}
        Job Component:                ${jobcomponent?.jobcomponent || 'N/A'}
        Component Budget:             $${formatCurrency(jobcomponent?.estimatedbudget) || 0.00}
        Current %invoice:             ${findCurrinvoice?.newinvoice || 0}%
        Previous %invoice:            ${findCurrinvoice?.currentinvoice || 0}%
        This Claim Percentage:        ${findCurrinvoice?.newinvoice || 0}%
        This Claim Amount:            $${formatCurrency(findCurrinvoice?.invoiceamount) || 0.00}
        Admin Notes:                  ${adminnotes || ''}
        JM Comments:                  ${comments || ''}(Complete)
    
        Note: This is an auto generated message.    
        `;   
        
        }


        // Send email notification
        const sender = new mongoose.Types.ObjectId(id);
        const receiver = await getAllUserIdsExceptSender(id)
        await sendmail(sender, receiver, `${project.jobno} - ${project.projectname} - Complete Project`, emailContent)
            .catch(err => {
                console.error(`Failed to send email notification for job component: ${jobcomponentId}. Error: ${err}`);
                return res.status(400).json({
                    message: "bad-request",
                    data: "Email notification failed! Please contact customer support for more details.",
                });
            });

        return res.status(200).json({ message: "success", data: "Job component marked as completed successfully." });
    } catch (err) {
        console.error(`Error updating job component status: ${err}`);
        return res.status(500).json({ message: "server-error", data: "An error occurred. Please contact support." });
    }
};


exports.archivejobcomponent = async (req, res) => {
    const { id, email } = req.user;
    const { jobcomponentId, status, comments, adminnotes } = req.body;

    // Validate input
    if (!jobcomponentId) {
        return res.status(400).json({
            message: "failed",
            data: "Please select a Job Component to archive.",
        });
    }
        const jobComponent = await Jobcomponents.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(jobcomponentId) },
            { $set: { status: status || null, comments: comments, adminnotes: adminnotes } },
            { new: true }
        )
        .catch((err) => {
            console.error(`Failed to archive job component: ${jobcomponentId}. Error: ${err}`);
            return res.status(400).json({
                message: "bad-request",
                data: "There's a problem with the server. Please contact customer support for more details.",
            });
        });
        if (!jobComponent) {
            return res.status(404).json({
                message: "failed",
                data: "Job component not found.",
            });
        }


        const emailContent = `
        Hello Team,

        The job component "${jobComponent.jobcomponent}" has been archived.

        Archived By: ${email}

        Please review the archived job component details if necessary.

        Thank you!

        Best Regards,
        ${email}`;

        const sender = new mongoose.Types.ObjectId(id);

        const receiver = await getAllUserIdsExceptSender(id)
        await sendmail(sender, receiver, "Job Component Archived", emailContent)
            .catch((err) => {
                console.error(
                    `Failed to send email notification for job component: ${jobcomponentId}. Error: ${err}`
                );
                return res.status(400).json({
                    message: "bad-request",
                    data: "Email notification failed! Please contact customer support for more details.",
                });
            });

        return res.status(200).json({
            message: "success",
        });
};

exports.editstatushours = async (req, res) => {
    const { id, email } = req.user;
    const { jobcomponentid, role, employeeid, date, status, hours } = req.body;

    // Input validation
    if (!jobcomponentid) {
        return res.status(400).json({ message: "failed", data: "Please select a valid job component." });
    }
    if (!employeeid || !role) {
        return res.status(400).json({ message: "failed", data: "Please select a valid employee." });
    }
    if (!date || isNaN(Date.parse(date))) {
        return res.status(400).json({ message: "failed", data: "Invalid date provided." });
    }

    // Optional fields: status and hours
    const validHours = hours === null || typeof hours === "number" && hours >= 0;
    const validStatus = status === null || Array.isArray(status);

    if (!validHours) {
        return res.status(400).json({ message: "failed", data: "Invalid hours provided." });
    }
    if (!validStatus) {
        return res.status(400).json({ message: "failed", data: "Invalid status provided." });
    }

    try {
        // Fetch the job component
        const jobComponent = await Jobcomponents.findById(jobcomponentid);
        if (!jobComponent) {
            return res.status(404).json({ message: "failed", data: "Job component does not exist." });
        }

        // Find the member corresponding to the employee
        const member = jobComponent.members.find(
            (m) =>
            (m.employee ? m.employee.toString() : "") === employeeid &&
            (m.role ? m.role.toString() : "") === (role ? role.toString() : "")
        );

        if (!member) {
            return res.status(404).json({ message: "failed", data: "Employee not found in the job component." });
        }

        // Check if the date already exists in the member's dates array
        const dateIndex = member.dates.findIndex(
            (d) => new Date(d.date).toDateString() === new Date(date).toDateString()
        );

        if (hours === 0) {
            // Remove the date entry if hours is 0
            if (dateIndex !== -1) {
                member.dates.splice(dateIndex, 1);
            }
        } else if (dateIndex !== -1) {
            // Update existing date entry
            if (status !== undefined) member.dates[dateIndex].status = status || [];
            if (hours !== undefined) member.dates[dateIndex].hours = hours;
        } else {
            // Add a new date entry if valid data is provided
            if (hours !== null || (Array.isArray(status) && status.length > 0)) {
                member.dates.push({
                    date: new Date(date),
                    hours: hours || null,
                    status: status || [],
                });
            } else {
                return res.status(400).json({ message: "failed", data: "Cannot add empty status and hours." });
            }
        }

        await jobComponent.save();

        // Look up user details first
        const userDetails = await Userdetails.findOne({ owner: new mongoose.Types.ObjectId(employeeid) });
        if (!userDetails) {
            return res.status(404).json({ message: "failed", data: "Employee details not found" });
        }

        const fullName = `${userDetails.firstname} ${userDetails.lastname}`;

        const emailContent = `
        Hello Team,

        The job component "${jobComponent.jobcomponent}" has been updated.

        Employee: ${fullName}
        Date: ${new Date(date).toDateString()}
        Status: ${(status || []).join(", ")}
        Hours: ${hours === 0 ? "Removed" : hours !== null ? hours : "Cleared"}

        Please review the changes if necessary.

        Thank you!

        Best Regards,
        ${email}`;

        const sender = new mongoose.Types.ObjectId(id);
        const receiver = await getAllUserIdsExceptSender(id)

        await sendmail(sender, receiver, "Job Component Update Notification", emailContent)
            .catch((err) => {
                console.error(`Failed to send email notification for job component: ${jobcomponentid}. Error: ${err}`);
                return res.status(400).json({
                    message: "bad-request",
                    data: "Email notification failed! Please contact customer support for more details.",
                });
            });

        return res.status(200).json({ message: "success", data: "Job component updated and email sent successfully." });
    } catch (err) {
        console.error(`Error updating job component ${jobcomponentid}: ${err}`);
        return res.status(500).json({
            message: "server-error",
            data: "An error occurred. Please contact customer support for more details.",
        });
    }
};
exports.editMultipleStatusHours = async (req, res) => {
    const { id, email } = req.user;
    const { jobcomponentid, employeeid, updates } = req.body;

    // Input validation
    if (!jobcomponentid) {
        return res.status(400).json({ message: "failed", data: "Please select a valid job component." });
    }
    if (!employeeid) {
        return res.status(400).json({ message: "failed", data: "Please select a valid employee." });
    }
    if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ message: "failed", data: "No updates provided." });
    }

    try {
        // Fetch the job component
        const jobComponent = await Jobcomponents.findById(jobcomponentid);
        if (!jobComponent) {
            return res.status(404).json({ message: "failed", data: "Job component does not exist." });
        }

        const project = await Projects.findOne({ _id: new mongoose.Types.ObjectId(jobComponent.project) })

        if(!project) {
            return res.status(404).json({ message: "failed", data: "Project does not exist." });
        }
        // Find the member corresponding to the employee
        const member = jobComponent.members.find(
            (m) => (m.employee ? m.employee.toString() : "") === employeeid
        );

        if (!member) {
            return res.status(404).json({ message: "failed", data: "Employee not found in the job component." });
        }

        // Process each update
        for (const update of updates) {
            const { startdate, enddate, status, hours } = update;

            // Validate start and end dates
            if (!startdate || !enddate || isNaN(Date.parse(startdate)) || isNaN(Date.parse(enddate))) {
                return res.status(400).json({ message: "failed", data: `Invalid date range provided: ${startdate} - ${enddate}` });
            }

            // check if start date and end date is between the project start date and end date

            if (new Date(startdate) <= new Date(project.startdate) || new Date(enddate) >= new Date(project.deadlinedate)) {
                const formattedStartDate = moment(project.startdate).format('DD-MM-YYYY');
                const formattedEndDate = moment(project.deadlinedate).format('DD-MM-YYYY');
                
                return res.status(400).json({ 
                    message: "failed", 
                    data: `Date range provided is not within the project start date and end date: ${formattedStartDate} - ${formattedEndDate}` 
                });            
            }

            const startDateObj = new Date(startdate);
            const endDateObj = new Date(enddate);

            if (startDateObj > endDateObj) {
                return res.status(400).json({ message: "failed", data: "Start date cannot be after end date." });
            }

            const validHours = hours === null || (typeof hours === "number" && hours >= 0);
            const validStatus = status === null || Array.isArray(status);

            if (!validHours || !validStatus) {
                return res.status(400).json({
                    message: "failed",
                    data: `Invalid status or hours for date range: ${startdate} - ${enddate}`,
                });
            }

            // Iterate over date range and update each date entry
            for (let date = new Date(startDateObj); date <= endDateObj; date.setDate(date.getDate() + 1)) {
                const formattedDate = new Date(date).toISOString().split("T")[0];

                // Find if the date already exists in the member's dates array
                const dateIndex = member.dates.findIndex(
                    (d) => new Date(d.date).toISOString().split("T")[0] === formattedDate
                );

                if (dateIndex !== -1) {
                    // Update existing date entry
                    if (status !== undefined) member.dates[dateIndex].status = status || [];
                    if (hours !== undefined) member.dates[dateIndex].hours = hours;
                } else {
                    // Add a new date entry if valid data is provided
                    if (hours !== null || (Array.isArray(status) && status.length > 0)) {
                        member.dates.push({
                            date: new Date(formattedDate),
                            hours: hours || null,
                            status: status || [],
                        });
                    }
                }
            }
        }

        await jobComponent.save();

        // Prepare email content
        // Look up user details first
        const userDetails = await Userdetails.findOne({ owner: new mongoose.Types.ObjectId(employeeid) });
        if (!userDetails) {
            return res.status(404).json({ message: "failed", data: "Employee details not found" });
        }

        const fullName = `${userDetails.firstname} ${userDetails.lastname}`;

        const emailContent = `Hello Team,

        The job component "${jobComponent.jobcomponent}" has been updated.

        Employee: ${fullName}
        Updates:
        ${updates
            .map(
                (u) =>
                    `From: ${new Date(u.startdate).toDateString()} To: ${new Date(u.enddate).toDateString()},
                     Status: ${(u.status || []).join(", ")}, 
                     Hours: ${u.hours !== null ? u.hours : "Cleared"}`
            )
            .join("\n")}

        Please review the changes if necessary.

        Thank you!

        Best Regards,
        ${email}`;

        const receiver = await getAllUserIdsExceptSender(id);

        const sender = new mongoose.Types.ObjectId(id);
        await sendmail(sender, receiver, "Job Component Update Notification", emailContent)
            .catch((err) => {
                console.error(
                    `Failed to send email notification for job component: ${jobcomponentid}. Error: ${err}`
                );
                return res.status(400).json({
                    message: "bad-request",
                    data: "Email notification failed! Please contact customer support for more details.",
                });
            });

        return res.status(200).json({
            message: "success",
            data: "Job component updated and email sent successfully.",
        });
    } catch (err) {
        console.error(`Error updating job component ${jobcomponentid}: ${err}`);
        return res.status(500).json({
            message: "server-error",
            data: "An error occurred. Please contact customer support for more details.",
        });
    }
};
// exports.editMultipleStatusHours = async (req, res) => {
//     const { id, email } = req.user;
//     const { jobcomponentid, employeeid, updates } = req.body;

//     // Input validation
//     if (!jobcomponentid) {
//         return res.status(400).json({ message: "failed", data: "Please select a valid job component." });
//     }
//     if (!employeeid) {
//         return res.status(400).json({ message: "failed", data: "Please select a valid employee." });
//     }
//     if (!Array.isArray(updates) || updates.length === 0) {
//         return res.status(400).json({ message: "failed", data: "No updates provided." });
//     }

//     try {
//         // Fetch the job component
//         const jobComponent = await Jobcomponents.findById(jobcomponentid);
//         if (!jobComponent) {
//             return res.status(404).json({ message: "failed", data: "Job component does not exist." });
//         }

//         // Find the member corresponding to the employee
//         const member = jobComponent.members.find(
//             (m) => (m.employee ? m.employee.toString() : "") === employeeid
//         );

//         if (!member) {
//             return res.status(404).json({ message: "failed", data: "Employee not found in the job component." });
//         }

//         // Process each update
//         for (const update of updates) {
//             const { date, status, hours } = update;

//             // Validate each update object
//             if (!date || isNaN(Date.parse(date))) {
//                 return res.status(400).json({ message: "failed", data: `Invalid date provided: ${date}` });
//             }

//             const validHours = hours === null || (typeof hours === "number" && hours >= 0);
//             const validStatus = status === null || Array.isArray(status);

//             if (!validHours || !validStatus) {
//                 return res.status(400).json({
//                     message: "failed",
//                     data: `Invalid status or hours for date: ${date}`,
//                 });
//             }

//             // Check if the date already exists in the member's dates array
//             const dateIndex = member.dates.findIndex(
//                 (d) => new Date(d.date).toDateString() === new Date(date).toDateString()
//             );

//             if (dateIndex !== -1) {
//                 // Update existing date entry
//                 if (status !== undefined) member.dates[dateIndex].status = status || [];
//                 if (hours !== undefined) member.dates[dateIndex].hours = hours;
//             } else {
//                 // Add a new date entry if valid data is provided
//                 if (hours !== null || (Array.isArray(status) && status.length > 0)) {
//                     member.dates.push({
//                         date: new Date(date),
//                         hours: hours || null,
//                         status: status || [],
//                     });
//                 } else {
//                     return res.status(400).json({
//                         message: "failed",
//                         data: `Cannot add empty status and hours for date: ${date}`,
//                     });
//                 }
//             }
//         }

//         await jobComponent.save();

//         const emailContent = `Hello Team,

//         The job component "${jobComponent.jobcomponent}" has been updated.

//         Employee: ${employeeid}
//         Updates: ${updates
//             .map(
//                 (u) =>
//                     `Date: ${new Date(u.date).toDateString()}, Status: ${(u.status || []).join(
//                         ", "
//                     )}, Hours: ${u.hours !== null ? u.hours : "Cleared"}`
//             )
//             .join("\n")}

//         Please review the changes if necessary.

//         Thank you!

//         Best Regards,
//         ${email}`;

//         const receiver = await getAllUserIdsExceptSender(id);

//         const sender = new mongoose.Types.ObjectId(id);
//         await sendmail(sender, receiver, "Job Component Update Notification", emailContent)
//             .catch((err) => {
//                 console.error(
//                     `Failed to send email notification for job component: ${jobcomponentid}. Error: ${err}`
//                 );
//                 return res.status(400).json({
//                     message: "bad-request",
//                     data: "Email notification failed! Please contact customer support for more details.",
//                 });
//             });

//         return res.status(200).json({
//             message: "success",
//             data: "Job component updated and email sent successfully.",
//         });
//     } catch (err) {
//         console.error(`Error updating job component ${jobcomponentid}: ${err}`);
//         return res.status(500).json({
//             message: "server-error",
//             data: "An error occurred. Please contact customer support for more details.",
//         });
//     }
// };



//  #endregion


//  #region MANAGER & EMPLOYEE & SUPERADMIN

exports.listJobComponentNamesByTeam = async (req, res) => {
    const { teamid } = req.query;

    try {
        const result = await Jobcomponents.aggregate([
            {
                $lookup: {
                    from: 'projects',
                    localField: 'project',
                    foreignField: '_id',
                    as: 'projectDetails'
                }
            },
            { 
                $match: { 
                    status: { $in: ["completed", "", null, "unarchive", "archived", "On-going"] } 
                }
            },
            { $unwind: '$projectDetails' },
            { $match: { 'projectDetails.team': new mongoose.Types.ObjectId(teamid) } },
            {
                $project: {
                    _id: 1,
                    jobcomponent: 1
                }
            }
        ]);

        return res.json({ message: "success", data: result });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }
};
// exports.listarchivedteamjobcomponent = async (req, res) => {
//     const { id, email } = req.user;
//     const { teamid } = req.query;

//     try {

//         const now = moment().tz("Australia/Sydney");
//         const today = now.startOf('day').toDate();
//         const startDate = moment.tz(today, "Australia/Sydney").startOf('day').toDate();
//         const endDate = moment.tz(today, "Australia/Sydney").endOf('day').toDate();


//         const result = await Jobcomponents.aggregate([
//             {
//                 $lookup: {
//                     from: 'projects',
//                     localField: 'project',
//                     foreignField: '_id',
//                     as: 'projectDetails'
//                 }
//             },
//             { $match: { 'projectDetails.team': new mongoose.Types.ObjectId(teamid)} },
//             { $match: { status: "archived" } },
//             { $unwind: '$projectDetails' },
//             {
//                 $lookup: {
//                     from: 'users',
//                     localField: 'jobmanager',
//                     foreignField: '_id',
//                     as: 'jobManagerDetails'
//                 }
//             },
//             { $unwind: '$jobManagerDetails' },
//             {
//                 $lookup: {
//                     from: 'userdetails',
//                     localField: 'jobManagerDetails._id',
//                     foreignField: 'owner',
//                     as: 'jobManagerDeets'
//                 }
//             },
//             { $unwind: '$jobManagerDeets' },
//             {
//                 $lookup: {
//                     from: 'teams',
//                     localField: 'projectDetails.team',
//                     foreignField: '_id',
//                     as: 'teamDetails'
//                 }
//             },
//             { $unwind: { path: '$teamDetails', preserveNullAndEmptyArrays: true } },
//             {
//                 $addFields: {
//                     isManager: {
//                         $cond: {
//                             if: { $eq: [userObjectId, '$teamDetails.manager'] },
//                             then: true,
//                             else: false
//                         }
//                     }
//                 }
//             },
//             { $unwind: '$members' },
//             {
//                 $lookup: {
//                     from: 'users',
//                     localField: 'members.employee',
//                     foreignField: '_id',
//                     as: 'employeeDetails'
//                 }
//             },
//             {
//                 $lookup: {
//                     from: 'userdetails',
//                     localField: 'employeeDetails._id',
//                     foreignField: 'owner',
//                     as: 'userDetails'
//                 }
//             },
//             {
//                 $lookup: {
//                     from: 'leaves',
//                     let: { employeeId: '$members.employee' },
//                     pipeline: [
//                         { 
//                             $match: { 
//                                 $expr: { 
//                                     $eq: ['$owner', '$$employeeId'] 
//                                 } 
//                             }
//                         },
//                         {
//                             $project: {
//                                 _id: 0,
//                                 leavedates: {
//                                     leavestart: "$leavestart",
//                                     leaveend: "$leaveend"
//                                 }
//                             }
//                         }
//                     ],
//                     as: 'leaveData'
//                 }
//             },
//             {
//                 $lookup: {
//                     from: 'wellnessdays',
//                     let: { employeeId: '$members.employee' },
//                     pipeline: [
//                         { $match: { $expr: { $eq: ['$owner', '$$employeeId'] } } },
//                         {
//                             $project: {
//                                 _id: 0,
//                                 wellnessdates: "$requestdate"
//                             }
//                         }
//                     ],
//                     as: 'wellnessData'
//                 }
//             },
//             {
//                 $lookup: {
//                     from: 'events',
//                     let: { teamId: '$teamDetails._id' },
//                     pipeline: [
//                         { $match: { $expr: { $in: ['$$teamId', '$teams'] } } },
//                         {
//                             $project: {
//                                 _id: 0,
//                                 eventdates: {
//                                     startdate: "$startdate",
//                                     enddate: "$enddate"
//                                 }
//                             }
//                         }
//                     ],
//                     as: 'eventData'
//                 }
//             },
//             {
//                 $lookup: {
//                     from: 'invoices',
//                     let: { jobComponentId: "$_id" },
//                     pipeline: [
//                         { 
//                             $match: { 
//                                 $expr: { 
//                                     $and: [
//                                         { $eq: ["$jobcomponent", "$$jobComponentId"] },
//                                         { $eq: ["$status", "Approved"] }
//                                     ]
//                                 } 
//                             } 
//                         },
//                         { $sort: { createdAt: -1 } },
//                         { $limit: 1 }
//                     ],
//                     as: 'latestInvoice'
//                 }
//             },   
//             {
//                 $unwind: { path: "$latestInvoice", preserveNullAndEmptyArrays: true }
//             },
//             {
//                 $addFields: {
//                     invoiceDetails: {
//                         percentage: { $ifNull: ["$latestInvoice.newinvoice", 0] },
//                         amount: { $ifNull: ["$latestInvoice.invoiceamount", 0] }
//                     }
//                 }
//             },
//               {
//                 $addFields: {
//                     allDates: {
//                         $let: {
//                             vars: {
//                                 startDate: {
//                                     $dateToString: {
//                                         date: "$projectDetails.startdate",
//                                         timezone: "Australia/Sydney",
//                                         format: "%Y-%m-%d"
//                                     }
//                                 },
//                                 endDate: {
//                                     $dateToString: {
//                                         date: "$projectDetails.deadlinedate",
//                                         timezone: "Australia/Sydney",
//                                         format: "%Y-%m-%d"
//                                     }
//                                 }
//                             },
//                             in: {
//                                 $filter: {
//                                     input: {
//                                         $map: {
//                                             input: {
//                                                 $range: [
//                                                     0,
//                                                     {
//                                                         $add: [
//                                                             {
//                                                                 $divide: [
//                                                                     {
//                                                                         $subtract: [
//                                                                             { $dateFromString: { dateString: "$$endDate", timezone: "Australia/Sydney" } },
//                                                                             { $dateFromString: { dateString: "$$startDate", timezone: "Australia/Sydney" } }
//                                                                         ]
//                                                                     },
//                                                                     86400000
//                                                                 ]
//                                                             },
//                                                             1
//                                                         ]
//                                                     }
//                                                 ]
//                                             },
//                                             as: "daysFromStart",
//                                             in: {
//                                                 $dateAdd: {
//                                                     startDate: { $dateFromString: { dateString: "$$startDate", timezone: "Australia/Sydney" } },
//                                                     unit: "day",
//                                                     amount: "$$daysFromStart",
//                                                     timezone: "Australia/Sydney"
//                                                 }
//                                             }
//                                         }
//                                     },
//                                     as: "date",
//                                     cond: {
//                                         $and: [
//                                             { $ne: [{ "$dayOfWeek": "$$date" }, 6] },
//                                             { $ne: [{ "$dayOfWeek": "$$date" }, 7] }
//                                         ]
//                                     }
//                                 }
//                             }
//                         }
//                     }
//                 }
//             },
//             {
//                 $addFields: {
//                     members: {
//                         employee: {
//                             $cond: {
//                                 if: { $gt: [{ $size: "$employeeDetails" }, 0] },
//                                 then: {
//                                     _id: { $arrayElemAt: ['$employeeDetails._id', 0] },
//                                     fullname: {
//                                         $concat: [
//                                             { $ifNull: [{ $arrayElemAt: ['$userDetails.firstname', 0] }, ''] },
//                                             ' ',
//                                             { $ifNull: [{ $arrayElemAt: ['$userDetails.lastname', 0] }, ''] }
//                                         ]
//                                     },
//                                     initials: '$userDetails.initial'
//                                 },
//                                 else: { _id: null, fullname: "N/A", initials: "NA" }
//                             }
//                         },
//                         leaveDates: {
//                             $filter: {
//                                 input: "$leaveData.leavedates",
//                                 as: "leave",
//                                 cond: {
//                                     $and: [
//                                         { $lte: ["$$leave.leavestart", "$projectDetails.deadlinedate"] },
//                                         { $eq: ["$$leave.status", "Approved"] }
//                                     ]
//                                 }
//                             }
//                         },
//                         wellnessDates: {
//                             $filter: {
//                                 input: "$wellnessData.wellnessdates",
//                                 as: "wellness",
//                                 cond: {
//                                     $and: [
//                                         { $gte: ["$$wellness", "$projectDetails.startdate"] },
//                                         { $lte: ["$$wellness", "$projectDetails.deadlinedate"] },
//                                         { $eq: ["$$wellness.status", "Approved"] }
//                                     ]
//                                 }
//                             }
//                         },
//                         eventDates: {
//                             $filter: {
//                                 input: "$eventData.eventdates",
//                                 as: "event",
//                                 cond: {
//                                     $and: [
//                                         { $lte: ["$$event.startdate", "$projectDetails.deadlinedate"] }
//                                     ]
//                                 }
//                             }    
//                         },
//                         dates: {
//                             $let: {
//                                 vars: {
//                                     existingDates: "$members.dates",
//                                     leaveDates: "$leaveData.leavedates"
//                                 },
//                                 in: {
//                                     $reduce: {
//                                         input: "$$leaveDates",
//                                         initialValue: "$$existingDates",
//                                         in: {
//                                             $let: {
//                                                 vars: {
//                                                     startDate: "$$this.leavestart",
//                                                     endDate: "$$this.leaveend"
//                                                 },
//                                                 in: {
//                                                     $concatArrays: [
//                                                         "$$value",
//                                                         {
//                                                             $map: {
//                                                                 input: {
//                                                                     $range: [
//                                                                         0,
//                                                                         {
//                                                                             $add: [
//                                                                                 {
//                                                                                     $divide: [
//                                                                                         { $subtract: [
//                                                                                             { $toDate: "$$endDate" }, 
//                                                                                             { $toDate: "$$startDate" }
//                                                                                         ]},
//                                                                                         86400000
//                                                                                     ]
//                                                                                 },
//                                                                                 1
//                                                                             ]
//                                                                         }
//                                                                     ]
//                                                                 },
//                                                                 as: "dayOffset",
//                                                                 in: {
//                                                                     date: {
//                                                                         $dateAdd: {
//                                                                             startDate: { $toDate: "$$startDate" },
//                                                                             unit: "day",
//                                                                             amount: "$$dayOffset"
//                                                                         }
//                                                                     },
//                                                                     hours: 7.6,
//                                                                     status: ["Leave"]
//                                                                 }
//                                                             }
//                                                         }
//                                                     ]
//                                                 }
//                                             }
//                                         }
//                                     }
//                                 }
//                             }
//                         }
//                     }
//                 }
//             },
//             {
//                 $group: {
//                     _id: '$_id',
//                     componentid: { $first: '$_id' },
//                     teamname: { $first: '$teamDetails.teamname' },
//                     projectend: { $first: '$projectDetails.deadlinedate'}, 
//                     projectname: { $first: { projectid: '$projectDetails._id', name: '$projectDetails.projectname', status: '$projectDetails.status' } },
//                     clientname: { $first: { clientid: '', name: 'Client Name' } },
//                     jobno: { $first: '$projectDetails.jobno' },
//                     budgettype: { $first: '$budgettype' },
//                     estimatedbudget: { $first: '$estimatedbudget' },
//                     status: { $first: '$status' }, 
//                     invoice: { $first: '$invoiceDetails' }, // Use updated invoiceDetails field
//                     comments: { $first: '$comments' },
//                     jobmanager: {
//                         $first: {
//                             employeeid: '$jobManagerDetails._id',
//                             fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] },
//                             initials: '$jobManagerDeets.initial',
//                             isManager: '$isManager',
//                             isJobManager: { $eq: ['$jobmanager', new mongoose.Types.ObjectId(id)] }
//                         }
//                     },
//                     jobcomponent: { $first: '$jobcomponent' },
//                     allDates: { $first: '$allDates' },
//                     members: { $push: '$members' }
//                 }
//             },
//             {
//                 $sort: { createdAt: 1 }
//             }
//         ]);
        
//         const formattedResult = result.map(item => ({
//             ...item,
//             allDates: item.allDates.map(date => 
//                 moment(date).tz("Australia/Sydney").format('YYYY-MM-DD')
//             )
//         }));

 
//         return res.json({ message: "success", data: formattedResult });
//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ message: "Error processing request", error: err.message });
//     }
// }

exports.listarchivedteamjobcomponent = async (req, res) => {
      const { id } = req.user;
    const { teamid, search, filterdate } = req.query;

    if(!mongoose.Types.ObjectId.isValid(teamid)) {
        return res.status(400).json({ message: "failed", data: "Invalid team ID" });
    }

    // Use createFromHexString for string IDs (recommended by mongoose/bson)
    const teamObjectId = mongoose.Types.ObjectId.createFromHexString(teamid);
    const userObjectId = mongoose.Types.ObjectId.createFromHexString(id);

    const referenceDate = filterdate ? moment.tz(new Date(filterdate), "Australia/Sydney") : moment.tz("Australia/Sydney");
    const startOfWeek = referenceDate.isoWeekday(1).toDate(); // forced to monday
    const endOfRange = moment(startOfWeek).add(1, 'year').subtract(1, 'days').toDate();



    let searchQuery = {};

    if (search) {
        searchQuery = {
            $or: [
            { 'projectDetails.projectname': { $regex: search, $options: 'i' } },
            { 'projectDetails.jobno': { $regex: search, $options: 'i' } },
            { 'clientDetails.clientname': { $regex: search, $options: 'i' } },
            { 'jobManagerDeets.firstname': { $regex: search, $options: 'i' } },
            { 'jobManagerDeets.lastname': { $regex: search, $options: 'i' } },
            ]
        };
    }

    try {

        const result = await Jobcomponents.aggregate([
            { 
                $match: { 
                    status: { $in: ["", null, "archived",] } 
                }
            },
            {
                $lookup: {
                    from: 'projects',
                    localField: 'project',
                    foreignField: '_id',
                    as: 'projectDetails'
                }
            },
            { $match: { 'projectDetails.team': teamObjectId } },
            { $unwind: '$projectDetails' },
            {
                $lookup: {
                    from: "clients",
                    localField: "projectDetails.client",
                    foreignField: "_id",
                    as: "clientDetails"
                }
            },
            { $unwind: '$clientDetails' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'jobmanager',
                    foreignField: '_id',
                    as: 'jobManagerDetails'
                }
            },
            { $unwind: '$jobManagerDetails' },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'jobManagerDetails._id',
                    foreignField: 'owner',
                    as: 'jobManagerDeets'
                }
            },
            { $unwind: '$jobManagerDeets' },
            ...(search ? [{ $match: searchQuery }] : []),
            {
                $lookup: {
                    from: 'teams',
                    localField: 'projectDetails.team',
                    foreignField: '_id',
                    as: 'teamDetails'
                }
            },
            { $unwind: { path: '$teamDetails', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    isManager: {
                        $cond: {
                            if: { $eq: [new mongoose.Types.ObjectId(id), '$teamDetails.manager'] },
                            then: true,
                            else: false
                        }
                    }
                }
            },
            { $unwind: '$members' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'members.employee',
                    foreignField: '_id',
                    as: 'employeeDetails'
                }
            },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'employeeDetails._id',
                    foreignField: 'owner',
                    as: 'userDetails'
                }
            },
            {
                $lookup: {
                    from: 'leaves',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', '$$employeeId'] 
                                } 
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                leavedates: {
                                    leavestart: "$leavestart",
                                    leaveend: "$leaveend"
                                }
                            }
                        }
                    ],
                    as: 'leaveData'
                }
            },
            {
                $lookup: {
                    from: 'wellnessdays',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', '$$employeeId'] } } },
                        {
                            $project: {
                                _id: 0,
                                wellnessdates: "$requestdate"
                            }
                        }
                    ],
                    as: 'wellnessData'
                }
            },
            {
                $lookup: {
                    from: 'workfromhomes',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', '$$employeeId'] } } },
                        {
                            $project: {
                                _id: 0,
                                requeststart: "$requestdate"
                            }
                        }
                    ],
                    as: 'wfhData'
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { teamId: '$teamDetails._id' },
                    pipeline: [
                        { $match: { $expr: { $in: ['$$teamId', '$teams'] } } },
                        {
                            $project: {
                                _id: 0,
                                eventdates: {
                                    startdate: "$startdate",
                                    enddate: "$enddate"
                                }
                            }
                        }
                    ],
                    as: 'eventData'
                }
            },
            {
                $lookup: {
                    from: 'invoices',
                    let: { jobComponentId: "$_id" },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $and: [
                                        { $eq: ["$jobcomponent", "$$jobComponentId"] },
                                        { $eq: ["$status", "Approved"] }
                                    ]
                                } 
                            } 
                        },
                        { $sort: { createdAt: -1 } },
                        { $limit: 1 }
                    ],
                    as: 'latestInvoice'
                }
            },   
            {
                $unwind: { path: "$latestInvoice", preserveNullAndEmptyArrays: true }
            },
            {
                $lookup: {
                    from: 'invoices',
                    let: { jobComponentId: "$_id" },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $and: [
                                        { $eq: ["$jobcomponent", "$$jobComponentId"] },
                                        { $eq: ["$status", "Pending"] }
                                    ]
                                } 
                            } 
                        },
                        { $sort: { createdAt: -1 } },
                        { $limit: 1 }
                    ],
                    as: 'pendinginvoice'
                }
            },   
            {
                $unwind: { path: "$pendinginvoice", preserveNullAndEmptyArrays: true }
            },
            {
                $addFields: {
                    invoiceDetails: {
                        percentage: { $ifNull: ["$latestInvoice.newinvoice", 0] },
                        amount: { $ifNull: ["$latestInvoice.invoiceamount", 0] },
                        pendinginvoice: { $ifNull: ["$pendinginvoice.newinvoice", 0] },
                        pendingamount: { $ifNull: ["$pendinginvoice.invoiceamount", 0] }
                    }
                }
            },
            {
                "$addFields": {
                    "allDates": {
                        "$let": {
                            "vars": {
                                "startDate": startOfWeek,
                                "endDate": endOfRange
                            },
                            "in": {
                                "$filter": {
                                    "input": {
                                        "$map": {
                                            "input": {
                                                "$range": [
                                                    0,
                                                    {
                                                        "$min": [
                                                            {
                                                                "$floor": {
                                                                    "$divide": [
                                                                        { "$subtract": ["$$endDate", "$$startDate"] },
                                                                        86400000 // milliseconds in a day
                                                                    ]
                                                                }
                                                            },
                                                            365]
                                                    }
                                                ]
                                            },
                                            "as": "daysFromStart",
                                            "in": {
                                                "$dateAdd": {
                                                    "startDate": "$$startDate",
                                                    "unit": "day",
                                                    "amount": "$$daysFromStart"
                                                }
                                            }
                                        }
                                    },
                                    "as": "date",
                                    "cond": {
                                        "$and": [
                                            { "$ne": [{ "$dayOfWeek": "$$date" }, 1] }, // Exclude Sunday
                                            { "$ne": [{ "$dayOfWeek": "$$date" }, 7] }  // Exclude Saturday
                                        ]
                                    }
                                }
                            }
                        }
                    }
                }
            },
              {
                $addFields: {
                    members: {
                        employee: {
                            $cond: {
                                if: { $gt: [{ $size: "$employeeDetails" }, 0] },
                                then: {
                                    _id: { $arrayElemAt: ['$employeeDetails._id', 0] },
                                    fullname: {
                                        $concat: [
                                            { $ifNull: [{ $arrayElemAt: ['$userDetails.firstname', 0] }, ''] },
                                            ' ',
                                            { $ifNull: [{ $arrayElemAt: ['$userDetails.lastname', 0] }, ''] }
                                        ]
                                    },
                                    initials: '$userDetails.initial',
                                },
                                else: { _id: null, fullname: "N/A", initials: "NA" }
                            }
                        },
                        leaveDates: {
                            $filter: {
                                input: "$leaveData.leavedates",
                                as: "leave",
                                cond: {
                                    $and: [
                                        { $lte: ["$$leave.leavestart", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }
                        },
                        wellnessDates: {
                            $filter: {
                                input: "$wellnessData.wellnessdates",
                                as: "wellness",
                                cond: {
                                    $and: [
                                        { $lte: ["$$wellness", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }
                        },
                        wfhDates: 
                        {
                            $filter: {
                                input: "$wfhData.requeststart",
                                as: "wfh",
                                cond: {
                                    $and: [
                                        { $lte: ["$$wfh", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }
                        },
                        eventDates: {
                            $filter: {
                                input: "$eventData.eventdates",
                                as: "event",
                                cond: {
                                    $and: [
                                        { $lte: ["$$event.startdate", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }    
                        },
                        dates: {
                            $let: {
                                vars: {
                                    existingDates: "$members.dates",
                                    leaveDates: "$leaveData.leavedates"
                                },
                                in: {
                                    $reduce: {
                                        input: "$$leaveDates",
                                        initialValue: "$$existingDates",
                                        in: {
                                            $let: {
                                                vars: {
                                                    startDate: "$$this.leavestart",
                                                    endDate: "$$this.leaveend"
                                                },
                                                in: {
                                                    $concatArrays: [
                                                        "$$value",
                                                        {
                                                            $map: {
                                                                input: {
                                                                    $range: [
                                                                        0,
                                                                        {
                                                                            $add: [
                                                                                {
                                                                                    $divide: [
                                                                                        { $subtract: [
                                                                                            { $toDate: "$$endDate" }, 
                                                                                            { $toDate: "$$startDate" }
                                                                                        ]},
                                                                                        86400000
                                                                                    ]
                                                                                },
                                                                                1
                                                                            ]
                                                                        }
                                                                    ]
                                                                },
                                                                as: "dayOffset",
                                                                in: {
                                                                    date: {
                                                                        $dateAdd: {
                                                                            startDate: { $toDate: "$$startDate" },
                                                                            unit: "day",
                                                                            amount: "$$dayOffset"
                                                                        }
                                                                    },
                                                                    hours: 7.6,
                                                                    status: ["Leave"]
                                                                }
                                                            }
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            
            {
                $group: {
                    _id: '$_id',
                    componentid: { $first: '$_id' },
                    teamname: { $first: '$teamDetails.teamname' },
                    projectstart: { $first: '$projectDetails.startdate'}, 
                    projectend: { $first: '$projectDetails.deadlinedate'}, 
                    projectname: { $first: { projectid: '$projectDetails._id', name: '$projectDetails.projectname', status: '$projectDetails.status' } },
                    clientname: { $first: { clientid: '$clientDetails._id', name: '$clientDetails.clientname', priority: '$clientDetails.priority' } },
                    jobno: { $first: '$projectDetails.jobno' },
                    budgettype: { $first: '$budgettype' },
                    estimatedbudget: { $first: '$estimatedbudget' },
                    status: { $first: '$status' }, 
                    comments: { $first: '$comments' },
                    adminnotes: { $first: '$adminnotes' },
                    isVariation: { $first: '$isVariation'},
                    invoice: { $first: '$invoiceDetails' }, // Use updated invoiceDetails field
                    jobmanager: {
                        $first: {
                            employeeid: '$jobManagerDetails._id',
                            fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] },
                            initials: '$jobManagerDeets.initial',
                            isManager: '$isManager',
                            isJobManager: { $eq: ['$jobmanager', new mongoose.Types.ObjectId(id)] }
                        }
                    },
                    jobcomponent: { $first: '$jobcomponent' },
                    allDates: { $first: '$allDates' },
                    members: { $push: '$members' }
                }
            },
            {
                $sort: {
                    'jobmanager.fullname': -1,
                    'clientname.name': 1,
                    'jobno': 1,
                    'jobcomponent': 1,
                }
            },
        ]);
        
 
        return res.json({ message: "success", data: result });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }

}
exports.listjobcomponent = async (req, res) => {
    const { id, email } = req.user;
    const { projectid } = req.query;

    try {
        const result = await Jobcomponents.aggregate([
            { 
                $match: { 
                    project: new mongoose.Types.ObjectId(projectid),
                    status: { $in: ["completed", "", null, "On-going"] } 
                }
            },
            {
                $lookup: {
                    from: 'projects',
                    localField: 'project',
                    foreignField: '_id',
                    as: 'projectDetails'
                }
            },
            { $unwind: '$projectDetails' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'jobmanager',
                    foreignField: '_id',
                    as: 'jobManagerDetails'
                }
            },
            { $unwind: '$jobManagerDetails' },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'jobManagerDetails._id',
                    foreignField: 'owner',
                    as: 'jobManagerDeets'
                }
            },
            { $unwind: '$jobManagerDeets' },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'projectDetails.team',
                    foreignField: '_id',
                    as: 'teamDetails'
                }
            },
            { $unwind: { path: '$teamDetails', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    isManager: {
                        $cond: {
                            if: { $eq: [new mongoose.Types.ObjectId(id), '$teamDetails.manager'] },
                            then: true,
                            else: false
                        }
                    }
                }
            },
            { $unwind: '$members' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'members.employee',
                    foreignField: '_id',
                    as: 'employeeDetails'
                }
            },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'employeeDetails._id',
                    foreignField: 'owner',
                    as: 'userDetails'
                }
            },
            {
                $lookup: {
                    from: 'leaves',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: {
                                    $and: [ 
                                    { $eq: ['$owner', '$$employeeId'] },
                                    { $eq: ['$status', 'Approved'] }
                                    ]
                                } 
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                leavedates: {
                                    leavestart: "$leavestart",
                                    leaveend: "$leaveend"
                                }
                            }
                        }
                    ],
                    as: 'leaveData'
                }
            },
            {
                $lookup: {
                    from: 'wellnessdays',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                    { 
                        $match: { 
                            $expr: { 
                                $and: [
                                    { $eq: ['$owner', '$$employeeId'] },
                                ]
                            } 
                        } 
                    },                        
                    {
                            $project: {
                                _id: 0,
                                wellnessdates: "$requestdate"
                            }
                        }
                    ],
                    as: 'wellnessData'
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { teamId: '$teamDetails._id' },
                    pipeline: [
                        { $match: { $expr: { $in: ['$$teamId', '$teams'] } } },
                        {
                            $project: {
                                _id: 0,
                                eventdates: {
                                    startdate: "$startdate",
                                    enddate: "$enddate"
                                }
                            }
                        }
                    ],
                    as: 'eventData'
                }
            },
            {
                $lookup: {
                    from: 'invoices',
                    let: { jobComponentId: "$_id" },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $and: [
                                        { $eq: ["$jobcomponent", "$$jobComponentId"] },
                                        { $eq: ["$status", "Approved"] }
                                    ]
                                } 
                            } 
                        },
                        { $sort: { createdAt: -1 } },
                        { $limit: 1 }
                    ],
                    as: 'latestInvoice'
                }
            },   
            {
                $unwind: { path: "$latestInvoice", preserveNullAndEmptyArrays: true }
            },
            {
                $addFields: {
                    invoiceDetails: {
                        percentage: { $ifNull: ["$latestInvoice.newinvoice", 0] },
                        amount: { $ifNull: ["$latestInvoice.invoiceamount", 0] }
                    }
                }
            },
            {
                $addFields: {
                    allDates: {
                        $let: {
                            vars: {
                                startDate: "$projectDetails.startdate",
                                endDate: "$projectDetails.deadlinedate"
                            },
                            in: {
                                $map: {
                                    input: {
                                        $range: [
                                            0, // start from day 0
                                            { 
                                                $add: [
                                                    { $divide: [{ $subtract: ["$$endDate", "$$startDate"] }, 86400000] },
                                                    1
                                                ]
                                            } // end at the total number of days + 1 for inclusive range
                                        ]
                                    },
                                    as: "daysFromStart",
                                    in: {
                                        $dateAdd: {
                                            startDate: "$$startDate",
                                            unit: "day",
                                            amount: "$$daysFromStart"
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            {
                $addFields: {
                    members: {
                        employee: {
                            $cond: {
                                if: { $gt: [{ $size: "$employeeDetails" }, 0] },
                                then: {
                                    _id: { $arrayElemAt: ['$employeeDetails._id', 0] },
                                    fullname: {
                                        $concat: [
                                            { $ifNull: [{ $arrayElemAt: ['$userDetails.firstname', 0] }, ''] },
                                            ' ',
                                            { $ifNull: [{ $arrayElemAt: ['$userDetails.lastname', 0] }, ''] }
                                        ]
                                    },
                                    initials: '$userDetails.initial'
                                },
                                else: { _id: null, fullname: "N/A", initials: "NA" }
                            }
                        },
                        leaveDates: {
                            $filter: {
                                input: "$leaveData.leavedates",
                                as: "leave",
                                cond: {
                                    $and: [
                                        { $lte: ["$$leave.leavestart", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }
                        },
                        wellnessDates: {
                            $filter: {
                                input: "$wellnessData.wellnessdates",
                                as: "wellness",
                                cond: {
                                    $and: [
                                        { $gte: ["$$wellness", "$projectDetails.startdate"] },
                                        { $lte: ["$$wellness", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }
                        },
                        eventDates: {
                            $filter: {
                                input: "$eventData.eventdates",
                                as: "event",
                                cond: {
                                    $and: [
                                        { $lte: ["$$event.startdate", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }    
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$_id',
                    componentid: { $first: '$_id' },
                    teamname: { $first: '$teamDetails.teamname' },
                    projectend: { $first: '$projectDetails.deadlinedate'}, 
                    projectname: { $first: { projectid: '$projectDetails._id', name: '$projectDetails.projectname', status: '$projectDetails.status' } },
                    clientname: { $first: { clientid: '', name: 'Client Name' } },
                    jobno: { $first: '$projectDetails.jobno' },
                    budgettype: { $first: '$budgettype' },
                    estimatedbudget: { $first: '$estimatedbudget' },
                    status: { $first: '$status' }, 
                    invoice: { $first: '$invoiceDetails' }, // Use updated invoiceDetails field
                   
                    jobmanager: {
                        $first: {
                            employeeid: '$jobManagerDetails._id',
                            fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] },
                            initials: '$jobManagerDeets.initial',
                            isManager: '$isManager',
                            isJobManager: { $eq: ['$jobmanager', new mongoose.Types.ObjectId(id)] }
                        }
                    },
                    jobcomponent: { $first: '$jobcomponent' },
                    allDates: { $first: '$allDates' },
                    members: { $push: '$members' }
                }
            },
            {
                $sort: { createdAt: 1 }
            }
        ]);
        
 
        return res.json({ message: "success", data: result });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }
}

exports.listteamjobcomponent = async (req, res) => {
      const { id } = req.user;
    const { teamid, search, filterdate } = req.query;

    if(!mongoose.Types.ObjectId.isValid(teamid)) {
        return res.status(400).json({ message: "failed", data: "Invalid team ID" });
    }

    // Use createFromHexString for string IDs (recommended by mongoose/bson)
    const teamObjectId = mongoose.Types.ObjectId.createFromHexString(teamid);
    const userObjectId = mongoose.Types.ObjectId.createFromHexString(id);

    const referenceDate = filterdate ? moment.tz(new Date(filterdate), "Australia/Sydney") : moment.tz("Australia/Sydney");
    const startOfWeek = referenceDate.isoWeekday(1).toDate(); // forced to monday
    const endOfRange = moment(startOfWeek).add(1, 'year').subtract(1, 'days').toDate();



    let searchQuery = {};

    if (search) {
        searchQuery = {
            $or: [
            { 'projectDetails.projectname': { $regex: search, $options: 'i' } },
            { 'projectDetails.jobno': { $regex: search, $options: 'i' } },
            { 'clientDetails.clientname': { $regex: search, $options: 'i' } },
            { 'jobManagerDeets.firstname': { $regex: search, $options: 'i' } },
            { 'jobManagerDeets.lastname': { $regex: search, $options: 'i' } },
            ]
        };
    }

    try {

        const result = await Jobcomponents.aggregate([
            { 
                $match: { 
                    status: { $in: ["", null, "unarchived", "On-going"] } 
                }
            },
            {
                $lookup: {
                    from: 'projects',
                    localField: 'project',
                    foreignField: '_id',
                    as: 'projectDetails'
                }
            },
            { $match: { 'projectDetails.team': teamObjectId } },
            { $unwind: '$projectDetails' },
            {
                $lookup: {
                    from: "clients",
                    localField: "projectDetails.client",
                    foreignField: "_id",
                    as: "clientDetails"
                }
            },
            { $unwind: '$clientDetails' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'jobmanager',
                    foreignField: '_id',
                    as: 'jobManagerDetails'
                }
            },
            { $unwind: '$jobManagerDetails' },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'jobManagerDetails._id',
                    foreignField: 'owner',
                    as: 'jobManagerDeets'
                }
            },
            { $unwind: '$jobManagerDeets' },
            ...(search ? [{ $match: searchQuery }] : []),
            {
                $lookup: {
                    from: 'teams',
                    localField: 'projectDetails.team',
                    foreignField: '_id',
                    as: 'teamDetails'
                }
            },
            { $unwind: { path: '$teamDetails', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    isManager: {
                        $cond: {
                            if: { $eq: [new mongoose.Types.ObjectId(id), '$teamDetails.manager'] },
                            then: true,
                            else: false
                        }
                    }
                }
            },
            { $unwind: '$members' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'members.employee',
                    foreignField: '_id',
                    as: 'employeeDetails'
                }
            },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'employeeDetails._id',
                    foreignField: 'owner',
                    as: 'userDetails'
                }
            },
            {
                $lookup: {
                    from: 'leaves',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', '$$employeeId'] 
                                } 
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                leavedates: {
                                    leavestart: "$leavestart",
                                    leaveend: "$leaveend"
                                }
                            }
                        }
                    ],
                    as: 'leaveData'
                }
            },
            {
                $lookup: {
                    from: 'wellnessdays',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', '$$employeeId'] } } },
                        {
                            $project: {
                                _id: 0,
                                wellnessdates: "$requestdate"
                            }
                        }
                    ],
                    as: 'wellnessData'
                }
            },
            {
                $lookup: {
                    from: 'workfromhomes',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', '$$employeeId'] } } },
                        {
                            $project: {
                                _id: 0,
                                requeststart: "$requestdate"
                            }
                        }
                    ],
                    as: 'wfhData'
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { teamId: '$teamDetails._id' },
                    pipeline: [
                        { $match: { $expr: { $in: ['$$teamId', '$teams'] } } },
                        {
                            $project: {
                                _id: 0,
                                eventdates: {
                                    startdate: "$startdate",
                                    enddate: "$enddate"
                                }
                            }
                        }
                    ],
                    as: 'eventData'
                }
            },
            {
                $lookup: {
                    from: 'invoices',
                    let: { jobComponentId: "$_id" },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $and: [
                                        { $eq: ["$jobcomponent", "$$jobComponentId"] },
                                        { $eq: ["$status", "Approved"] }
                                    ]
                                } 
                            } 
                        },
                        { $sort: { createdAt: -1 } },
                        { $limit: 1 }
                    ],
                    as: 'latestInvoice'
                }
            },   
            {
                $unwind: { path: "$latestInvoice", preserveNullAndEmptyArrays: true }
            },
            {
                $lookup: {
                    from: 'invoices',
                    let: { jobComponentId: "$_id" },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $and: [
                                        { $eq: ["$jobcomponent", "$$jobComponentId"] },
                                        { $eq: ["$status", "Pending"] }
                                    ]
                                } 
                            } 
                        },
                        { $sort: { createdAt: -1 } },
                        { $limit: 1 }
                    ],
                    as: 'pendinginvoice'
                }
            },   
            {
                $unwind: { path: "$pendinginvoice", preserveNullAndEmptyArrays: true }
            },
            {
                $addFields: {
                    invoiceDetails: {
                        percentage: { $ifNull: ["$latestInvoice.newinvoice", 0] },
                        amount: { $ifNull: ["$latestInvoice.invoiceamount", 0] },
                        pendinginvoice: { $ifNull: ["$pendinginvoice.newinvoice", 0] },
                        pendingamount: { $ifNull: ["$pendinginvoice.invoiceamount", 0] }
                    }
                }
            },
            {
                "$addFields": {
                    "allDates": {
                        "$let": {
                            "vars": {
                                "startDate": startOfWeek,
                                "endDate": endOfRange
                            },
                            "in": {
                                "$filter": {
                                    "input": {
                                        "$map": {
                                            "input": {
                                                "$range": [
                                                    0,
                                                    {
                                                        "$min": [
                                                            {
                                                                "$floor": {
                                                                    "$divide": [
                                                                        { "$subtract": ["$$endDate", "$$startDate"] },
                                                                        86400000 // milliseconds in a day
                                                                    ]
                                                                }
                                                            },
                                                            365]
                                                    }
                                                ]
                                            },
                                            "as": "daysFromStart",
                                            "in": {
                                                "$dateAdd": {
                                                    "startDate": "$$startDate",
                                                    "unit": "day",
                                                    "amount": "$$daysFromStart"
                                                }
                                            }
                                        }
                                    },
                                    "as": "date",
                                    "cond": {
                                        "$and": [
                                            { "$ne": [{ "$dayOfWeek": "$$date" }, 1] }, // Exclude Sunday
                                            { "$ne": [{ "$dayOfWeek": "$$date" }, 7] }  // Exclude Saturday
                                        ]
                                    }
                                }
                            }
                        }
                    }
                }
            },
              {
                $addFields: {
                    members: {
                        employee: {
                            $cond: {
                                if: { $gt: [{ $size: "$employeeDetails" }, 0] },
                                then: {
                                    _id: { $arrayElemAt: ['$employeeDetails._id', 0] },
                                    fullname: {
                                        $concat: [
                                            { $ifNull: [{ $arrayElemAt: ['$userDetails.firstname', 0] }, ''] },
                                            ' ',
                                            { $ifNull: [{ $arrayElemAt: ['$userDetails.lastname', 0] }, ''] }
                                        ]
                                    },
                                    initials: '$userDetails.initial',
                                },
                                else: { _id: null, fullname: "N/A", initials: "NA" }
                            }
                        },
                        leaveDates: {
                            $filter: {
                                input: "$leaveData.leavedates",
                                as: "leave",
                                cond: {
                                    $and: [
                                        { $lte: ["$$leave.leavestart", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }
                        },
                        wellnessDates: {
                            $filter: {
                                input: "$wellnessData.wellnessdates",
                                as: "wellness",
                                cond: {
                                    $and: [
                                        { $lte: ["$$wellness", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }
                        },
                        wfhDates: 
                        {
                            $filter: {
                                input: "$wfhData.requeststart",
                                as: "wfh",
                                cond: {
                                    $and: [
                                        { $lte: ["$$wfh", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }
                        },
                        eventDates: {
                            $filter: {
                                input: "$eventData.eventdates",
                                as: "event",
                                cond: {
                                    $and: [
                                        { $lte: ["$$event.startdate", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }    
                        },
                        dates: {
                            $let: {
                                vars: {
                                    existingDates: "$members.dates",
                                    leaveDates: "$leaveData.leavedates"
                                },
                                in: {
                                    $reduce: {
                                        input: "$$leaveDates",
                                        initialValue: "$$existingDates",
                                        in: {
                                            $let: {
                                                vars: {
                                                    startDate: "$$this.leavestart",
                                                    endDate: "$$this.leaveend"
                                                },
                                                in: {
                                                    $concatArrays: [
                                                        "$$value",
                                                        {
                                                            $map: {
                                                                input: {
                                                                    $range: [
                                                                        0,
                                                                        {
                                                                            $add: [
                                                                                {
                                                                                    $divide: [
                                                                                        { $subtract: [
                                                                                            { $toDate: "$$endDate" }, 
                                                                                            { $toDate: "$$startDate" }
                                                                                        ]},
                                                                                        86400000
                                                                                    ]
                                                                                },
                                                                                1
                                                                            ]
                                                                        }
                                                                    ]
                                                                },
                                                                as: "dayOffset",
                                                                in: {
                                                                    date: {
                                                                        $dateAdd: {
                                                                            startDate: { $toDate: "$$startDate" },
                                                                            unit: "day",
                                                                            amount: "$$dayOffset"
                                                                        }
                                                                    },
                                                                    hours: 7.6,
                                                                    status: ["Leave"]
                                                                }
                                                            }
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            
            {
                $group: {
                    _id: '$_id',
                    componentid: { $first: '$_id' },
                    teamname: { $first: '$teamDetails.teamname' },
                    projectstart: { $first: '$projectDetails.startdate'}, 
                    projectend: { $first: '$projectDetails.deadlinedate'}, 
                    projectname: { $first: { projectid: '$projectDetails._id', name: '$projectDetails.projectname', status: '$projectDetails.status' } },
                    clientname: { $first: { clientid: '$clientDetails._id', name: '$clientDetails.clientname', priority: '$clientDetails.priority' } },
                    jobno: { $first: '$projectDetails.jobno' },
                    budgettype: { $first: '$budgettype' },
                    estimatedbudget: { $first: '$estimatedbudget' },
                    status: { $first: '$status' }, 
                    comments: { $first: '$comments' },
                    adminnotes: { $first: '$adminnotes' },
                    isVariation: { $first: '$isVariation'},
                    invoice: { $first: '$invoiceDetails' }, // Use updated invoiceDetails field
                    jobmanager: {
                        $first: {
                            employeeid: '$jobManagerDetails._id',
                            fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] },
                            initials: '$jobManagerDeets.initial',
                            isManager: '$isManager',
                            isJobManager: { $eq: ['$jobmanager', new mongoose.Types.ObjectId(id)] }
                        }
                    },
                    jobcomponent: { $first: '$jobcomponent' },
                    allDates: { $first: '$allDates' },
                    members: { $push: '$members' }
                }
            },
            {
                $sort: {
                    'jobmanager.fullname': -1,
                    'clientname.name': 1,
                    'jobno': 1,
                    'jobcomponent': 1,
                }
            },
        ]);
        
 
        return res.json({ message: "success", data: result });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }

}
exports.viewduedatesgraph = async (req, res) => {
    const { id, email } = req.user;
    const { teamid } = req.query;

    try {
        const result = await Jobcomponents.aggregate([
            { 
                $match: { 
                    status: { $in: ["completed", "", null, "On-going"] } 
                }
            },
            {
                $lookup: {
                    from: 'projects',
                    localField: 'project',
                    foreignField: '_id',
                    as: 'projectDetails'
                }
            },
            { $match: { 'projectDetails.team': new mongoose.Types.ObjectId(teamid) } },
            { $unwind: '$projectDetails' },
            {
                $lookup: {
                    from: 'clients',
                    localField: "projectDetails.client",
                    foreignField: "_id",
                    as: "clientDetails"
                }
            },
            { $unwind: '$clientDetails' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'jobmanager',
                    foreignField: '_id',
                    as: 'jobManagerDetails'
                }
            },
            { $unwind: '$jobManagerDetails' },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'jobManagerDetails._id',
                    foreignField: 'owner',
                    as: 'jobManagerDeets'
                }
            },
            { $unwind: '$jobManagerDeets' },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'projectDetails.team',
                    foreignField: '_id',
                    as: 'teamDetails'
                }
            },
            { $unwind: { path: '$teamDetails', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    isManager: {
                        $cond: {
                            if: { $eq: [new mongoose.Types.ObjectId(id), '$teamDetails.manager'] },
                            then: true,
                            else: false
                        }
                    }
                }
            },
            { $unwind: '$members' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'members.employee',
                    foreignField: '_id',
                    as: 'employeeDetails'
                }
            },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'employeeDetails._id',
                    foreignField: 'owner',
                    as: 'userDetails'
                }
            },
            {
                $lookup: {
                    from: 'leaves',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', '$$employeeId'],
                                    $eq: ['$status', 'Approved'] 
                                } 
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                leavedates: {
                                    leavestart: "$leavestart",
                                    leaveend: "$leaveend"
                                }
                            }
                        }
                    ],
                    as: 'leaveData'
                }
            },
            {
                $lookup: {
                    from: 'wellnessdays',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', '$$employeeId'] } } },
                        {
                            $project: {
                                _id: 0,
                                wellnessdates: "$requestdate"
                            }
                        }
                    ],
                    as: 'wellnessData'
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { teamId: '$teamDetails._id' },
                    pipeline: [
                        { $match: { $expr: { $in: ['$$teamId', '$teams'] } } },
                        {
                            $project: {
                                _id: 0,
                                eventdates: {
                                    startdate: "$startdate",
                                    enddate: "$enddate"
                                }
                            }
                        }
                    ],
                    as: 'eventData'
                }
            },
            {
                $addFields: {
                    allDates: {
                        $let: {
                            vars: {
                                startDate: "$projectDetails.startdate",
                                endDate: "$projectDetails.deadlinedate"
                            },
                            in: {
                                $map: {
                                    input: {
                                        $range: [
                                            0, // start from day 0
                                            { 
                                                $add: [
                                                    { $divide: [{ $subtract: ["$$endDate", "$$startDate"] }, 86400000] },
                                                    1
                                                ]
                                            } // end at the total number of days + 1 for inclusive range
                                        ]
                                    },
                                    as: "daysFromStart",
                                    in: {
                                        $dateAdd: {
                                            startDate: "$$startDate",
                                            unit: "day",
                                            amount: "$$daysFromStart"
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            {
                $addFields: {
                    members: {
                        employee: {
                            $cond: {
                                if: { $gt: [{ $size: "$employeeDetails" }, 0] },
                                then: {
                                    _id: { $arrayElemAt: ['$employeeDetails._id', 0] },
                                    fullname: {
                                        $concat: [
                                            { $ifNull: [{ $arrayElemAt: ['$userDetails.firstname', 0] }, ''] },
                                            ' ',
                                            { $ifNull: [{ $arrayElemAt: ['$userDetails.lastname', 0] }, ''] }
                                        ]
                                    },
                                    initials: '$userDetails.initial'
                                },
                                else: { _id: null, fullname: "N/A", initials: "NA" }
                            }
                        },
                        leaveDates: {
                            $filter: {
                                input: "$leaveData.leavedates",
                                as: "leave",
                                cond: {
                                    $and: [
                                        { $lte: ["$$leave.leavestart", "$projectDetails.deadlinedate"] },
                                        { $eq: ["$$leave.status", "Approved"] }
                                    ]
                                }
                            }
                        },
                        wellnessDates: {
                            $filter: {
                                input: "$wellnessData.wellnessdates",
                                as: "wellness",
                                cond: {
                                    $and: [
                                        { $gte: ["$$wellness", "$projectDetails.startdate"] },
                                        { $lte: ["$$wellness", "$projectDetails.deadlinedate"] },
                                        { $eq: ["$$wellness.status", "Approved"] }
                                    ]
                                }
                            }
                        },
                        eventDates: {
                            $filter: {
                                input: "$eventData.eventdates",
                                as: "event",
                                cond: {
                                    $and: [
                                        { $lte: ["$$event.startdate", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }    
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$_id',
                    componentid: { $first: '$_id' },
                    teamname: { $first: '$teamDetails.teamname' },
                    projectname: { $first: { projectid: '$projectDetails._id', name: '$projectDetails.projectname' } },
                    clientname: { $first: { clientid: '$clientDetails._id', name: '$clientDetails.clientname', priority: "$clientDetails.priority" } },
                    jobno: { $first: '$projectDetails.jobno' },
                    budgettype: { $first: '$budgettype' },
                    estimatedbudget: { $first: '$estimatedbudget' },
                    status: { $first: '$status' }, 
                    isVariation: { $first: '$isVariation' },
                    jobmanager: {
                        $first: {
                            employeeid: '$jobManagerDetails._id',
                            fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] },
                            initials: '$jobManagerDeets.initial',
                            isManager: '$isManager',
                            isJobManager: { $eq: ['$jobmanager', new mongoose.Types.ObjectId(id)] }
                        }
                    },
                    jobcomponent: { $first: '$jobcomponent' },
                    allDates: { $first: '$allDates' },
                    members: { $push: '$members' }
                }
            },
            {
                $sort: { createdAt: 1 }
            }
        ]);
        
        return res.json({ message: "success", data: result });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }
}


exports.yourworkload = async (req, res) => {
    const { id } = req.user;
    const { filterDate } = req.query;
    try {
        // Use filterDate if provided; otherwise, default to today
        const referenceDate = filterDate ? moment.tz(new Date(filterDate), "Australia/Sydney") : moment.tz("Australia/Sydney");
        const startOfWeek = referenceDate.startOf("isoWeek").toDate();
        const endOfRange = moment(startOfWeek).add(8, "weeks").subtract(1, "days").toDate();

        // Find all teams the user is a member of
        const teams = await Teams.find({ members: new mongoose.Types.ObjectId(id) }).lean();
        const userDetails = await Userdetails.findOne({ owner: id }).lean();

        // Build alldates (weekdays only)
        const dateList = [];
        let currentDate = new Date(startOfWeek);
        while (currentDate <= endOfRange) {
            const dayOfWeek = currentDate.getDay();
            if (dayOfWeek !== 6 && dayOfWeek !== 0) {
                dateList.push(new Date(currentDate).toISOString().split('T')[0]);
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // If no teams, return empty structure
        if (!teams.length) {
            // Try to get userdetails anyway
        const leaveDates = (
            await Leave.find({ owner: id, status: "Approved" }).lean()
        ).map(leave => ({
            ...leave,
            leavestart: leave.leavestart ? moment(leave.leavestart).format('YYYY-MM-DD') : null,
            leaveend: leave.leaveend ? moment(leave.leaveend).format('YYYY-MM-DD') : null
        }));

        const wfhDates = (
            await Workfromhome.find({ owner: id, status: "Approved" }).select("requestdate requestend -_id").lean()
        ).map(wfh => ({
            requestdate: wfh.requestdate ? moment(wfh.requestdate).format('YYYY-MM-DD') : null,
            requestend: wfh.requestend ? moment(wfh.requestend).format('YYYY-MM-DD') : null
        }));

        const wellnessDates = (
            await Wellnessday.find({ owner: id }).select("requestdate -_id").lean()
        ).map(wd => wd.requestdate ? moment(wd.requestdate).format('YYYY-MM-DD') : null);

   // Build alldates (weekdays only)
            const dateList = [];
            let currentDate = new Date(startOfWeek);
            while (currentDate <= endOfRange) {
            const dayOfWeek = currentDate.getDay();
            if (dayOfWeek !== 6 && dayOfWeek !== 0) {
                dateList.push(new Date(currentDate).toISOString().split('T')[0]);
            }
            currentDate.setDate(currentDate.getDate() + 1);
            }

            let membersArr = [];
            if (userDetails) {
            // Build leave overlay dates
            let userDates = [];
            if (Array.isArray(leaveDates)) {
                leaveDates.forEach(leave => {
                if (leave.status === "Approved") {
                    const startDate = moment(leave.leavestart);
                    const endDate = moment(leave.leaveend);
                    let remainingWorkHours = leave.workinghoursduringleave || 0;
                    for (let date = moment(startDate); date <= moment(endDate); date.add(1, 'days')) {
                    if (date.day() !== 0 && date.day() !== 6) {
                        let standardHours = 7.6;
                        if (leave.wellnessdaycycle === true) {
                        standardHours = 8.44;
                        }
                        let hoursForThisDay = standardHours;
                        if (remainingWorkHours > 0) {
                        if (remainingWorkHours >= standardHours) {
                            hoursForThisDay = 0;
                            remainingWorkHours = Number((remainingWorkHours - standardHours).toFixed(2));
                        } else {
                            hoursForThisDay = Number((standardHours - remainingWorkHours).toFixed(2));
                            remainingWorkHours = 0;
                        }
                        }
                        userDates.push({
                        date: date.format('YYYY-MM-DD'),
                        hours: Number(hoursForThisDay.toFixed(2)),
                        status: ['Leave']
                        });
                    }
                    }
                }
                });
            }
            // Fill userDates with 0-hour entries for all dates in dateList if not present
            const dateSet = new Set(userDates.map(d => d.date));
            dateList.forEach(dateStr => {
                if (!dateSet.has(dateStr)) {
                userDates.push({
                    date: dateStr,
                    hours: 0,
                    status: []
                });
                }
            });
            userDates.sort((a, b) => (a.date > b.date ? 1 : -1));
            membersArr.push({
                employee: {
                employeeid: [userDetails.owner?.toString()],
                fullname: `${userDetails.firstname} ${userDetails.lastname}`,
                initials: userDetails.initial
                },
                role: userDetails.role || "",
                leaveDates,
                wellnessDates,
                wfhDates,
                dates: userDates
            });
            }

            return res.json({
            message: 'success',
            data: {
                alldates: dateList,
                yourworkload: [],
                members: membersArr
            }
            });
        }

        // Prepare all team IDs
        const teamIds = teams.map(team => team._id);

        // Find all projects for these teams within the date range
        const projects = await Projects.find({
            team: { $in: teamIds },
            $or: [
                { startdate: { $lte: endOfRange }, deadlinedate: { $gte: startOfWeek } },
                { startdate: { $lte: endOfRange }, deadlinedate: { $gte: startOfWeek } }
            ]
        }).lean();

        // Find all job components for these projects where the user is a member
        const projectIds = projects.map(p => p._id);
        const jobComponents = await Jobcomponents.find({
            project: { $in: projectIds },
            members: { $elemMatch: { employee: new mongoose.Types.ObjectId(id) } },
            status: { $in: ["completed", "", null, "On-going"] }
        })
        .populate([
            { path: 'project', model: 'Projects' },
            { path: 'jobmanager', model: 'Users' }
        ])
        .lean();

        // Get all needed details for job managers, clients, teams, etc.
        const jobManagerIds = jobComponents.map(jc => jc.jobmanager?._id || jc.jobmanager).filter(Boolean);
        const clientIds = projects.map(p => p.client).filter(Boolean);
        const teamDetailsMap = {};
        teams.forEach(team => { teamDetailsMap[team._id.toString()] = team; });

        // Get userdetails for job managers
        const jobManagerDetails = await Userdetails.find({ owner: { $in: jobManagerIds } }).lean();
        const jobManagerDetailsMap = {};
        jobManagerDetails.forEach(jm => { jobManagerDetailsMap[jm.owner.toString()] = jm; });

        // Get client details
        const clientDetails = await Clients.find({ _id: { $in: clientIds } }).lean();
        const clientDetailsMap = {};
        clientDetails.forEach(c => { clientDetailsMap[c._id.toString()] = c; });

        // Get team member details for initials
        const allTeamMemberIds = [].concat(...teams.map(t => t.members));
        const allTeamMemberDetails = await Userdetails.find({ owner: { $in: allTeamMemberIds } }).lean();
        const allTeamMemberDetailsMap = {};
        allTeamMemberDetails.forEach(m => { allTeamMemberDetailsMap[m.owner.toString()] = m; });

        // Get leave, wfh, wellness, event data for the user
        // Only get the date fields and format them (except for leave, which is used for calculations)
        const leaveDates = (
            await Leave.find({ owner: id, status: "Approved" }).lean()
        ).map(leave => ({
            ...leave,
            leavestart: leave.leavestart ? moment(leave.leavestart).format('YYYY-MM-DD') : null,
            leaveend: leave.leaveend ? moment(leave.leaveend).format('YYYY-MM-DD') : null
        }));

        const wfhDates = (
            await Workfromhome.find({ owner: id, status: "Approved" }).select("requestdate requestend -_id").lean()
        ).map(wfh => ({
            requestdate: wfh.requestdate ? moment(wfh.requestdate).format('YYYY-MM-DD') : null,
            requestend: wfh.requestend ? moment(wfh.requestend).format('YYYY-MM-DD') : null
        }));

        const wellnessDates = (
            await Wellnessday.find({ owner: id}).select("requestdate -_id").lean()
        ).map(wd => wd.requestdate ? moment(wd.requestdate).format('YYYY-MM-DD') : null);

        // For events, get all events for all teams user is in, only dates
        const eventDates = (
            await Events.find({ teams: { $in: teamIds } }).select("startdate enddate -_id").lean()
        ).map(ev => ({
            startdate: ev.startdate ? moment(ev.startdate).format('YYYY-MM-DD') : null,
            enddate: ev.enddate ? moment(ev.enddate).format('YYYY-MM-DD') : null
        }));

        // Build yourworkload array
        const yourworkload = jobComponents.map(jc => {
            const project = jc.project || {};
            const team = teamDetailsMap[project.team?.toString()] || {};
            const jobmanager = jc.jobmanager;
            const jobmanagerDeets = jobManagerDetailsMap[jobmanager?._id?.toString() || jobmanager?.toString()] || {};
            const client = clientDetailsMap[project.client?.toString()] || {};

            // Team members initials
            const teammembers = (team.members || []).map(mid => {
                const m = allTeamMemberDetailsMap[mid.toString()];
                return m ? (m.initial || '') : '';
            });

            // Only include the current user's member entry
            const members = jc.members
                .filter(m => m.employee?.toString() === id)
                .map(member => {
                    // Dates: process leave overlays
                    let mappedMember = {
                        employee: member.employee,
                        role: member.role,
                        notes: member.notes,
                        dates: (member.dates ? member.dates.map(d => ({
                            ...d,
                            date: d.date ? moment(d.date).format('YYYY-MM-DD') : d.date
                        })) : []),
                        leaveDates,
                        wellnessDates,
                        eventDates,
                        wfhDates: wfhDates
                            ? wfhDates.map(wfh => ({
                                ...wfh,
                                requestdate: wfh.requestdate
                                    ? moment(wfh.requestdate).format('YYYY-MM-DD')
                                    : wfh.requestdate,
                                requestend: wfh.requestend
                                    ? moment(wfh.requestend).format('YYYY-MM-DD')
                                    : wfh.requestend
                            }))
                            : []
                    };

                    // Overlay leave on dates
                    if (Array.isArray(leaveDates)) {
                        leaveDates.forEach(leave => {
                            if (leave.status === "Approved") {
                                const startDate = moment(leave.leavestart);
                                const endDate = moment(leave.leaveend);
                                let remainingWorkHours = leave.workinghoursduringleave || 0;
                                for (let date = moment(startDate); date <= moment(endDate); date.add(1, 'days')) {
                                    if (date.day() !== 0 && date.day() !== 6) {
                                        const dateStr = date.format('YYYY-MM-DD');
                                        const existingDateIndex = mappedMember.dates.findIndex(d =>
                                            moment(d.date).format('YYYY-MM-DD') === dateStr
                                        );
                                       let standardHours = 7.6;

                                        if(leave.wellnessdaycycle === true) {
                                            standardHours = 8.44
                                        }                                          
                                        let hoursForThisDay = standardHours;
                                        if (remainingWorkHours > 0) {
                                            if (remainingWorkHours >= standardHours) {
                                                hoursForThisDay = 0;
                                                remainingWorkHours = Number((remainingWorkHours - standardHours).toFixed(2));
                                            } else {
                                                hoursForThisDay = Number((standardHours - remainingWorkHours).toFixed(2));
                                                remainingWorkHours = 0;
                                            }
                                        }
                                        if (existingDateIndex >= 0) {
                                            mappedMember.dates[existingDateIndex].hours = Number(hoursForThisDay.toFixed(2));
                                        } else {
                                            mappedMember.dates.push({
                                                date: date.toDate(),
                                                hours: Number(hoursForThisDay.toFixed(2)),
                                                status: ['Leave']
                                            });
                                        }
                                    }
                                }
                            }
                        });
                    }
                    return mappedMember;
                });

            return {
                _id: jc._id,
                jobmanager: {
                    employeeid: jobmanager?._id || jobmanager,
                    fullname: jobmanagerDeets.firstname && jobmanagerDeets.lastname
                        ? `${jobmanagerDeets.firstname} ${jobmanagerDeets.lastname}`
                        : '',
                    initials: jobmanagerDeets.initial || ''
                },
                componentid: jc._id,
                clientid: client._id,
                clientname: client.clientname,
                clientpriority: client.priority,
                teamid: team._id,
                teamname: team.teamname,
                teammembers,
                projectname: project.projectname,
                jobno: project.jobno,
                jobcomponent: jc.jobcomponent,
                members
            };
        });

        // Only return data for the logged-in user
        let membersArr = [];
        if (userDetails) {

            let userDates = [];
            jobComponents.forEach(jc => {
            jc.members
                .filter(m => m.employee?.toString() === id)
                .forEach(member => {
                if (Array.isArray(member.dates)) {
                    userDates = userDates.concat(
                    member.dates.map(d => ({
                        ...d,
                        date: d.date ? moment(d.date).format('YYYY-MM-DD') : d.date
                    }))
                    );
                }
                });
            });

            // If userDates is empty but leaveDates exist, generate leave entries
            if (userDates.length === 0 && Array.isArray(leaveDates)) {
            leaveDates.forEach(leave => {
                if (leave.status === "Approved") {
                const startDate = moment(leave.leavestart);
                const endDate = moment(leave.leaveend);
                let remainingWorkHours = leave.workinghoursduringleave || 0;
                for (let date = moment(startDate); date <= moment(endDate); date.add(1, 'days')) {
                    if (date.day() !== 0 && date.day() !== 6) {
                    let standardHours = 7.6;
                    if (leave.wellnessdaycycle === true) {
                        standardHours = 8.44;
                    }
                    let hoursForThisDay = standardHours;
                    if (remainingWorkHours > 0) {
                        if (remainingWorkHours >= standardHours) {
                        hoursForThisDay = 0;
                        remainingWorkHours = Number((remainingWorkHours - standardHours).toFixed(2));
                        } else {
                        hoursForThisDay = Number((standardHours - remainingWorkHours).toFixed(2));
                        remainingWorkHours = 0;
                        }
                    }
                    userDates.push({
                        date: date.format('YYYY-MM-DD'),
                        hours: Number(hoursForThisDay.toFixed(2)),
                        status: ['Leave']
                    });
                    }
                }
                }
            });
            } else {
            // Overlay leave on userDates
            if (Array.isArray(leaveDates)) {
                leaveDates.forEach(leave => {
                if (leave.status === "Approved") {
                    const startDate = moment(leave.leavestart);
                    const endDate = moment(leave.leaveend);
                    let remainingWorkHours = leave.workinghoursduringleave || 0;
                    for (let date = moment(startDate); date <= moment(endDate); date.add(1, 'days')) {
                    if (date.day() !== 0 && date.day() !== 6) {
                        const dateStr = date.format('YYYY-MM-DD');
                        const existingDateIndex = userDates.findIndex(d =>
                        moment(d.date).format('YYYY-MM-DD') === dateStr
                        );
                        let standardHours = 7.6;
                        if (leave.wellnessdaycycle === true) {
                        standardHours = 8.44;
                        }
                        let hoursForThisDay = standardHours;
                        if (remainingWorkHours > 0) {
                        if (remainingWorkHours >= standardHours) {
                            hoursForThisDay = 0;
                            remainingWorkHours = Number((remainingWorkHours - standardHours).toFixed(2));
                        } else {
                            hoursForThisDay = Number((standardHours - remainingWorkHours).toFixed(2));
                            remainingWorkHours = 0;
                        }
                        }
                        if (existingDateIndex >= 0) {
                        userDates[existingDateIndex].hours = Number(hoursForThisDay.toFixed(2));
                        } else {
                        userDates.push({
                            date: date.format('YYYY-MM-DD'),
                            hours: Number(hoursForThisDay.toFixed(2)),
                            status: ['Leave']
                        });
                        }
                    }
                    }
                }
                });
            }
            }

            // Fill userDates with 0-hour entries for all dates in dateList if not present
            const dateSet = new Set(userDates.map(d => d.date));
            dateList.forEach(dateStr => {
            if (!dateSet.has(dateStr)) {
                userDates.push({
                date: dateStr,
                hours: 0,
                status: []
                });
            }
            });

            userDates.sort((a, b) => (a.date > b.date ? 1 : -1));

            membersArr.push({
            employee: {
                employeeid: [userDetails.owner?.toString()],
                fullname: `${userDetails.firstname} ${userDetails.lastname}`,
                initials: userDetails.initial
            },
            role: userDetails.role || "",
            leaveDates,
            wellnessDates,
            eventDates,
            wfhDates,
            dates: userDates
            });
        }

        // Only return yourworkload and members for the logged-in user
        return res.json({
            message: 'success',
            data: {
            alldates: dateList,
            yourworkload: yourworkload.filter(yw => yw.members.some(m => m.employee?.toString() === id)),
            members: membersArr
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error processing request', error: err.message });
    }
};


exports.editjobmanagercomponents = async (req, res) => {
    const { id, email } = req.user;
    const { jobcomponentid, members, adminnotes } = req.body;

    // Validate members input
    if (!Array.isArray(members) || members.length < 1 || members.length > 4) {
        return res.status(400).json({
            message: "failed",
            data: "Invalid members data. There should be 1 to 4 members.",
        });
    }

    try {
        // Find the job component
        const jobcomponent = await Jobcomponents.findById(new mongoose.Types.ObjectId(jobcomponentid));
        if (!jobcomponent) {
            return res.status(404).json({ message: "failed", data: "Jobcomponent not found." });
        }

        // Update members
        members.forEach((memberData) => {
            const { employee, role, notes } = memberData;

            // Find the index of the existing member by employee ID
            const memberIndex = jobcomponent.members.findIndex(
                (m) => m.employee.toString() === employee.toString()
            );

            // Update existing member or replace/add new member
            if (memberIndex !== -1) {
                jobcomponent.members[memberIndex].role = role || jobcomponent.members[memberIndex].role;
                jobcomponent.members[memberIndex].notes = notes || jobcomponent.members[memberIndex].notes;
            } else {
                if (jobcomponent.members.length >= 4) {
                    const replaceIndex = jobcomponent.members.findIndex(
                        (m) => m.employee.toString() === members[0].employee.toString()
                    );

                    if (replaceIndex !== -1) {
                        jobcomponent.members[replaceIndex] = {
                            employee,
                            role,
                            notes,
                            dates: [],
                        };
                    }
                } else {
                    jobcomponent.members.push({
                        employee,
                        role,
                        notes,
                        dates: [], 
                    });
                }
            }
        });

        await jobcomponent.save();

        const jobManagerId = jobcomponent.jobmanager;
        const jobManager = await Users.findOne({ _id: jobManagerId });
        const financeUsers = await Users.find({ auth: "finance" });
        const financeUserIds = financeUsers.map((user) => user._id);

        const allRecipientIds = Array.from(new Set([...financeUserIds, jobManagerId]));

        // Filter out empty or invalid employee IDs
        const validEmployees = members
        .map(m => m.employee)
        .filter(employeeId => employeeId && mongoose.Types.ObjectId.isValid(employeeId));

        // Get member details only for valid employee IDs
        const memberDetails = await Userdetails.find({ 
        owner: { $in: validEmployees } 
        });

        // Create a map of employee IDs to full names, with validation
        const employeeNameMap = memberDetails.reduce((map, member) => {
        if (member.owner) {
            map[member.owner.toString()] = `${member.firstname} ${member.lastname}`;
        }
        return map;
        }, {});

        // Construct email content
        const emailContent = `Hello Team,

        The job component "${jobcomponent.jobcomponent}" has been updated with new member details.

        Updated Members:
        ${members
        .map(
            member => 
        `        
        Name: ${employeeNameMap[member.employee?.toString()] || 'N/A'}
        Role: ${member.role || 'N/A'}
        Notes: ${member.notes || "No notes provided"}`
        )
        .join("\n\n")}

        Please review the updated job component details if necessary.

        Thank you!

        Best Regards,
        ${email}`;

        const sender = new mongoose.Types.ObjectId(id);

        const receiver = await getAllUserIdsExceptSender(id);

        await sendmail(sender, receiver, "Job Component Members Updated", emailContent)
            .catch((err) => {
                console.error(
                    `Failed to send email notification for job component: ${jobcomponentid}. Error: ${err}`
                );
                return res.status(400).json({
                    message: "bad-request",
                    data: "Email notification failed! Please contact customer support for more details.",
                });
            });

        return res.status(200).json({ message: "success", data: "Job component updated and email sent successfully." });
    } catch (err) {
        console.error(`Error updating job component ${jobcomponentid}: ${err}`);
        return res.status(500).json({
            message: "server-error",
            data: "An error occurred. Please contact customer support for more details.",
        });
    }
};


exports.getjobcomponentdashboard = async (req, res) => {
    const { id, email } = req.user;
    const { filterDate } = req.query;

    try {
        const referenceDate = filterDate ? moment.tz(new Date(filterDate), "Australia/Sydney") : moment.tz("Australia/Sydney");
        const startOfWeek = referenceDate.startOf("isoWeek").toDate();
        const endOfRange = moment(startOfWeek).add(8, "weeks").subtract(1, "days").toDate();
        
        const result = await Jobcomponents.aggregate([
            { 
                $match: { 
                    status: { $in: ["completed", "", null, "On-going"] } 
                }
            },
            {
                $lookup: {
                    from: 'projects',
                    localField: 'project',
                    foreignField: '_id',
                    as: 'projectDetails'
                }
            },
            { $unwind: '$projectDetails' },
            {
                $match: {
                    $or: [
                        { 
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        },
                        {
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        }
                    ],
                    jobmanager: new mongoose.Types.ObjectId(id),
                }
            },
            { $unwind: "$members" },
            { $unwind: "$members.dates" },
            {
                $match: {
                    "members.dates.date": { $gte: startOfWeek, $lte: endOfRange }
                }
            },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'members.employee',
                    foreignField: 'owner',
                    as: 'userDetails'
                }
            },
            { $unwind: '$userDetails' },
            {
                $lookup: {
                    from: 'leaves',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', '$$employeeId'],
                                    $eq: ['$status', 'Approved'] 
                                } 
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                leavedates: {
                                    leavestart: "$leavestart",
                                    leaveend: "$leaveend"
                                }
                            }
                        }
                    ],
                    as: 'leaveData'
                }
            },
            {
                $lookup: {
                    from: 'wellnessdays',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', '$$employeeId'] } } },
                        {
                            $project: {
                                _id: 0,
                                wellnessdates: "$requestdate"
                            }
                        }
                    ],
                    as: 'wellnessData'
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { teamId: '$projectDetails.team' },
                    pipeline: [
                        { $match: { $expr: { $in: ['$$teamId', '$teams'] } } },
                        {
                            $project: {
                                _id: 0,
                                eventdates: {
                                    startdate: "$startdate",
                                    enddate: "$enddate"
                                }
                            }
                        }
                    ],
                    as: 'eventData'
                }
            },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'projectDetails.team',
                    foreignField: '_id',
                    as: 'teamData'
                }
            },
            { $unwind: '$teamData' },
            {
                $group: {
                    _id: {
                        teamid: "$teamData._id",
                        team: "$teamData.teamname",
                        employeeId: "$userDetails._id", 
                        employeeName: { $concat: ["$userDetails.firstname", " ", "$userDetails.lastname"] },
                        date: "$members.dates.date"
                    },
                    employee: {
                        $first: {
                            id: "$userDetails.owner",
                            fullname: { $concat: ["$userDetails.firstname", " ", "$userDetails.lastname"] },
                            initial: "$userDetails.initial",
                            resource: "$userDetails.resource"
                        }
                    },
                    date: { $first: "$members.dates.date" },
                    status: { $first: "$members.dates.status" },
                    totalHours: { $sum: "$members.dates.hours" },
                    leaveData: { $first: "$leaveData" },
                    wellnessData: { $first: "$wellnessData" },
                    eventData: { $first: "$eventData" }
                }
            },
            {
                $project: {
                    employee: 1,
                    date: 1,
                    status: 1,
                    totalHours: 1,
                    leaveData: 1,
                    wellnessData: 1,
                    eventData: 1,
                    teamid: "$_id.teamid",
                    teamName: "$_id.team",
                }
            },
            { $sort: { "teamName": 1, "employee": 1, "date": 1 } }
        ]);

        const data = {
            alldates: [],
            teams: []
        };


        let currentDate = new Date(startOfWeek);
        while (currentDate <= endOfRange) {
            if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
                data.alldates.push(currentDate.toISOString().split('T')[0]);
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        result.forEach(entry => {
            const { teamName, teamid, employee, date, status, totalHours, leaveData, wellnessData, eventData} = entry;
            const formattedDate = new Date(date).toISOString().split('T')[0];

            let teamData = data.teams.find(team => team.name === teamName);
            if (!teamData) {
                teamData = {
                    teamid: teamid,
                    name: teamName,
                    members: []
                };
                data.teams.push(teamData);
            }

            let employeeData = teamData.members.find(emp => emp.name === employee.fullname);
            if (!employeeData) {
                employeeData = {
                    id: employee.id,
                    name: employee.fullname,
                    initial: employee.initial,
                    resource: employee.resource,
                    leave: [],
                    wellness: entry.wellnessData,
                    event: [],
                    dates: [],
                };
                entry.leaveData.forEach(leave => {
                    employeeData.leave.push({
                        leavestart: leave.leavedates.leavestart,
                        leaveend: leave.leavedates.leaveend
                    })
                })

                entry.eventData.forEach(event => {
                    employeeData.event.push({
                        eventstart: event.eventdates.startdate,
                        eventend: event.eventdates.enddate
                    })
                })

                teamData.members.push(employeeData);
            }

            let dateEntry = employeeData.dates.find(d => d.date === formattedDate);
            if (!dateEntry) {
                dateEntry = {
                    date: formattedDate,
                    totalhoursofjobcomponents: totalHours,
                };

                employeeData.dates.push(dateEntry);
            }
        });

        return res.json({ message: 'success', data });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error processing request', error: err.message });
    }
};

// exports.getsuperadminjobcomponentdashboard = async (req, res) => {
//     const { id, email } = req.user;
//     const { filterDate } = req.query;

//     try {
//         const referenceDate = filterDate ? moment(new Date(filterDate)) : moment();
//         const startOfWeek = referenceDate.startOf('isoWeek').toDate();
//         const endOfRange = moment(startOfWeek).add(8, 'weeks').subtract(1, 'days').toDate();
        
//         const result = await Jobcomponents.aggregate([
//             { 
//                 $match: { 
//                     status: { $in: ["completed", "", null, "unarchive", "On-going"] } 
//                 }
//             },
//             {
//                 $lookup: {
//                     from: 'projects',
//                     localField: 'project',
//                     foreignField: '_id',
//                     as: 'projectDetails'
//                 }
//             },
//             { $unwind: '$projectDetails' },
//             {
//                 $match: {
//                     $or: [
//                         { 
//                             $and: [
//                                 { 'projectDetails.startdate': { $lte: endOfRange } },
//                                 { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
//                             ]
//                         },
//                         {
//                             $and: [
//                                 { 'projectDetails.startdate': { $lte: endOfRange } },
//                                 { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
//                             ]
//                         }
//                     ],
//                 }
//             },
//             { $unwind: "$members" },
//             { $unwind: { preserveNullAndEmptyArrays: true, path: "$members.dates" } },
//             // { $unwind: "$members.dates" },
//             // {
//             //     $match: {
//             //         "members.dates.date": { $gte: startOfWeek, $lte: endOfRange }
//             //     }
//             // },
//             {
//                 $lookup: {
//                     from: 'userdetails',
//                     localField: 'members.employee',
//                     foreignField: 'owner',
//                     as: 'userDetails'
//                 }
//             },
//             { $unwind: '$userDetails' },
//             {
//                 $lookup: {
//                     from: 'leaves',
//                     let: { employeeId: '$members.employee' },
//                     pipeline: [
//                         { 
//                             $match: { 
//                                 $expr: { 
//                                     $eq: ['$owner', '$$employeeId'] 
//                                 } 
//                             }
//                         },
//                         {
//                             $project: {
//                                 _id: 0,
//                                 leavedates: {
//                                     leavestart: "$leavestart",
//                                     leaveend: "$leaveend"
//                                 }
//                             }
//                         }
//                     ],
//                     as: 'leaveData'
//                 }
//             },
//             {
//                 $lookup: {
//                     from: 'workfromhomes',
//                     let: { employeeId: '$members.employee' },
//                     pipeline: [
//                         { 
//                             $match: { 
//                                 $expr: { 
//                                     $and: [
//                                         { $eq: ['$owner', '$$employeeId'] },
//                                         // { $gte: ['$requestdate', startOfWeek] },
//                                         // { $lte: ['$requestdate', endOfRange] }
//                                     ]
//                                 } 
//                             }
//                         },
//                         {
//                             $project: {
//                                 _id: 0,
//                                 requestdate: 1,
//                                 requestend: 1
//                             }
//                         }
//                     ],
//                     as: 'wfhData'
//                 }
//             },
//             {
//                 $lookup: {
//                     from: 'wellnessdays',
//                     let: { employeeId: '$members.employee' },
//                     pipeline: [
//                         { $match: { $expr: { $eq: ['$owner', '$$employeeId'] } } },
//                         {
//                             $project: {
//                                 _id: 0,
//                                 wellnessdates: "$requestdate"
//                             }
//                         }
//                     ],
//                     as: 'wellnessData'
//                 }
//             },
//             {
//                 $lookup: {
//                     from: 'events',
//                     let: { teamId: '$projectDetails.team' },
//                     pipeline: [
//                         { $match: { $expr: { $in: ['$$teamId', '$teams'] } } },
//                         {
//                             $project: {
//                                 _id: 0,
//                                 eventdates: {
//                                     startdate: "$startdate",
//                                     enddate: "$enddate"
//                                 }
//                             }
//                         }
//                     ],
//                     as: 'eventData'
//                 }
//             },
//             {
//                 $lookup: {
//                     from: 'teams',
//                     localField: 'projectDetails.team',
//                     foreignField: '_id',
//                     as: 'teamData'
//                 }
//             },
//             { $unwind: '$teamData' },
//             {
//                 $group: {
//                     _id: {
//                         teamid: "$teamData._id",
//                         team: "$teamData.teamname",
//                         employeeId: "$userDetails._id", 
//                         employeeName: { $concat: ["$userDetails.firstname", " ", "$userDetails.lastname"] },
//                         date: "$members.dates.date"
//                     },
//                     employee: {
//                         $first: {
//                             id: "$userDetails.owner",
//                             fullname: { $concat: ["$userDetails.firstname", " ", "$userDetails.lastname"] },
//                             initial: "$userDetails.initial",
//                             resource: "$userDetails.resource"
//                         }
//                     },
//                     date: { $first: "$members.dates.date" },
//                     status: { $first: "$members.dates.status" },
//                     totalHours: { $sum: "$members.dates.hours" },
//                     leaveData: { $first: "$leaveData" },
//                     wellnessData: { $first: "$wellnessData" },
//                     wfhData: { $first: "$wfhData" },
//                     eventData: { $first: "$eventData" }
//                 }
//             },
//             {
//                 $project: {
//                     employee: 1,
//                     date: 1,
//                     status: 1,
//                     totalHours: 1,
//                     leaveData: 1,
//                     wellnessData: 1,
//                     eventData: 1,
//                     wfhData: 1,
//                     teamid: "$_id.teamid",
//                     teamName: "$_id.team",
//                 }
//             },
//             { $sort: { "employee": 1, "date": 1, "teamData.index": 1  } }
//         ])
//         .catch((err) => {
//             console.error(err);
//             return res.status(500).json({ message: 'Error processing request', error: err.message });
//         });

//         const data = {
//             alldates: [],
//             teams: []
//         };


//         let currentDate = new Date(startOfWeek);
//         while (currentDate <= endOfRange) {
//             if (currentDate.getDay() !== 1 && currentDate.getDay() !== 0) {
//                 data.alldates.push(currentDate.toISOString().split('T')[0]);
//             }
//             currentDate.setDate(currentDate.getDate() + 1);
//         }

//         result.forEach(entry => {
//             const { teamName, teamid, employee, role, notes, date, status, totalHours,wfhData, leaveData, wellnessData, eventData, members } = entry;
//             const formattedDate = new Date(date).toISOString().split('T')[0];
        
//             let teamData = data.teams.find(team => team.name === teamName);
//             if (!teamData) {
//                 teamData = {
//                     teamid: teamid,
//                     name: teamName,
//                     members: []
//                 };
//                 data.teams.push(teamData);
//             }
        
//             let employeeData = teamData.members.find(emp => emp.name === employee.fullname);
//             if (!employeeData) {
//                 employeeData = {
//                     id: employee.id,
//                     name: employee.fullname,
//                     initial: employee.initial,
//                     resource: employee.resource,
//                     role: role,  // Include role
//                     notes: notes, // Include notes
//                     leave: [],
//                     wfh: entry.wfhData,
//                     wellness: wellnessData,
//                     event: [],
//                     dates: []
//                 };
        
//                 leaveData.forEach(leave => {
//                     employeeData.leave.push({
//                         leavestart: leave.leavestart,
//                         leaveend: leave.leaveend
//                     });
//                 });
        
//                 eventData.forEach(event => {
//                     employeeData.event.push({
//                         eventstart: event.startdate,
//                         eventend: event.enddate
//                     });
//                 });
        
//                 teamData.members.push(employeeData);
//             }
        
//             let dateEntry = employeeData.dates.find(d => d.date === formattedDate);
//             if (!dateEntry) {
//                 dateEntry = {
//                     date: formattedDate,
//                     totalhoursofjobcomponents: totalHours
//                 };
        
//                 employeeData.dates.push(dateEntry);
//             }
//         });

       
       
        

//         return res.json({ message: 'success', data });
//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ message: 'Error processing request', error: err.message });
//     }
// };


exports.getsuperadminjobcomponentdashboard = async (req, res) => {
    const { filterDate } = req.query;

    try {
        const referenceDate = filterDate ? moment.tz(new Date(filterDate), "Australia/Sydney") : moment.tz("Australia/Sydney");
        const startOfWeek = referenceDate.startOf("isoWeek").utc().toDate();
        const endOfRange = moment(startOfWeek).add(8, "weeks").subtract(1, "days").utc().toDate();

        const result = await Teams.aggregate([
            {
                $lookup: {
                    from: 'projects',
                    localField: '_id',
                    foreignField: 'team',
                    as: 'projects'
                }
            },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'members',
                    foreignField: 'owner',
                    as: 'memberDetails'
                }
            },
            {
                $lookup: {
                    from: 'projects',
                    let: { teamId: '$_id' },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $and: [
                                        { $eq: ['$team', '$$teamId'] },
                                        { $lte: ['$startdate', endOfRange] },
                                        { $gte: ['$deadlinedate', startOfWeek] }
                                    ]
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: 'jobcomponents',
                                localField: '_id',
                                foreignField: 'project',
                                as: 'jobComponents'
                            }
                        }
                    ],
                    as: 'activeProjects'
                }
            },
            {
                $unwind: {
                    path: '$memberDetails',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: 'leaves',
                    localField: 'memberDetails.owner',
                    foreignField: 'owner',
                    as: 'leaveData'
                }
            },
            {
            $lookup: {
                from: 'workfromhomes',
                let: { employeeId: '$memberDetails.owner' },
                pipeline: [
                {
                    $match: {
                    $expr: {
                        $and: [
                        { $eq: ['$owner', '$$employeeId'] },
                        { $eq: ['$status', 'Approved'] }
                        ]
                    }
                    }
                }
                ],
                as: 'wfhData'
            }
            },
            {
                $lookup: {
                    from: 'wellnessdays',
                    localField: 'memberDetails.owner',
                    foreignField: 'owner',
                    as: 'wellnessData'
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { teamId: '$_id' },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $and: [
                                        { $in: ['$$teamId', '$teams'] },
                                        { $lte: ['$startdate', endOfRange] },
                                        { $gte: ['$enddate', startOfWeek] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: 'eventData'
                }
            },
            {
                $group: {
                    _id: {
                        teamId: '$_id',
                        teamName: '$teamname',
                        memberId: '$memberDetails.owner',
                        index: '$index',
                    },
                    teamData: { $first: '$$ROOT' },
                    memberDetails: { $first: '$memberDetails' },
                    leaveData: { $first: '$leaveData' },
                    wfhData: { $first: '$wfhData' },
                    wellnessData: { $first: '$wellnessData' },
                    eventData: { $first: '$eventData' },
                    jobComponentsData: { 
                        $push: {
                            $reduce: {
                                input: '$activeProjects',
                                initialValue: [],
                                in: { 
                                    $concatArrays: [
                                        '$$value',
                                        '$$this.jobComponents'
                                    ]
                                }
                            }
                        }
                    }
                }
            },
            {
                $sort: { 
                    '_id.index': 1  
                }
            }
        ]);

        // Prepare response data structure
        const data = {
            alldates: [],
            teams: []
        };

        // Generate dates array
        let currentDate = moment.utc(startOfWeek);
        while (currentDate.isSameOrBefore(endOfRange, "day")) {
            if (currentDate.day() !== 6 && currentDate.day() !== 0) { // Exclude weekends
                data.alldates.push(currentDate.format("YYYY-MM-DD")); // Format correctly
            }
            currentDate.add(1, "day"); // Move to next day
        }

        // Process results
        result.forEach(entry => {
            const { _id, memberDetails, leaveData, wfhData, wellnessData, eventData, jobComponentsData } = entry;
        
            let teamData = data.teams.find(team => team.teamid.toString() === _id.teamId.toString());
            if (!teamData) {
                teamData = {
                    teamid: _id.teamId,
                    name: _id.teamName,
                    members: []
                };
                data.teams.push(teamData);
            }
        
            if (memberDetails) {
                let employeeData = {
                    id: memberDetails.owner,
                    name: `${memberDetails.firstname} ${memberDetails.lastname}`,
                    initial: memberDetails.initial,
                    resource: memberDetails.resource,
                    leave: leaveData || [],
                    wfh: wfhData || [],
                    wellness: wellnessData || [],
                    event: eventData || [],
                    dates: []
                };
        
                // Process job component dates
                if (Array.isArray(jobComponentsData)) {
                    jobComponentsData.flat().forEach(job => {
                        if (job && Array.isArray(job.members)) {
                            job.members.forEach(member => {
                                if (member && member.employee && memberDetails && memberDetails.owner) {
                                    try {
                                        const memberEmployeeId = member.employee.toString();
                                        const memberDetailsOwnerId = memberDetails.owner.toString();
        
                                        if (memberEmployeeId === memberDetailsOwnerId) {
                                            const dates = Array.isArray(member.dates) ? member.dates : [];
        
                                            dates.forEach(date => {
                                                if (date && date.date) {
                                                    const formattedDate = moment(date.date).format('YYYY-MM-DD');
                                                    let dateEntry = employeeData.dates.find(d => d.date === formattedDate);

                                                    if (!dateEntry) {
                                                        dateEntry = {
                                                            date: formattedDate,
                                                            totalhoursofjobcomponents: Number(date.hours) || 0
                                                        };
                                                        employeeData.dates.push(dateEntry);
                                                    } else {
                                                        dateEntry.totalhoursofjobcomponents += Number(date.hours) || 0;
                                                    }
                                                }
                                            });
                                        }
                                    } catch (err) {
                                        console.error('Error processing job component data:', err);
                                    }
                                }
                            });
                        }
                    });
                }
        
                // Move leave processing OUTSIDE the job component loop so it applies to all employees
                if (Array.isArray(employeeData.leave)) {
                    employeeData.leave.forEach(leave => {
                        // Only process approved leaves
                        if (leave.status === "Approved") {
                            const leaveStart = moment(leave.leavestart);
                            const leaveEnd = moment(leave.leaveend);

                            let remainingWorkHours = leave.workinghoursduringleave || 0;

                            for (let day = moment(leaveStart); day <= moment(leaveEnd); day.add(1, 'days')) {
                                if (day.day() !== 0 && day.day() !== 6) { // Skip weekends
                                    const formattedDate = day.format('YYYY-MM-DD');
                                    let dateEntry = employeeData.dates.find(d => d.date === formattedDate);

                                       let standardHours = 7.6;

                                        if(leave.wellnessdaycycle === true) {
                                            standardHours = 8.44
                                        }                                    
                                        let hoursForThisDay = standardHours;

                                    // If there are remaining work hours, allocate them to this day
                                    if (remainingWorkHours > 0) {
                                        if (remainingWorkHours >= standardHours) {
                                            hoursForThisDay = 0; // Full day's hours are work hours
                                            remainingWorkHours = Number((remainingWorkHours - standardHours).toFixed(2));
                                        } else {
                                            hoursForThisDay = Number((standardHours - remainingWorkHours).toFixed(2));
                                            remainingWorkHours = 0;
                                        }
                                    }

                                    if (!dateEntry) {
                                        dateEntry = {
                                            date: formattedDate,
                                            totalhoursofjobcomponents: Number(hoursForThisDay.toFixed(2))
                                        };
                                        employeeData.dates.push(dateEntry);
                                    } else {
                                        dateEntry.totalhoursofjobcomponents = Number(hoursForThisDay.toFixed(2));
                                    }
                                }
                            }
                        }
                    });
                }
                teamData.members.push(employeeData);
            }
        });

        return res.json({ message: 'success', data });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ 
            message: 'Error processing request', 
            error: err.message 
        });
    }
};

exports.getjobcomponentindividualrequest = async (req, res) => {
    const { id, email } = req.user;
    const { filterDate, teamid } = req.query;

    try {
        if (!teamid || !mongoose.Types.ObjectId.isValid(teamid)) {
            return res.status(400).json({ message: 'failed', data: 'Valid Team ID is required.' });
        }

        const referenceDate = filterDate 
            ? moment.tz(new Date(filterDate), "Australia/Sydney") 
            : moment.tz("Australia/Sydney");

        const startOfWeek = referenceDate.startOf("isoWeek").toDate();
        const endOfRange = moment(startOfWeek).add(8, "weeks").subtract(1, "days").toDate();

        const result = await Teams.aggregate([
            { 
                $match: { _id: new mongoose.Types.ObjectId(teamid) } 
            },
            {
                $lookup: {
                    from: 'userdetails', // Get all team members
                    localField: 'members',
                    foreignField: 'owner',
                    as: 'memberDetails'
                }
            },
            {
                $lookup: {
                    from: 'projects', // Get projects for this team
                    let: { teamId: '$_id' },
                    pipeline: [
                        {
                            $match: { 
                                $expr: { 
                                    $eq: ['$team', '$$teamId'] 
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: 'jobcomponents', 
                                localField: '_id', 
                                foreignField: 'project', 
                                as: 'jobComponents'
                            }
                        }
                    ],
                    as: 'activeProjects'
                }
            },
            {
                $lookup: {
                    from: 'leaves',
                    localField: 'memberDetails.owner',
                    foreignField: 'owner',
                    as: 'leaveData'
                }
            },
            {
                $lookup: {
                    from: 'workfromhomes',
                    localField: 'memberDetails.owner',
                    foreignField: 'owner',
                    as: 'wfhData'
                }
            },
            {
                $lookup: {
                    from: 'wellnessdays',
                    localField: 'memberDetails.owner',
                    foreignField: 'owner',
                    as: 'wellnessData'
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { teamId: '$_id' },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $in: ['$$teamId', '$teams'] 
                                }
                            }
                        }
                    ],
                    as: 'eventData'
                }
            },
            {
                $project: {
                    _id: 1,
                    teamname: 1,
                    memberDetails: 1,
                    leaveData: 1,
                    wfhData: 1,
                    wellnessData: 1,
                    eventData: 1,
                    jobComponentsData: {
                        $reduce: {
                            input: "$activeProjects",
                            initialValue: [],
                            in: { $concatArrays: ["$$value", "$$this.jobComponents"] }
                        }
                    }
                }
            }
        ]);

        if (!result || result.length === 0) {
            return res.json({ message: 'success', data: { alldates: [], teams: [] } });
        }

        const teamData = result[0]; // Since we query for one team, take the first result.

        const data = {
            alldates: [],
            teams: []
        };

        // Generate date range (weekdays only)
        let currentDate = moment.utc(startOfWeek);
        while (currentDate.isSameOrBefore(endOfRange, "day")) {
            if (currentDate.day() !== 6 && currentDate.day() !== 0) { // Exclude weekends
            data.alldates.push(currentDate.format("YYYY-MM-DD"));
            }
            currentDate.add(1, "day");
        }

        // Prepare the team structure
        let formattedTeam = {
            teamid: teamData._id,
            name: teamData.teamname,
            members: []
        };

        // Process each member
        teamData.memberDetails.forEach(member => {
            let employeeData = {
            id: member.owner,
            name: `${member.firstname} ${member.lastname}`,
            initial: member.initial,
            resource: member.resource,
            leave: teamData.leaveData.filter(l => l.owner.toString() === member.owner.toString() && l.status === "Approved") || [],
            wfh: teamData.wfhData.filter(w => w.owner.toString() === member.owner.toString() && w.status === "Approved") || [], 
            wellness: teamData.wellnessData.filter(wd => wd.owner.toString() === member.owner.toString()) || [],
            event: teamData.eventData || [],
            dates: []
            };

            // Initialize date structure
            const dates = data.alldates.map(date => ({
            date,
            totalhoursofjobcomponents: 0
            }));

            // Process leave data
            if (Array.isArray(employeeData.leave)) {
            employeeData.leave.forEach(leave => {
                // Only process approved leaves

                if (leave.status === "Approved") {
                const leaveStart = moment(leave.leavestart);
                const leaveEnd = moment(leave.leaveend);

                let remainingWorkHours = leave.workinghoursduringleave || 0;

                for (let day = moment(leaveStart); day <= moment(leaveEnd); day.add(1, 'days')) {
                    if (day.day() !== 0 && day.day() !== 6) { // Skip weekends
                    const formattedDate = day.format('YYYY-MM-DD');
                    let dateEntry = dates.find(d => d.date === formattedDate);

                                       let standardHours = 7.6;

                                        if(leave.wellnessdaycycle === true) {
                                            standardHours = 8.44
                                        }  
                    let hoursForThisDay = standardHours;

                    // If there are remaining work hours, allocate them to this day
                    if (remainingWorkHours > 0) {
                        if (remainingWorkHours >= standardHours) {
                        hoursForThisDay = 0; // Full day's hours are work hours
                        remainingWorkHours = Number((remainingWorkHours - standardHours).toFixed(2));
                        } else {
                        hoursForThisDay = Number((standardHours - remainingWorkHours).toFixed(2));
                        remainingWorkHours = 0;
                        }
                    }

                    if (dateEntry) {
                        dateEntry.totalhoursofjobcomponents = Number(hoursForThisDay.toFixed(2));
                    }
                    }
                }
                }
            });
            }

            // Add job component data (if exists)
            teamData.jobComponentsData.forEach(job => {
            if (job.members) {
                const memberData = job.members.find(m => m.employee && m.employee.toString() === member.owner.toString());
                if (memberData && memberData.dates) {
                memberData.dates.forEach(dateEntry => {
                    const existingDate = dates.find(d => moment(d.date).isSame(dateEntry.date, 'day'));
                    if (existingDate) {
                    existingDate.totalhoursofjobcomponents += dateEntry.hours || 0;
                    }
                });
                }
            }
            });

            employeeData.dates = dates;
            formattedTeam.members.push(employeeData);
        });

        // Sort members alphabetically
        formattedTeam.members.sort((a, b) => a.name.localeCompare(b.name));

        data.teams.push(formattedTeam);

        return res.json({ message: 'success', data });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            message: 'Error processing request',
            error: err.message
        });
    }
};

exports.getmanagerjobcomponentdashboard = async (req, res) => {
    const { id, email } = req.user;
    const { filterDate } = req.query;

    try {
        const referenceDate = filterDate ? moment.tz(new Date(filterDate), "Australia/Sydney") : moment.tz("Australia/Sydney");
        const startOfWeek = referenceDate.startOf("isoWeek").toDate();
        const endOfRange = moment(startOfWeek).add(8, "weeks").subtract(1, "days").toDate();
        
        const result = await Jobcomponents.aggregate([
            { 
                $match: { 
                    status: { $in: ["completed", "", null, 'unarchive', "On-going"] } 
                }
            },
            {
                $lookup: {
                    from: 'projects',
                    localField: 'project',
                    foreignField: '_id',
                    as: 'projectDetails'
                }
            },
            { $unwind: '$projectDetails' },
            {
                $match: {
                    $or: [
                        { 
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        },
                        {
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        }
                    ],
                    jobmanager: new mongoose.Types.ObjectId(id),
                }
            },
            { $unwind: "$members" },
            { $unwind: "$members.dates" },
            {
                $match: {
                    "members.dates.date": { $gte: startOfWeek, $lte: endOfRange }
                }
            },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'members.employee',
                    foreignField: 'owner',
                    as: 'userDetails'
                }
            },
            { $unwind: '$userDetails' },
            {
                $lookup: {
                    from: 'leaves',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', '$$employeeId'],
                                    $eq: ['$status', 'Approved'] 
                                } 
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                leavedates: {
                                    leavestart: "$leavestart",
                                    leaveend: "$leaveend"
                                }
                            }
                        }
                    ],
                    as: 'leaveData'
                }
            },
            {
                $lookup: {
                    from: 'wellnessdays',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', '$$employeeId'] } } },
                        {
                            $project: {
                                _id: 0,
                                wellnessdates: "$requestdate"
                            }
                        }
                    ],
                    as: 'wellnessData'
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { teamId: '$projectDetails.team' },
                    pipeline: [
                        { $match: { $expr: { $in: ['$$teamId', '$teams'] } } },
                        {
                            $project: {
                                _id: 0,
                                eventdates: {
                                    startdate: "$startdate",
                                    enddate: "$enddate"
                                }
                            }
                        }
                    ],
                    as: 'eventData'
                }
            },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'projectDetails.team',
                    foreignField: '_id',
                    as: 'teamData'
                }
            },
            { $unwind: '$teamData' },
            {
                $group: {
                    _id: {
                        teamid: "$teamData._id",
                        team: "$teamData.teamname",
                        employeeId: "$userDetails._id", 
                        employeeName: { $concat: ["$userDetails.firstname", " ", "$userDetails.lastname"] },
                        date: "$members.dates.date"
                    },
                    employee: {
                        $first: {
                            id: "$userDetails.owner",
                            fullname: { $concat: ["$userDetails.firstname", " ", "$userDetails.lastname"] },
                            initial: "$userDetails.initial",
                            resource: "$userDetails.resource"
                        }
                    },
                    date: { $first: "$members.dates.date" },
                    status: { $first: "$members.dates.status" },
                    totalHours: { $sum: "$members.dates.hours" },
                    leaveData: { $first: "$leaveData" },
                    wellnessData: { $first: "$wellnessData" },
                    eventData: { $first: "$eventData" },
                    project: { $first: "$projectDetails"}
                }
            },
            {
                $project: {
                    employee: 1,
                    date: 1,
                    status: 1,
                    totalHours: 1,
                    leaveData: 1,
                    wellnessData: 1,
                    eventData: 1,
                    project: 1,
                    teamid: "$_id.teamid",
                    teamName: "$_id.team",
                }
            },
            { $sort: { "teamName": 1, "employee": 1, "date": 1 } }
        ]);

        const data = {
            alldates: [],
            teams: []
        };


        let currentDate = new Date(startOfWeek);
        while (currentDate <= endOfRange) {
            if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
                data.alldates.push(currentDate.toISOString().split('T')[0]);
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        for (const temp of result) {

            const { project } = temp;
        
            const dateNow = new Date();
        
            if (dateNow > new Date(project.deadlinedate) && project.status === 'On-going' ) {
                const nextYearDate = new Date();
                nextYearDate.setFullYear(nextYearDate.getFullYear() + 1);
                const formattedDate = nextYearDate.toISOString().split('T')[0];

                try {
                  await Projects.findOneAndUpdate(
                        { _id: new mongoose.Types.ObjectId(project._id) },
                        { $set: { deadlinedate: formattedDate } }
                    );
                    
                } catch (err) {
                    console.error(`Error updating ${projectname.name} project deadline. Error: ${err}`);
                    return res.status(400).json({
                        message: "bad-request",
                        data: "There's a problem with the server! Please contact customer support for more details.",
                    });
                }
            }
        }

        result.forEach(entry => {
            const { teamName, teamid, employee, date, status, totalHours, leaveData, wellnessData, eventData} = entry;
            const formattedDate = new Date(date).toISOString().split('T')[0];

            let teamData = data.teams.find(team => team.name === teamName);
            if (!teamData) {
                teamData = {
                    teamid: teamid,
                    name: teamName,
                    members: []
                };
                data.teams.push(teamData);
            }

            let employeeData = teamData.members.find(emp => emp.name === employee.fullname);
            if (!employeeData) {
                employeeData = {
                    id: employee.id,
                    name: employee.fullname,
                    initial: employee.initial,
                    resource: employee.resource,
                    leave: [],
                    wellness: entry.wellnessData,
                    event: [],
                    dates: [],
                };
                entry.leaveData.forEach(leave => {
                    employeeData.leave.push({
                        leavestart: leave.leavedates.leavestart,
                        leaveend: leave.leavedates.leaveend
                    })
                })

                entry.eventData.forEach(event => {
                    employeeData.event.push({
                        eventstart: event.eventdates.startdate,
                        eventend: event.eventdates.enddate
                    })
                })

                teamData.members.push(employeeData);
            }

            let dateEntry = employeeData.dates.find(d => d.date === formattedDate);
            if (!dateEntry) {
                dateEntry = {
                    date: formattedDate,
                    totalhoursofjobcomponents: totalHours,
                };

                employeeData.dates.push(dateEntry);
            }
        });

        return res.json({ message: 'success', data });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error processing request', error: err.message });
    }
};

//  #endregion

//  #region MANAGER & EMPLOYEE

exports.individualworkload = async (req, res) => {
    const { id } = req.user;
    const { employeeid, filterDate } = req.query;
    try {
        // Use filterDate if provided; otherwise, default to today
        const referenceDate = filterDate ? moment.tz(new Date(filterDate), "Australia/Sydney") : moment.tz("Australia/Sydney");
        const startOfWeek = referenceDate.startOf("isoWeek").toDate();
        const endOfRange = moment(startOfWeek).add(8, "weeks").subtract(1, "days").toDate();

        // Find all teams the user is a member of
        let teams;
        if (!employeeid) {
            teams = await Teams.find({
                $or: [
                    { members: { $exists: true, $not: { $size: 0 } } },
                    { manager: { $exists: true, $ne: null } },
                    { directorpartner: { $exists: true, $ne: null } },
                    { associate: { $exists: true, $ne: null } },
                    { teamleader: { $exists: true, $ne: null } }
                ]
            }).lean();
        } else {
            teams = await Teams.find({
                $or: [
                    { members: new mongoose.Types.ObjectId(employeeid) },
                    { manager: new mongoose.Types.ObjectId(employeeid) },
                    { directorpartner: new mongoose.Types.ObjectId(employeeid) },
                    { associate: new mongoose.Types.ObjectId(employeeid) },
                    { teamleader: new mongoose.Types.ObjectId(employeeid) }
                ]
            }).lean();
        }
        const userDetails = await Userdetails.findOne({ owner: employeeid }).lean();

        // Build alldates (weekdays only)
        const dateList = [];
        let currentDate = new Date(startOfWeek);
        while (currentDate <= endOfRange) {
            const dayOfWeek = currentDate.getDay();
            if (dayOfWeek !== 6 && dayOfWeek !== 0) {
                dateList.push(new Date(currentDate).toISOString().split('T')[0]);
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

     if (!teams.length) {
            // Try to get userdetails anyway

        const leaveDates = (
            await Leave.find({ owner: employeeid, status: "Approved" }).lean()
        ).map(leave => ({
            ...leave,
            leavestart: leave.leavestart ? moment(leave.leavestart).format('YYYY-MM-DD') : null,
            leaveend: leave.leaveend ? moment(leave.leaveend).format('YYYY-MM-DD') : null
        }));

        const wfhDates = (
            await Workfromhome.find({ owner: employeeid, status: "Approved" }).select("requestdate requestend -_id").lean()
        ).map(wfh => ({
            requestdate: wfh.requestdate ? moment(wfh.requestdate).format('YYYY-MM-DD') : null,
            requestend: wfh.requestend ? moment(wfh.requestend).format('YYYY-MM-DD') : null
        }));

        const wellnessDates = (
            await Wellnessday.find({ owner: employeeid }).select("requestdate -_id").lean()
        ).map(wd => wd.requestdate ? moment(wd.requestdate).format('YYYY-MM-DD') : null);

            // Build alldates (weekdays only)
            const dateList = [];
            let currentDate = new Date(startOfWeek);
            while (currentDate <= endOfRange) {
            const dayOfWeek = currentDate.getDay();
            if (dayOfWeek !== 6 && dayOfWeek !== 0) {
                dateList.push(new Date(currentDate).toISOString().split('T')[0]);
            }
            currentDate.setDate(currentDate.getDate() + 1);
            }

            let membersArr = [];
            if (userDetails) {
            // Build leave overlay dates
            let userDates = [];
            if (Array.isArray(leaveDates)) {
                leaveDates.forEach(leave => {
                if (leave.status === "Approved") {
                    const startDate = moment(leave.leavestart);
                    const endDate = moment(leave.leaveend);
                    let remainingWorkHours = leave.workinghoursduringleave || 0;
                    for (let date = moment(startDate); date <= moment(endDate); date.add(1, 'days')) {
                    if (date.day() !== 0 && date.day() !== 6) {
                        let standardHours = 7.6;
                        if (leave.wellnessdaycycle === true) {
                        standardHours = 8.44;
                        }
                        let hoursForThisDay = standardHours;
                        if (remainingWorkHours > 0) {
                        if (remainingWorkHours >= standardHours) {
                            hoursForThisDay = 0;
                            remainingWorkHours = Number((remainingWorkHours - standardHours).toFixed(2));
                        } else {
                            hoursForThisDay = Number((standardHours - remainingWorkHours).toFixed(2));
                            remainingWorkHours = 0;
                        }
                        }
                        userDates.push({
                        date: date.format('YYYY-MM-DD'),
                        hours: Number(hoursForThisDay.toFixed(2)),
                        status: ['Leave']
                        });
                    }
                    }
                }
                });
            }
            // Fill userDates with 0-hour entries for all dates in dateList if not present
            const dateSet = new Set(userDates.map(d => d.date));
            dateList.forEach(dateStr => {
                if (!dateSet.has(dateStr)) {
                userDates.push({
                    date: dateStr,
                    hours: 0,
                    status: []
                });
                }
            });
            userDates.sort((a, b) => (a.date > b.date ? 1 : -1));
            membersArr.push({
                employee: {
                employeeid: [userDetails.owner?.toString()],
                fullname: `${userDetails.firstname} ${userDetails.lastname}`,
                initials: userDetails.initial
                },
                role: userDetails.role || "",
                leaveDates,
                wellnessDates,               
                wfhDates,
                dates: userDates
            });
            }

            return res.json({
            message: 'success',
            data: {
                alldates: dateList,
                yourworkload: [],
                members: membersArr
            }
            });
        }


        // Prepare all team IDs
        const teamIds = teams.map(team => team._id);

        // Find all projects for these teams within the date range
        const projects = await Projects.find({
            team: { $in: teamIds },
            $or: [
                { startdate: { $lte: endOfRange }, deadlinedate: { $gte: startOfWeek } },
                { startdate: { $lte: endOfRange }, deadlinedate: { $gte: startOfWeek } }
            ]
        }).lean();

        // Find all job components for these projects where the user is a member
        const projectIds = projects.map(p => p._id);
        // --- FIX: Only filter by employeeid if provided, else skip filter (for "all" mode) ---
        let jobComponentQuery = {
            project: { $in: projectIds },
            status: { $in: ["completed", "", null, "On-going"] }
        };
        if (employeeid) {
            jobComponentQuery.members = { $elemMatch: { employee: new mongoose.Types.ObjectId(employeeid) } };
        }
        const jobComponents = await Jobcomponents.find(jobComponentQuery)
            .populate([
                { path: 'project', model: 'Projects' },
                { path: 'jobmanager', model: 'Users' }
            ])
            .lean();

        // Get all needed details for job managers, clients, teams, etc.
        const jobManagerIds = jobComponents.map(jc => jc.jobmanager?._id || jc.jobmanager).filter(Boolean);
        const clientIds = projects.map(p => p.client).filter(Boolean);
        const teamDetailsMap = {};
        teams.forEach(team => { teamDetailsMap[team._id.toString()] = team; });

        // Get userdetails for job managers
        const jobManagerDetails = await Userdetails.find({ owner: { $in: jobManagerIds } }).lean();
        const jobManagerDetailsMap = {};
        jobManagerDetails.forEach(jm => { jobManagerDetailsMap[jm.owner.toString()] = jm; });

        // Get client details
        const clientDetails = await Clients.find({ _id: { $in: clientIds } }).lean();
        const clientDetailsMap = {};
        clientDetails.forEach(c => { clientDetailsMap[c._id.toString()] = c; });

        // Get team member details for initials
        const allTeamMemberIds = [].concat(...teams.map(t => t.members));
        const allTeamMemberDetails = await Userdetails.find({ owner: { $in: allTeamMemberIds } }).lean();
        const allTeamMemberDetailsMap = {};
        allTeamMemberDetails.forEach(m => { allTeamMemberDetailsMap[m.owner.toString()] = m; });

        // Get leave, wfh, wellness, event data for the user
        // Only get the date fields and format them (except for leave, which is used for calculations)
        const leaveDates = (
            await Leave.find({ owner: employeeid, status: "Approved" }).lean()
        ).map(leave => ({
            ...leave,
            leavestart: leave.leavestart ? moment(leave.leavestart).format('YYYY-MM-DD') : null,
            leaveend: leave.leaveend ? moment(leave.leaveend).format('YYYY-MM-DD') : null
        }));

        const wfhDates = (
            await Workfromhome.find({ owner: employeeid, status: "Approved" }).select("requestdate requestend -_id").lean()
        ).map(wfh => ({
            requestdate: wfh.requestdate ? moment(wfh.requestdate).format('YYYY-MM-DD') : null,
            requestend: wfh.requestend ? moment(wfh.requestend).format('YYYY-MM-DD') : null
        }));

        const wellnessDates = (
            await Wellnessday.find({ owner: employeeid }).select("requestdate -_id").lean()
        ).map(wd => wd.requestdate ? moment(wd.requestdate).format('YYYY-MM-DD') : null);

        // For events, get all events for all teams user is in, only dates
        const eventDates = (
            await Events.find({ teams: { $in: teamIds } }).select("startdate enddate -_id").lean()
        ).map(ev => ({
            startdate: ev.startdate ? moment(ev.startdate).format('YYYY-MM-DD') : null,
            enddate: ev.enddate ? moment(ev.enddate).format('YYYY-MM-DD') : null
        }));

        // Build yourworkload array
        const yourworkload = jobComponents.map(jc => {
            const project = jc.project || {};
            const team = teamDetailsMap[project.team?.toString()] || {};
            const jobmanager = jc.jobmanager;
            const jobmanagerDeets = jobManagerDetailsMap[jobmanager?._id?.toString() || jobmanager?.toString()] || {};
            const client = clientDetailsMap[project.client?.toString()] || {};

            // Team members initials
            const teammembers = (team.members || []).map(mid => {
                const m = allTeamMemberDetailsMap[mid.toString()];
                return m ? (m.initial || '') : '';
            });

            // Only include the current user's member entry
            const members = jc.members
                .filter(m => m.employee?.toString() === (employeeid || id))
                .map(member => {
                    // Dates: process leave overlays
                    let mappedMember = {
                        employee: member.employee,
                        role: member.role,
                        notes: member.notes,
                        dates: (member.dates ? member.dates.map(d => ({
                            ...d,
                            date: d.date ? moment(d.date).format('YYYY-MM-DD') : d.date
                        })) : []),
                        leaveDates,
                        wellnessDates,
                        eventDates,
                        wfhDates: wfhDates
                            ? wfhDates.map(wfh => ({
                                ...wfh,
                                requestdate: wfh.requestdate
                                    ? moment(wfh.requestdate).format('YYYY-MM-DD')
                                    : wfh.requestdate,
                                requestend: wfh.requestend
                                    ? moment(wfh.requestend).format('YYYY-MM-DD')
                                    : wfh.requestend
                            }))
                            : []
                    };

                    // Overlay leave on dates
                    if (Array.isArray(leaveDates)) {
                        leaveDates.forEach(leave => {
                            if (leave.status === "Approved") {
                                const startDate = moment(leave.leavestart);
                                const endDate = moment(leave.leaveend);
                                let remainingWorkHours = leave.workinghoursduringleave || 0;
                                for (let date = moment(startDate); date <= moment(endDate); date.add(1, 'days')) {
                                    if (date.day() !== 0 && date.day() !== 6) {
                                        const dateStr = date.format('YYYY-MM-DD');
                                        const existingDateIndex = mappedMember.dates.findIndex(d =>
                                            moment(d.date).format('YYYY-MM-DD') === dateStr
                                        );
                                        let standardHours = 7.6;

                                        if(leave.wellnessdaycycle === true) {
                                            standardHours = 8.44
                                        }
                                        let hoursForThisDay = standardHours;
                                        if (remainingWorkHours > 0) {
                                            if (remainingWorkHours >= standardHours) {
                                                hoursForThisDay = 0;
                                                remainingWorkHours = Number((remainingWorkHours - standardHours).toFixed(2));
                                            } else {
                                                hoursForThisDay = Number((standardHours - remainingWorkHours).toFixed(2));
                                                remainingWorkHours = 0;
                                            }
                                        }
                                        if (existingDateIndex >= 0) {
                                            mappedMember.dates[existingDateIndex].hours = Number(hoursForThisDay.toFixed(2));
                                        } else {
                                            mappedMember.dates.push({
                                                date: date.toDate(),
                                                hours: Number(hoursForThisDay.toFixed(2)),
                                                status: ['Leave']
                                            });
                                        }
                                    }
                                }
                            }
                        });
                    }
                    return mappedMember;
                });

            return {
                _id: jc._id,
                jobmanager: {
                    employeeid: jobmanager?._id || jobmanager,
                    fullname: jobmanagerDeets.firstname && jobmanagerDeets.lastname
                        ? `${jobmanagerDeets.firstname} ${jobmanagerDeets.lastname}`
                        : '',
                    initials: jobmanagerDeets.initial || ''
                },
                componentid: jc._id,
                clientid: client._id,
                clientname: client.clientname,
                clientpriority: client.priority,
                teamid: team._id,
                teamname: team.teamname,
                teammembers,
                projectname: project.projectname,
                jobno: project.jobno,
                jobcomponent: jc.jobcomponent,
                members
            };
        });

        // If no job components, still return members info for the user
        let membersArr = [];
        if (userDetails) {
            // Find all jobComponents for this user (if any)
            let userDates = [];
            jobComponents.forEach(jc => {
            jc.members
                .filter(m => m.employee?.toString() === (employeeid || id))
                .forEach(member => {
                if (Array.isArray(member.dates)) {
                    userDates = userDates.concat(
                    member.dates.map(d => ({
                        ...d,
                        date: d.date ? moment(d.date).format('YYYY-MM-DD') : d.date
                    }))
                    );
                }
                });
            });

            // Overlay leave on userDates
            if (Array.isArray(leaveDates)) {
            leaveDates.forEach(leave => {
                if (leave.status === "Approved") {
                const startDate = moment(leave.leavestart);
                const endDate = moment(leave.leaveend);
                let remainingWorkHours = leave.workinghoursduringleave || 0;
                for (let date = moment(startDate); date <= moment(endDate); date.add(1, 'days')) {
                    if (date.day() !== 0 && date.day() !== 6) {
                    const dateStr = date.format('YYYY-MM-DD');
                    const existingDateIndex = userDates.findIndex(d =>
                        moment(d.date).format('YYYY-MM-DD') === dateStr
                    );
                    let standardHours = 7.6;

                    if (leave.wellnessdaycycle === true) {
                        standardHours = 8.44;
                    }
                    let hoursForThisDay = standardHours;
                    if (remainingWorkHours > 0) {
                        if (remainingWorkHours >= standardHours) {
                        hoursForThisDay = 0;
                        remainingWorkHours = Number((remainingWorkHours - standardHours).toFixed(2));
                        } else {
                        hoursForThisDay = Number((standardHours - remainingWorkHours).toFixed(2));
                        remainingWorkHours = 0;
                        }
                    }
                    if (existingDateIndex >= 0) {
                        userDates[existingDateIndex].hours = Number(hoursForThisDay.toFixed(2));
                    } else {
                        userDates.push({
                        date: date.toDate(),
                        hours: Number(hoursForThisDay.toFixed(2)),
                        status: ['Leave']
                        });
                    }
                    }
                }
                }
            });
            }

            membersArr.push({
            employee: {
                employeeid: [userDetails.owner?.toString()],
                fullname: `${userDetails.firstname} ${userDetails.lastname}`,
                initials: userDetails.initial
            },
            role: userDetails.role || "",
            leaveDates,
            wellnessDates,
            eventDates,
            wfhDates,
            dates: userDates
            });
        }

        return res.json({
            message: 'success',
            data: {
                alldates: dateList,
                yourworkload,
                members: membersArr
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error processing request', error: err.message });
    }
};

//  #endergion
