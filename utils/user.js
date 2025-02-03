// ...existing code...

const Users = require("../models/Users");

exports.getAllUserIdsExceptSender = async (senderId) => {
    try {
        const users = await Users.find(); // Assume this function fetches all users from the database
        return users
            .filter(user => user._id !== senderId)
            .map(user => user._id);
    } catch (error) {
        console.error('Error fetching user IDs:', error);
        throw error;
    }
};

