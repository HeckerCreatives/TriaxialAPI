const { default: mongoose } = require("mongoose")
const Emails = require("../models/Email")
const Users = require("../models/Users")
const Userdetails = require("../models/Userdetails")

const formatEmailContent = (content) => {
    // Add proper indentation and line breaks
    return `
    ${content.trim().split('\n').map(line => `    ${line}`).join('\n')}
    
    Best Regards
    `;
}

exports.sendmail = async (sender, recipients, subject, content, isSuperAdmin = false) => {
    try {
        const emailContent = formatEmailContent(content);
        const notification = new Emails({
            sender: sender,
            receiver: recipients.map((receiverId) => ({
                userid: new mongoose.Types.ObjectId(receiverId),
            })),
            title: subject,
            content: emailContent,
        });

        await notification.save();
        return "success"
    } catch (err) {
        // Handle error
    }
};