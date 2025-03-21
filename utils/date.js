const moment = require('moment-timezone');

// Set default timezone to Australia/Sydney
moment.tz.setDefault('Australia/Sydney');

exports.formatDate = (dateString) => {
    return moment(dateString).tz('Australia/Sydney').format('DD/MM/YYYY');
};

exports.formatDateRange = (startDate, endDate) => {
    if (!startDate || !endDate) {
        return this.formatDate(startDate);
    }
    
    if (moment(startDate).tz('Australia/Sydney').isSame(endDate, 'day')) {
        return this.formatDate(startDate);
    }
    
    return `${this.formatDate(startDate)} until ${this.formatDate(endDate)}`;
};

exports.isMonday = (dateString) => {
    return moment(dateString).tz('Australia/Sydney').day() === 1;
};

exports.isTuesday = (dateString) => {
    return moment(dateString).tz('Australia/Sydney').day() === 2;
};

exports.isValidWellnessDay = (dateString) => {
    const day = moment(dateString).tz('Australia/Sydney').day();

    return day === 1 || day === 2; // 1 = Monday, 2 = Tuesday
};

exports.getCurrentFriday = () => {
    const today = moment().tz('Australia/Sydney');
    const friday = today.clone().day(5); // 5 represents Friday (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    
    // If today is Saturday or Sunday, get the Friday of the previous week
    if (today.day() === 6 || today.day() === 0) {
        friday.subtract(7, 'days');
    }
    
    return friday.startOf('day').toDate();
};

exports.getNextFriday = () => {
    const today = moment().tz('Australia/Sydney');
    const nextFriday = today.clone().day(12); // 12 represents next week's Friday (5 + 7)

    return nextFriday.startOf('day').toDate();
};