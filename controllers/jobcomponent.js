const { default: mongoose } = require("mongoose")
const Jobcomponents = require("../models/Jobcomponents")
const Projects = require("../models/Projects")
const moment = require('moment');
const Users = require("../models/Users");
const { sendmail } = require("../utils/email");
const Clients = require("../models/Clients");
const { getAllUserIdsExceptSender } = require("../utils/user");
const Teams = require("../models/Teams");
const Invoice = require("../models/invoice");
const Userdetails = require("../models/Userdetails");
const { formatCurrency } = require("../utils/currency");

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

    const startdate = new Date(start);
    const end = moment(start).add(1, 'years').toDate();
    let client = clientid;  // Initialize client before the if block
    let jobmanagerz
    if (!mongoose.Types.ObjectId.isValid(clientid)) {
        const clientExists = await Clients.findOne({ clientname: clientid });
    
        if (clientExists) {
            return res.status(400).json({ message: "failed", data: "Client already exists" });
        } else if (!clientid) {    
            return res.status(400).json({ message: "failed", data: "Please select a client" });
        } else if (clientid.length < 3) {
        try {
            const newClient = await Clients.create({ clientname: clientid, priority });
            client = newClient._id;  // Ensure `client` is assigned here
        } catch (err) {
            console.error("Error creating client:", err);
            return res.status(400).json({ message: "bad-request", data: "Server error! Contact support." });
        }
        } else {
            return res.status(400).json({ message: "failed", data: "Invalid client selection" });
        }
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

            emailDetails.push({
                jobcomponent,
                jobmanager: jobManager ? jobManager.fullname : "Unknown Manager",
                budgettype,
                estimatedbudget,
                members: members.map(m => `Employee: ${m.employeeid}, Role: ${m.role}`).join(", ")
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
        const emailContent = `Hello Team,\n\nThe job component "${jobName}" has been updated with new details:\n\n` +
            `Project Name: ${projectdata.name}\n` +
            `New Job Manager: ${jobmanagerid}\n\n` +
            `If you have any questions or concerns, please reach out.\n\nThank you!\n\nBest Regards,\n${email}`;

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
    const { jobcomponentid, projectid, jobmanagerid, members, budgettype, budget, adminnotes, jobcomponentname, clientid } = req.body;

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


    try {
        // Fetch the job component
        const jobcomponent = await Jobcomponents.findById(jobcomponentid);
        if (!jobcomponent) {
            return res.status(404).json({ message: "failed", data: "Job component not found" });
        }

        if(!mongoose.Types.ObjectId.isValid(projectid)){

            // check if projectname is existing
            const projectExists = await Projects.findOne({ projectname: projectid });

            if(projectExists){
                project = projectExists._id
                return res.status(400).json({ message: "failed", data: "Project already exists" });
            } else {   
                const data = await Projects.findOne({ _id: new mongoose.Types.ObjectId(jobcomponent.project) })
                
                const createProject = await Projects.create({
                    team: data.team,
                    jobno: data.jobno,
                    projectname: projectid,
                    client: new mongoose.Types.ObjectId('67c194c2849fe5b1c1e3b755'),
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
        await Jobcomponents.findByIdAndUpdate(jobcomponentid, {
            project: new mongoose.Types.ObjectId(project),
            client: new mongoose.Types.ObjectId('67c194c2849fe5b1c1e3b755'),
            jobmanager: jobmanagerid,
            budgettype: budgettype,
            estimatedbudget: budget,
            adminnotes: adminnotes,
            jobcomponent: jobcomponentname
        });

        // Ensure unique roles and update members
        const employeeRoleMap = new Map();
        for (const memberData of members) {
            const { employee, role, notes } = memberData;

            // Skip validation for null, undefined, or empty string employee
            if (!employee || employee.trim() === '') {
                continue;
            }

            // Convert employee to string for consistent comparison
            const employeeKey = employee.toString();

            if (employeeRoleMap.has(employeeKey)) {
                return res.status(400).json({
                    message: "failed",
                    data: `Employee ${employeeKey} cannot have more than one role.`,
                });
            }

            if ([...employeeRoleMap.values()].includes(role)) {
                return res.status(400).json({
                    message: "failed",
                    data: `The role "${role}" has already been assigned to another member.`,
                });
            }

            employeeRoleMap.set(employeeKey, role);

            const memberIndex = jobcomponent.members.findIndex(
                (m) => m.employee?.toString() === employeeKey
            );

            if (memberIndex !== -1) {
                // Update existing member's details
                jobcomponent.members[memberIndex].role = role;
                jobcomponent.members[memberIndex].notes = notes || jobcomponent.members[memberIndex].notes;
            } else {
                // Add new member
                if (jobcomponent.members.length >= 4) {
                    jobcomponent.members.shift(); // Maintain a maximum of 4 members
                }
                jobcomponent.members.push({
                    employee,
                    role,
                    notes: notes || "", // Allow null or empty notes
                    dates: [], // Reset dates
                });
            }
        }

        await jobcomponent.save()


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
        const emailContent = `
        Hello Team,
        
        The job component "${jobName}" has been updated with the following details:
        
        Project ID: ${projectid}
        Job Manager ID: ${jobmanagerid}
        
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

        console.log(claimamount)

        console.log(jobcomponent.budgettype)

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


        const emailContent = `Hello Team,

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
    const { jobcomponentid, employeeid, date, status, hours } = req.body;

    // Input validation
    if (!jobcomponentid) {
        return res.status(400).json({ message: "failed", data: "Please select a valid job component." });
    }
    if (!employeeid) {
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
            (m) => (m.employee ? m.employee.toString() : "") === employeeid
        );

        if (!member) {
            return res.status(404).json({ message: "failed", data: "Employee not found in the job component." });
        }

        // Check if the date already exists in the member's dates array
        const dateIndex = member.dates.findIndex(
            (d) => new Date(d.date).toDateString() === new Date(date).toDateString()
        );

        if (dateIndex !== -1) {
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
        const emailContent = `Hello Team,

        The job component "${jobComponent.jobcomponent}" has been updated.

        Employee: ${employeeid}
        Date: ${new Date(date).toDateString()}
        Status: ${(status || []).join(", ")}
        Hours: ${hours !== null ? hours : "Cleared"}

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
        const emailContent = `Hello Team,

        The job component "${jobComponent.jobcomponent}" has been updated.

        Employee: ${employeeid}
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
exports.listarchivedteamjobcomponent = async (req, res) => {
    const { id, email } = req.user;
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
            { $match: { 'projectDetails.team': new mongoose.Types.ObjectId(teamid)} },
            { $match: { status: "archived" } },
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
                                    initials: {
                                        $concat: [
                                            { $substr: [{ $ifNull: [{ $arrayElemAt: ['$userDetails.firstname', 0] }, ''] }, 0, 1] },
                                            { $substr: [{ $ifNull: [{ $arrayElemAt: ['$userDetails.lastname', 0] }, ''] }, 0, 1] }
                                        ]
                                    }
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
                    comments: { $first: '$comments' },
                    jobmanager: {
                        $first: {
                            employeeid: '$jobManagerDetails._id',
                            fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] },
                            initials: {
                            $concat: [
                                { $substr: ['$jobManagerDeets.firstname', 0, 1] }, 
                                { $substr: ['$jobManagerDeets.lastname', 0, 1] }  
                            ]
                        },
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
                                    initials: {
                                        $concat: [
                                            { $substr: [{ $ifNull: [{ $arrayElemAt: ['$userDetails.firstname', 0] }, ''] }, 0, 1] },
                                            { $substr: [{ $ifNull: [{ $arrayElemAt: ['$userDetails.lastname', 0] }, ''] }, 0, 1] }
                                        ]
                                    }
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
                            initials: {
                            $concat: [
                                { $substr: ['$jobManagerDeets.firstname', 0, 1] }, 
                                { $substr: ['$jobManagerDeets.lastname', 0, 1] }  
                            ]
                        },
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
    const { id, email } = req.user;
    const { teamid, search, filterdate } = req.query;

    if(!mongoose.Types.ObjectId.isValid(teamid)) {
        return res.status(400).json({ message: "failed", data: "Invalid team ID" });
    }

    const referenceDate = filterdate ? moment(new Date(filterdate)) : moment();
    const startOfWeek = referenceDate.startOf('isoWeek').toDate();
    const endOfRange = moment(startOfWeek).add(8, 'weeks').subtract(1, 'days').toDate();


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
            { $match: { 'projectDetails.team': new mongoose.Types.ObjectId(teamid)} },
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
            // {
            //     $addFields: {
            //         allDates: {
            //             $let: {
            //                 vars: {
            //                     startDate: "$projectDetails.startdate",
            //                     endDate: "$projectDetails.deadlinedate"
            //                 },
            //                 in: {
            //                     $map: {
            //                         input: {
            //                             $range: [
            //                                 0, // start from day 0
            //                                 { 
            //                                     $add: [
            //                                         { $divide: [{ $subtract: ["$$endDate", "$$startDate"] }, 86400000] },
            //                                         1
            //                                     ]
            //                                 } // end at the total number of days + 1 for inclusive range
            //                             ]
            //                         },
            //                         as: "daysFromStart",
            //                         in: {
            //                             $dateAdd: {
            //                                 startDate: "$$startDate",
            //                                 unit: "day",
            //                                 amount: "$$daysFromStart"
            //                             }
            //                         }
            //                     }
            //                 }
            //             }
            //         }
            //     }
            // },

            {
                "$addFields": {
                  "allDates": {
                    "$let": {
                      "vars": {
                        "startDate": startOfWeek,
                        "endDate": "$projectDetails.deadlinedate"
                      },
                      "in": {
                        "$filter": {
                          "input": {
                            "$map": {
                              "input": {
                                "$range": [
                                  0,
                                  {
                                    "$add": [
                                      { "$divide": [{ "$subtract": ["$$endDate", "$$startDate"] }, 86400000] },
                                      1
                                    ]
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
                              { "$ne": [{ "$dayOfWeek": "$$date" }, 1] }, // Exclude Sunday (1)
                              { "$ne": [{ "$dayOfWeek": "$$date" }, 7] }  // Exclude Saturday (7)
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
                                    initials: {
                                        $concat: [
                                            { $substr: [{ $ifNull: [{ $arrayElemAt: ['$userDetails.firstname', 0] }, ''] }, 0, 1] },
                                            { $substr: [{ $ifNull: [{ $arrayElemAt: ['$userDetails.lastname', 0] }, ''] }, 0, 1] }
                                        ]
                                    }
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
                            initials: {
                            $concat: [
                                { $substr: ['$jobManagerDeets.firstname', 0, 1] }, 
                                { $substr: ['$jobManagerDeets.lastname', 0, 1] }  
                            ]
                        },

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
                                    initials: {
                                        $concat: [
                                            { $substr: [{ $ifNull: [{ $arrayElemAt: ['$userDetails.firstname', 0] }, ''] }, 0, 1] },
                                            { $substr: [{ $ifNull: [{ $arrayElemAt: ['$userDetails.lastname', 0] }, ''] }, 0, 1] }
                                        ]
                                    }
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
                            initials: {
                            $concat: [
                                { $substr: ['$jobManagerDeets.firstname', 0, 1] }, 
                                { $substr: ['$jobManagerDeets.lastname', 0, 1] }  
                            ]
                        },
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
    const { id, email } = req.user;
    const { filterDate } = req.query; // Assuming the filter date is passed as a query parameter
    try {
        // Use filterDate if provided; otherwise, default to today
        const referenceDate = filterDate ? moment(new Date(filterDate)) : moment();
        const startOfWeek = referenceDate.startOf('isoWeek').toDate();
        const endOfRange = moment(startOfWeek).add(8, 'weeks').subtract(1, 'days').toDate(); // End date for eight weeks, Friday


        const result = await Jobcomponents.aggregate([
            {
                $match: {
                    members: {
                        $elemMatch: { 
                            employee: new mongoose.Types.ObjectId(id),
                        }
                    }
                }
            },
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
                        // Case 1: Project starts within the 2-week range and ends after the start of the range
                        { 
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        },
                        // Case 2: Project ends within the 2-week range and starts before the end of the range
                        {
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        }
                    ]
                }
            },       
            
            { $unwind: { preserveNullAndEmptyArrays: true, path: "$members.dates" } },
            // {
            //     $match: {
            //         "members.dates.date": { $gte: startOfWeek, $lte: endOfRange }
            //     }
            // },
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
                $lookup:{
                    from: "clients",
                    localField: "projectDetails.client",
                    foreignField: "_id",
                    as: "clientDetails"
                }
            },
            { $unwind: '$clientDetails'},
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
                $lookup: {
                   from: "userdetails",
                  localField: "teamDetails.members",
                  foreignField: "owner",
                  as: "memberDetails"
                }
              },
              
              {
                $addFields: {
                  userDetails: { "$ifNull": ["$userDetails", []] }
                }
              },
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
            {
                $addFields: {
                    members: {
                        $filter: {
                            input: '$members',
                            as: 'member',
                            cond: { $eq: ['$$member.employee', new mongoose.Types.ObjectId(id)] }
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'members.employee',
                    foreignField: '_id',
                    as: 'employeeDetails'
                }
            },
            { $unwind: '$employeeDetails' },
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
                    let: { employeeId: new mongoose.Types.ObjectId(id) },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', new mongoose.Types.ObjectId(id)] 
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
                    from: 'workfromhomes',
                    let: { employeeId: new mongoose.Types.ObjectId(id) },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', new mongoose.Types.ObjectId(id)] 
                                } 
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                requestdates: {
                                    requeststart: "$requestdate",
                                    requestend: "$requestend"
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
                    let: { employeeId: new mongoose.Types.ObjectId(id) },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', new mongoose.Types.ObjectId(id)] } } },
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
            { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    members: {
                        role: '$members.role',
                        employee: {
                            employeeid: '$members.employee',
                            fullname: { $concat: ['$userDetails.firstname', ' ', '$userDetails.lastname'] },
                            initials: { 
                                $concat: [
                                    { $substr: ['$userDetails.firstname', 0, 1] }, 
                                    { $substr: ['$userDetails.lastname', 0, 1] }
                                ]
                            }
                        },
                    },                 
                    'members.leaveDates': {
                        $filter: {
                            input: '$leaveData.leavedates',
                            as: 'leave',
                            cond: {
                                $and: [
                                    { $lte: ['$$leave.leavestart', '$projectDetails.deadlinedate'] }
                                ]
                            }
                        }
                    },
                    'members.wellnessDates': {
                        $filter: {
                            input: '$wellnessData.wellnessdates',
                            as: 'wellness',
                            cond: {
                                $and: [
                                    { $gte: ['$$wellness', '$projectDetails.startdate'] },
                                    { $lte: ['$$wellness', '$projectDetails.deadlinedate'] }
                                ]
                            }
                        }
                    },
                    'members.eventDates': {
                        $filter: {
                            input: '$eventData.eventdates',
                            as: 'event',
                            cond: {
                                $and: [
                                    { $lte: ['$$event.startdate', '$projectDetails.deadlinedate'] }
                                ]
                            }
                        }
                    },
                   'members.wfhDates': {
                        $filter: {
                            input: '$wfhData.requestdates',
                            as: 'wfh',
                            cond: {
                                $and: [
                                    { $lte: ['$$wfh.requeststart', '$projectDetails.deadlinedate'] }
                                ]
                            }
                        }
                    }
                }
            },            
            {
                $project: {
                    componentid: '$_id',
                    teamid: '$teamDetails._id',
                    teamname: '$teamDetails.teamname',
                    projectname: '$projectDetails.projectname',
                    clientname: "$clientDetails.clientname",
                    clientpriority: "$clientDetails.priority",
                    clientid: "$clientDetails._id",
                    jobno: '$projectDetails.jobno',
                    "teammembers": {
                        "$map": {
                          "input": "$memberDetails",
                          "as": "member",
                          "in": {
                            "$concat": [
                              { 
                                "$ifNull": [
                                  { "$substrCP": ["$$member.firstname", 0, 1] },
                                  ""
                                ]
                              },
                              { 
                                "$ifNull": [
                                  { "$substrCP": ["$$member.lastname", 0, 1] },
                                  ""
                                ]
                              }
                            ]
                          }
                        }
                      },
             
                
                    jobmanager: {
                        employeeid: '$jobManagerDetails._id',
                        fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] }
                    },
                    jobcomponent: '$jobcomponent',
                    members: 1
                }
            }
        ]);


        const dateList = [];
        let currentDate = new Date(startOfWeek);

        while (currentDate <= endOfRange) {
            const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
            if (dayOfWeek !== 1 && dayOfWeek !== 0) { // Only add weekdays (1-5)
                dateList.push(new Date(currentDate).toISOString().split('T')[0]); // Format as YYYY-MM-DD
            }
        
            currentDate.setDate(currentDate.getDate() + 1); // Move to the next day
        }

        // Assuming response.data is the current array of job data you received
        const data = {
            data: {
                alldates: dateList ,
                yourworkload: []
            }
        };

        // Extract all dates and unique members
        result.forEach(job => {

            // Restructure member data
            const members = job.members.map(member => ({
                employee: member.employee,
                role: member.role,
                notes: member.notes,
                dates: member.dates,
                leaveDates: member.leaveDates,
                wellnessDates: member.wellnessDates,
                eventDates: member.eventDates,
                wfhDates: member.wfhDates
            }));

            console.log(members)
            

            // Push members into the yourworkload array
            data.data.yourworkload.push({
                _id: job._id,
                jobmanager: job.jobmanager,
                componentid: job.componentid,
                clientid: job.clientid,
                clientname: job.clientname,
                clientpriority: job.clientpriority,
                teamid: job.teamid,
                teamname: job.teamname,
                teammembers: job.teammembers,
                projectname: job.projectname,
                jobno: job.jobno,
                jobcomponent: job.jobcomponent,
                members
            });

        });

        return res.json({ message: 'success', data: data.data });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error processing request', error: err.message });
    }
}

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
        const referenceDate = filterDate ? moment(new Date(filterDate)) : moment();
        const startOfWeek = referenceDate.startOf('isoWeek').toDate();
        const endOfRange = moment(startOfWeek).add(8, 'weeks').subtract(1, 'days').toDate();
        
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
        const referenceDate = filterDate ? moment(new Date(filterDate)) : moment();
        const startOfWeek = referenceDate.startOf('isoWeek').toDate();
        const endOfRange = moment(startOfWeek).add(8, 'weeks').subtract(1, 'days').toDate();

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
        let currentDate = new Date(startOfWeek);
        while (currentDate <= endOfRange) {
            if (currentDate.getDay() !== 0 && currentDate.getDay() !== 1) {
                data.alldates.push(currentDate.toISOString().split('T')[0]);
            }
            currentDate.setDate(currentDate.getDate() + 1);
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

                // Process job component hours
                // Safely process job component data with null checks and default values
                jobComponentsData.flat().forEach(job => {
                    // Check if job exists and has members
                    if (job && Array.isArray(job.members)) {
                        job.members.forEach(member => {
                            // Check if member and employee exist
                            if (member && member.employee && memberDetails && memberDetails.owner) {
                                try {
                                    const memberEmployeeId = member.employee.toString();
                                    const memberDetailsOwnerId = memberDetails.owner.toString();
                                    
                                    if (memberEmployeeId === memberDetailsOwnerId) {
                                        // Ensure dates array exists
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
                                    console.error('Error processing member data:', err);
                                }
                            }
                        });
                    }
                });

                // Ensure employeeData has dates array even if no data was processed
                if (!employeeData.dates) {
                    employeeData.dates = [];
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
        const referenceDate = filterDate ? moment(new Date(filterDate)) : moment();
        const startOfWeek = referenceDate.isoWeekday(1).toDate(); // forced to monday
        const endOfRange = moment(startOfWeek).add(1, 'year').subtract(1, 'days').toDate();

        const result = await Jobcomponents.aggregate([
            { 
                $match: { 
                    status: { $in: ["completed", "", null, "unarchive", "On-going"] } 
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
                    'projectDetails.team': new mongoose.Types.ObjectId(teamid),
                }
            },
            { $unwind: "$members" },
            { $unwind: { preserveNullAndEmptyArrays: true, path: "$members.dates" } },
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
                    wfhData: { $first: "$wfhData" },
                    eventData: { $first: "$eventData" },
                    project: { $first: "$projectDetails" },
                    members: { $push: "$members" }
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
                    wfhData: 1,
                    members: 1,
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
            const { teamName, teamid, employee, role, notes, date, status, totalHours, wfhData, leaveData, wellnessData, eventData, members } = entry;
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
                    role: role,  // Include role
                    notes: notes, // Include notes
                    leave: [],
                    wellness: wellnessData,
                    event: eventData,
                    wfh: wfhData,
                    dates: []
                };

                // wfhData.forEach(wfh => {
                //     employeeData.wfhs.push({
                //         requeststart: wfh.requeststart
                //     });
                // });
        
                leaveData.forEach(leave => {
                    if (leave && leave.leavedates) {
                        const leaveStart = new Date(leave.leavedates.leavestart);
                        const leaveEnd = new Date(leave.leavedates.leaveend);
                        
                        // Only include leaves that fall within the project timeline
                        if (leaveStart <= endOfRange && leaveEnd >= startOfWeek) {
                            employeeData.leave.push({
                                leavestart: leaveStart.toISOString().split('T')[0], // Format as YYYY-MM-DD
                                leaveend: leaveEnd.toISOString().split('T')[0]     // Format as YYYY-MM-DD
                            });
                        }
                    }
                });
                
                // Sort leaves by start date
                employeeData.leave.sort((a, b) => {
                    return new Date(a.leavestart) - new Date(b.leavestart);
                });
                
                // Remove duplicate leaves
                employeeData.leave = employeeData.leave.filter((leave, index, self) =>
                    index === self.findIndex((t) => (
                        t.leavestart === leave.leavestart && t.leaveend === leave.leaveend
                    ))
                );
        
                // eventData.forEach(event => {
                //     employeeData.event.push({
                //         eventstart: event.startdate,
                //         eventend: event.enddate
                //     });
                // });
        
                teamData.members.push(employeeData);
            }
        
            let dateEntry = employeeData.dates.find(d => d.date === formattedDate);
            if (!dateEntry) {
                dateEntry = {
                    date: formattedDate,
                    totalhoursofjobcomponents: totalHours
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

exports.getmanagerjobcomponentdashboard = async (req, res) => {
    const { id, email } = req.user;
    const { filterDate } = req.query;

    try {
        const referenceDate = filterDate ? moment(new Date(filterDate)) : moment();
        const startOfWeek = referenceDate.startOf('isoWeek').toDate();
        const endOfRange = moment(startOfWeek).add(8, 'weeks').subtract(1, 'days').toDate();
        
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
    const { id, email } = req.user;
    const { employeeid, filterDate } = req.query; // Assuming the filter date is passed as a query parameter
    try {
        // Use filterDate if provided; otherwise, default to today
        const referenceDate = filterDate ? moment(new Date(filterDate)) : moment();
        const startOfWeek = referenceDate.startOf('isoWeek').toDate();
        const endOfRange = moment(startOfWeek).add(8, 'weeks').subtract(1, 'days').toDate(); // End date for eight weeks, Friday

        // Calculate the total days between startOfWeek and endOfRange
        const totalDays = Math.ceil((endOfRange - startOfWeek) / (1000 * 60 * 60 * 24));

        const result = await Jobcomponents.aggregate([
            {
                $match: {
                    members: {
                        $elemMatch: { 
                            employee: new mongoose.Types.ObjectId(employeeid),
                        }
                    }
                }
            },
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
                        // Case 1: Project starts within the 2-week range and ends after the start of the range
                        { 
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        },
                        // Case 2: Project ends within the 2-week range and starts before the end of the range
                        {
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        }
                    ]
                }
            },       
            
            { $unwind: { preserveNullAndEmptyArrays: true, path: "$members.dates" } },
            // {
            //     $match: {
            //         "members.dates.date": { $gte: startOfWeek, $lte: endOfRange }
            //     }
            // },
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
                $lookup:{
                    from: "clients",
                    localField: "projectDetails.client",
                    foreignField: "_id",
                    as: "clientDetails"
                }
            },
            { $unwind: '$clientDetails'},
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
                $lookup: {
                   from: "userdetails",
                  localField: "teamDetails.members",
                  foreignField: "owner",
                  as: "memberDetails"
                }
              },
              
              {
                $addFields: {
                  userDetails: { "$ifNull": ["$userDetails", []] }
                }
              },
            {
                $addFields: {
                    isManager: {
                        $cond: {
                            if: { $eq: [new mongoose.Types.ObjectId(employeeid), '$teamDetails.manager'] },
                            then: true,
                            else: false
                        }
                    }
                }
            },
            {
                $addFields: {
                    members: {
                        $filter: {
                            input: '$members',
                            as: 'member',
                            cond: { $eq: ['$$member.employee', new mongoose.Types.ObjectId(employeeid)] }
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'members.employee',
                    foreignField: '_id',
                    as: 'employeeDetails'
                }
            },
            { $unwind: '$employeeDetails' },
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
                    let: { employeeId: new mongoose.Types.ObjectId(employeeid) },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', new mongoose.Types.ObjectId(employeeid)] 
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
                    from: 'workfromhomes',
                    let: { employeeId: new mongoose.Types.ObjectId(id) },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', new mongoose.Types.ObjectId(id)] 
                                } 
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                requestdates: {
                                    requeststart: "$requestdate",
                                    requestend: "$requestend"
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
                    let: { employeeId: new mongoose.Types.ObjectId(employeeid) },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', new mongoose.Types.ObjectId(employeeid)] } } },
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
            { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    members: {
                        role: '$members.role',
                        employee: {
                            employeeid: '$members.employee',
                            fullname: { $concat: ['$userDetails.firstname', ' ', '$userDetails.lastname'] },
                            initials: { 
                                $concat: [
                                    { $substr: ['$userDetails.firstname', 0, 1] }, 
                                    { $substr: ['$userDetails.lastname', 0, 1] }
                                ]
                            }
                        },
                    },
                    
                    'members.leaveDates': {
                        $filter: {
                            input: '$leaveData.leavedates',
                            as: 'leave',
                            cond: {
                                $and: [
                                    { $lte: ['$$leave.leavestart', '$projectDetails.deadlinedate'] }
                                ]
                            }
                        }
                    },
                    'members.wellnessDates': {
                        $filter: {
                            input: '$wellnessData.wellnessdates',
                            as: 'wellness',
                            cond: {
                                $and: [
                                    { $gte: ['$$wellness', '$projectDetails.startdate'] },
                                    { $lte: ['$$wellness', '$projectDetails.deadlinedate'] }
                                ]
                            }
                        }
                    },
                    'members.eventDates': {
                        $filter: {
                            input: '$eventData.eventdates',
                            as: 'event',
                            cond: {
                                $and: [
                                    { $lte: ['$$event.startdate', '$projectDetails.deadlinedate'] }
                                ]
                            }
                        }
                    },
                    'members.wfhDates': {
                        $filter: {
                            input: '$wfhData.requestdates',
                            as: 'wfh',
                            cond: {
                                $and: [
                                    { $lte: ['$$wfh.requeststart', '$projectDetails.deadlinedate'] }
                                ]
                            }
                        }
                    }
                }
            },            
            {
                $project: {
                    componentid: '$_id',
                    teamid: '$teamDetails._id',
                    teamname: '$teamDetails.teamname',
                    projectname: '$projectDetails.projectname',
                    clientname: "$clientDetails.clientname",
                    clientpriority: "$clientDetails.priority",
                    clientid: "$clientDetails._id",
                    jobno: '$projectDetails.jobno',
                    "teammembers": {
                        "$map": {
                          "input": "$memberDetails",
                          "as": "member",
                          "in": {
                            "$concat": [
                              { 
                                "$ifNull": [
                                  { "$substrCP": ["$$member.firstname", 0, 1] },
                                  ""
                                ]
                              },
                              { 
                                "$ifNull": [
                                  { "$substrCP": ["$$member.lastname", 0, 1] },
                                  ""
                                ]
                              }
                            ]
                          }
                        }
                      },
             
                
                    jobmanager: {
                        employeeid: '$jobManagerDetails._id',
                        fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] }
                    },
                    jobcomponent: '$jobcomponent',
                    members: 1
                }
            }
        ]);


        const dateList = [];
        let currentDate = new Date(startOfWeek);

        while (currentDate <= endOfRange) {
            const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
            if (dayOfWeek !== 1 && dayOfWeek !== 0) { // Only add weekdays (1-5)
                dateList.push(new Date(currentDate).toISOString().split('T')[0]); // Format as YYYY-MM-DD
            }
        
            currentDate.setDate(currentDate.getDate() + 1); // Move to the next day
        }

        // Assuming response.data is the current array of job data you received
        const data = {
            data: {
                alldates: dateList ,
                yourworkload: []
            }
        };

        // Extract all dates and unique members
        result.forEach(job => {

            // Restructure member data
            const members = job.members.map(member => ({
                employee: member.employee,
                role: member.role,
                notes: member.notes,
                dates: member.dates,
                leaveDates: member.leaveDates,
                wellnessDates: member.wellnessDates,
                eventDates: member.eventDates,
                wfhDates: member.wfhDates
            }));
            

            // Push members into the yourworkload array
            data.data.yourworkload.push({
                _id: job._id,
                jobmanager: job.jobmanager,
                componentid: job.componentid,
                clientid: job.clientid,
                clientname: job.clientname,
                clientpriority: job.clientpriority,
                teamid: job.teamid,
                teamname: job.teamname,
                teammembers: job.teammembers,
                projectname: job.projectname,
                jobno: job.jobno,
                jobcomponent: job.jobcomponent,
                members
            });
        });

        return res.json({ message: 'success', data: data.data });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error processing request', error: err.message });
    }
} 

//  #endergion
