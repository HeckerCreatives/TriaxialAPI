const { default: mongoose } = require("mongoose")
const Clients = require("../models/Clients")
const { sendmail } = require("../utils/email")
const { getAllUserIdsExceptSender } = require("../utils/user")

//  #region SUPERADMIN

exports.createclients = async (req, res) => {
    const {id, email} = req.user

    const {clientname, priority} = req.body

    if (!clientname){
        return res.status(400).json({message: "failed", data: "Enter a client name first!"})
    }
    else if (!priority){
        return res.status(400).json({message: "failed", data: "Select a priority first!"})
    }

    const clients = await Clients.findOne({clientname: { $regex: clientname, $options: 'i' }})
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting clients. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    if (clients){
        return res.status(400).json({message: "failed", data: "There's already an existing client. Please enter a different client!"})
    }

    await Clients.create({clientname: clientname, priority: priority})
    .catch(err => {
        console.log(`There's a problem saving clients. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    const sender = new mongoose.Types.ObjectId(id)

    const receivers = await getAllUserIdsExceptSender(id)
    
    await sendmail(
        sender, 
        receivers, 
        "New Client Creation Notification", 
        `Hello Team,\n\nA new client has been successfully added to our system.\n\nClient Name: ${clientname}\nPriority Level: ${priority}\n\nIf you have any questions or concerns regarding this client, please feel free to reach out.\n\nThank you!\n\nBest Regards,\n${email}`,
    );    
    return res.json({message: "success"})
}

exports.clientlist = async (req, res) => {
    const {id, email} = req.user

    const {page, limit, clientnamefilter} = req.query
    
    // Set pagination options
    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10,
    };

    const matchStage = {}

    if (clientnamefilter){
        matchStage["clientname"] = { $regex: clientnamefilter, $options: 'i' }
    }

    const clients = await Clients.find(matchStage)
    .skip(pageOptions.page * pageOptions.limit)
    .limit(pageOptions.limit)
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting clients list. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    const totalclients = await Clients.countDocuments(matchStage)
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting clients count. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    const data = {
        teamlist: [],
        totalpages: Math.ceil(totalclients / pageOptions.limit)
    }

    clients.forEach(tempdata => {
        const {_id, clientname, priority, createdAt} = tempdata

        data.teamlist.push({
            teamid: _id,
            clientname: clientname,
            priority: priority,
            createdAt: createdAt
        })
    })


    return res.json({message: "success", data: data})
}

exports.deleteclients = async (req, res) => {
    const { id, email } = req.user;
    const { clientId } = req.body;

    if (!clientId) {
        return res.status(400).json({ message: "failed", data: "Please select a client" });
    } else if (!Array.isArray(clientId)) {
        return res.status(400).json({ message: "failed", data: "Invalid selected clients" });
    }

    try {
        const clientsToDelete = await Clients.find({ _id: { $in: clientId } });

        if (clientsToDelete.length === 0) {
            return res.status(400).json({ message: "failed", data: "No clients found to delete" });
        }

        const clientNames = clientsToDelete.map(client => client.clientname);

        const deletedClients = await Clients.deleteMany({ _id: { $in: clientId } });

        if (deletedClients.deletedCount === 0) {
            return res.status(400).json({ message: "failed", data: "Failed to delete clients" });
        }

        const receivers = await getAllUserIdsExceptSender(id)

        const sender = new mongoose.Types.ObjectId(id);
        await sendmail(
            sender,
            receivers,
            "Client Deletion Notification",
            `Hello Team,\n\nThe following clients have been successfully removed from our system:\n\n${clientNames
                .map(name => `- ${name.clientname}`)
                .join('\n')}\n\nIf you have any questions or concerns about this action, please feel free to reach out.\n\nThank you!\n\nBest Regards,\n${email}`,
            true
        );

        return res.json({ message: "success" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "failed", data: "An error occurred while processing your request" });
    }
};


exports.getclientdata = async (req, res) => {
    const {id, email} = req.user

    const {clientid} = req.query

    if (!clientid){
        return res.status(400).json({message: "failed", data: "Please select a client"})
    }

    const client = await Clients.findOne({_id: new mongoose.Types.ObjectId(clientid)})
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting client data. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    const data = {
        clientname: client.clientname,
        priority: client.priority
    }

    return res.json({message: "success", data: data})
}

exports.editclient = async (req, res) => {
    const { id, email } = req.user;
    const { clientid, clientname, priority } = req.body;

    if (!clientid) {
        return res.status(400).json({ message: "failed", data: "Select a client first!" });
    } else if (!clientname) {
        return res.status(400).json({ message: "failed", data: "Enter a client name first!" });
    } else if (!priority) {
        return res.status(400).json({ message: "failed", data: "Select a priority first!" });
    }

    const updatedClient = await Clients.findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(clientid) },
        { clientname: clientname, priority: priority },
        { new: true }
    )
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem editing client ${clientid} (${clientname}). Error: ${err}`);
        return res.status(400).json({
            message: "bad-request",
            data: "There's a problem with the server! Please contact customer support for more details"
        });
    });

    if (!updatedClient) {
        return res.status(400).json({ message: "failed", data: "Client not found or failed to update" });
    }

    const sender = new mongoose.Types.ObjectId(id);

    const receivers = await getAllUserIdsExceptSender(id);

    await sendmail(
        sender,
        receivers,
        "Client Update Notification",
        `Hello Team,\n\nThe client has been successfully updated in our system.\n\nClient Name: ${updatedClient.clientname}\nPriority Level: ${updatedClient.priority}\n\nIf you have any questions or concerns regarding this update, please feel free to reach out.\n\nThank you!\n\nBest Regards,\n${email}`,
        true
    )
    .catch(err => {
        console.log(`Failed to send email notification for client ${clientid}. Error: ${err}`);
        return res.status(400).json({
            message: "bad-request",
            data: "Email notification failed! Please contact customer support for more details"
        });
    });

    return res.json({ message: "success" });
};

//  #endregion

//  #region SUPERADMIN & MANAGER

exports.clientlistall = async (req, res) => {
    const {id, email} = req.user
    
    const {clientname} = req.query

    

    const matchStage = {}

    if (clientname){
        matchStage["clientname"] = { $regex: clientname, $options: 'i' }
    }

    const clients = await Clients.find(matchStage)
  
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting clients list. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    const data = {
        clients: [],
    }

    clients.forEach(tempdata => {
        const {_id, clientname} = tempdata

        data.clients.push({
            clientid: _id,
            clientname: clientname,
        })
    })


    return res.json({message: "success", data: data})
}

//  #endregion